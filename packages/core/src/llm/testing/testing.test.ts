import { describe, expect, it } from "vitest";

import { LlmError } from "../llm.errors";
import type { LlmRequest, LlmResponse, LlmStreamEvent } from "../llm.types";
import { createFakeLlmProvider } from "./fake-llm-provider";
import { createTextResponse, createToolCallResponse, FAKE_LLM_USAGE } from "./fake-llm-responses";

const REQUEST: LlmRequest = {
  model: "claude-haiku-5-5",
  system: [{ text: "You are Khadim.", isStable: true }],
  tools: [],
  messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
  maxOutputTokens: 16_000,
  timeoutMs: 120_000,
};

async function collect(stream: AsyncIterable<LlmStreamEvent>) {
  const events: LlmStreamEvent[] = [];
  let failure: unknown;
  try {
    for await (const event of stream) {
      events.push(event);
    }
  } catch (error) {
    failure = error;
  }
  return { events, failure };
}

describe("createTextResponse and createToolCallResponse", () => {
  it("builds a final answer", () => {
    expect(createTextResponse("Hi")).toEqual({
      content: [{ type: "text", text: "Hi" }],
      stopReason: "end_turn",
      usage: FAKE_LLM_USAGE,
    });
  });

  it("builds a response that asks for tools, with the usage a test gives it", () => {
    const usage = { inputTokens: 1, outputTokens: 2, cacheWriteTokens: 3, cacheReadTokens: 4 };

    expect(
      createToolCallResponse(
        [{ toolCallId: "call_1", toolName: "get_current_time", input: {} }],
        usage,
      ),
    ).toEqual({
      content: [
        { type: "tool_call", toolCallId: "call_1", toolName: "get_current_time", input: {} },
      ],
      stopReason: "tool_calls",
      usage,
    });
  });
});

describe("createFakeLlmProvider", () => {
  it("declares a provider id and capabilities, which a test can replace", () => {
    const defaults = createFakeLlmProvider({ steps: [] }).provider;
    const custom = createFakeLlmProvider({
      steps: [],
      providerId: "local",
      capabilities: { ...defaults.capabilities, supportsTools: false },
    }).provider;

    expect(defaults.providerId).toBe("fake");
    expect(defaults.capabilities.supportsTools).toBe(true);
    expect(custom.providerId).toBe("local");
    expect(custom.capabilities.supportsTools).toBe(false);
  });

  it("replays its script in order and records each request", async () => {
    const first = createTextResponse("one");
    const second = createTextResponse("two");
    const fake = createFakeLlmProvider({
      steps: [
        { kind: "response", response: first },
        { kind: "response", response: second },
      ],
    });

    await expect(fake.provider.generate(REQUEST)).resolves.toBe(first);
    await expect(fake.provider.generate({ ...REQUEST, model: "other" })).resolves.toBe(second);
    expect(fake.requests.map((request) => request.model)).toEqual(["claude-haiku-5-5", "other"]);
  });

  it("rejects generate with the scripted error", async () => {
    const error = new LlmError("LLM_RATE_LIMITED", { retryAfterMs: 5000 });
    const fake = createFakeLlmProvider({ steps: [{ kind: "failure", error }] });

    await expect(fake.provider.generate(REQUEST)).rejects.toBe(error);
  });

  it("streams a response as start, one event per part, then completed", async () => {
    const response: LlmResponse = {
      content: [
        { type: "reasoning", providerId: "fake", payload: { signature: "abc" } },
        { type: "text", text: "Checking the time." },
        { type: "tool_call", toolCallId: "call_1", toolName: "get_current_time", input: {} },
      ],
      stopReason: "tool_calls",
      usage: FAKE_LLM_USAGE,
    };
    const fake = createFakeLlmProvider({ steps: [{ kind: "response", response }] });

    const { events, failure } = await collect(fake.provider.stream(REQUEST));

    expect(failure).toBeUndefined();
    expect(events).toEqual([
      { type: "started" },
      { type: "reasoning" },
      { type: "text_delta", text: "Checking the time." },
      { type: "tool_call_started", toolCallId: "call_1", toolName: "get_current_time" },
      { type: "completed", response },
    ]);
  });

  it("fails a stream before any event when the script says so", async () => {
    const error = new LlmError("LLM_UNAVAILABLE");
    const fake = createFakeLlmProvider({ steps: [{ kind: "failure", error }] });

    const { events, failure } = await collect(fake.provider.stream(REQUEST));

    expect(events).toEqual([]);
    expect(failure).toBe(error);
  });

  it("fails a stream after the scripted events: a partial stream", async () => {
    const error = new LlmError("LLM_UNAVAILABLE");
    const eventsBeforeFailure: LlmStreamEvent[] = [
      { type: "started" },
      { type: "text_delta", text: "Half an ans" },
    ];
    const fake = createFakeLlmProvider({
      steps: [{ kind: "failure", error, eventsBeforeFailure }],
    });

    const { events, failure } = await collect(fake.provider.stream(REQUEST));

    expect(events).toEqual(eventsBeforeFailure);
    expect(failure).toBe(error);
  });

  it("shares one script between generate and stream", async () => {
    const fake = createFakeLlmProvider({
      steps: [
        { kind: "response", response: createTextResponse("one") },
        { kind: "response", response: createTextResponse("two") },
      ],
    });

    await fake.provider.generate(REQUEST);
    const { events } = await collect(fake.provider.stream(REQUEST));

    expect(events.at(-1)).toMatchObject({ type: "completed" });
    expect(events).toContainEqual({ type: "text_delta", text: "two" });
  });

  it("refuses a call the script has no step for, and still records the request", async () => {
    const fake = createFakeLlmProvider({ steps: [] });

    const { failure } = await collect(fake.provider.stream(REQUEST));

    expect(failure).toEqual(new Error("fake LLM provider has no step for call 1"));
    expect(fake.requests).toHaveLength(1);
  });

  it("does nothing until a stream is read, like a real adapter (L16)", async () => {
    const fake = createFakeLlmProvider({
      steps: [{ kind: "response", response: createTextResponse("one") }],
    });

    const unread = fake.provider.stream(REQUEST);
    expect(fake.requests).toEqual([]);

    const { events } = await collect(unread);
    expect(fake.requests).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ type: "completed" });
  });

  it("fails a scripted stream while it is read, not when it is created", () => {
    const fake = createFakeLlmProvider({
      steps: [{ kind: "failure", error: new LlmError("LLM_UNAVAILABLE") }],
    });

    expect(() => fake.provider.stream(REQUEST)).not.toThrow();
  });
});
