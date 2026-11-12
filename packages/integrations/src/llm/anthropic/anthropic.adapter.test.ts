import { LlmError } from "@khadim/core/llm/llm.errors";
import type { LlmRequest, LlmStreamEvent } from "@khadim/core/llm/llm.types";
import { describe, expect, it } from "vitest";

import { createAnthropicProvider } from "./anthropic.adapter";
import {
  buildMessage,
  buildTextBlock,
  buildThinkingBlock,
  buildToolUseBlock,
  createScriptedFetch,
  errorBody,
  jsonResponse,
  sseEvent,
  sseEventsOf,
  sseResponse,
} from "./testing/anthropic-shapes";

const REQUEST: LlmRequest = {
  model: "claude-haiku-5-5",
  system: [{ text: "You are Khadim.", isStable: true }],
  tools: [],
  messages: [
    { role: "user", content: [{ type: "text", text: "Reply with exactly the word: pong" }] },
  ],
  maxOutputTokens: 16_000,
  timeoutMs: 120_000,
  effort: "low",
};

/** A key-shaped placeholder; no test sends it anywhere. */
const FAKE_API_KEY = "test-key-not-real";

function createProvider(responses: readonly (() => Response)[]) {
  const scripted = createScriptedFetch(responses);
  const provider = createAnthropicProvider({ apiKey: FAKE_API_KEY, fetch: scripted.fetch });
  return { provider, calls: scripted.calls };
}

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

describe("createAnthropicProvider", () => {
  it("declares its provider id and what it maps", () => {
    const { provider } = createProvider([]);

    expect(provider.providerId).toBe("anthropic");
    expect(provider.capabilities).toMatchObject({
      supportsTools: true,
      supportsStreaming: true,
      supportsPromptCaching: true,
    });
  });
});

describe("generate", () => {
  it("posts the mapped request to the Messages API and maps the answer", async () => {
    const { provider, calls } = createProvider([() => jsonResponse(buildMessage())]);

    const response = await provider.generate(REQUEST);

    expect(response).toEqual({
      content: [{ type: "text", text: "pong" }],
      stopReason: "end_turn",
      usage: { inputTokens: 100, outputTokens: 20, cacheWriteTokens: 0, cacheReadTokens: 0 },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      url: "https://api.anthropic.com/v1/messages",
      method: "POST",
      apiVersion: "2026-10-21",
      body: {
        model: "claude-haiku-5-5",
        max_tokens: 16_000,
        output_config: { effort: "low" },
        messages: [
          { role: "user", content: [{ type: "text", text: "Reply with exactly the word: pong" }] },
        ],
      },
    });
  });

  it("never sends a field current models reject (plan P-5)", async () => {
    const { provider, calls } = createProvider([() => jsonResponse(buildMessage())]);

    await provider.generate(REQUEST);

    const body = calls[0]?.body;
    for (const field of ["temperature", "top_p", "top_k", "tool_choice", "thinking"]) {
      expect(body).not.toHaveProperty(field);
    }
  });

  it.each([
    [429, "rate_limit_error", "LLM_RATE_LIMITED"],
    [529, "overloaded_error", "LLM_UNAVAILABLE"],
    [500, "api_error", "LLM_UNAVAILABLE"],
  ] as const)(
    "makes one HTTP call for a %i: the SDK's own retries are off (plan D-9)",
    async (status, type, problem) => {
      const { provider, calls } = createProvider([
        () => jsonResponse(errorBody(type), status, { "retry-after": "1" }),
        () => jsonResponse(buildMessage()),
      ]);

      const failure = await provider.generate(REQUEST).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(LlmError);
      expect(failure).toMatchObject({ problem });
      expect(calls).toHaveLength(1);
    },
  );

  it("carries the provider's retry delay on a rate limit", async () => {
    const { provider } = createProvider([
      () => jsonResponse(errorBody("rate_limit_error"), 429, { "retry-after": "20" }),
    ]);

    const failure = await provider.generate(REQUEST).catch((error: unknown) => error);

    expect(failure).toMatchObject({ problem: "LLM_RATE_LIMITED", retryAfterMs: 20_000 });
  });

  it("throws a refusal as LLM_REFUSED with the tokens it used (plan D-8)", async () => {
    const { provider } = createProvider([
      () => jsonResponse(buildMessage({ stop_reason: "refusal", content: [] })),
    ]);

    const failure = await provider.generate(REQUEST).catch((error: unknown) => error);

    expect(failure).toMatchObject({
      problem: "LLM_REFUSED",
      usage: { inputTokens: 100, outputTokens: 20 },
    });
  });

  it("maps a failed connection to LLM_UNAVAILABLE", async () => {
    const provider = createAnthropicProvider({
      apiKey: FAKE_API_KEY,
      fetch: () => Promise.reject(new TypeError("fetch failed")),
    });

    const failure = await provider.generate(REQUEST).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(LlmError);
    expect(failure).toMatchObject({ problem: "LLM_UNAVAILABLE" });
  });

  it("ends a call that runs past its timeout as LLM_UNAVAILABLE", async () => {
    const provider = createAnthropicProvider({
      apiKey: FAKE_API_KEY,
      fetch: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }),
    });

    const failure = await provider
      .generate({ ...REQUEST, timeoutMs: 20 })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(LlmError);
    expect(failure).toMatchObject({ problem: "LLM_UNAVAILABLE" });
  });
});

describe("stream", () => {
  it("reports the start, each text delta and the completed response", async () => {
    const message = buildMessage({ content: [buildTextBlock("one, two, three")] });
    const { provider, calls } = createProvider([() => sseResponse(sseEventsOf(message))]);

    const { events, failure } = await collect(provider.stream(REQUEST));

    expect(failure).toBeUndefined();
    expect(events).toEqual([
      { type: "started" },
      { type: "text_delta", text: "one, two, three" },
      {
        type: "completed",
        response: {
          content: [{ type: "text", text: "one, two, three" }],
          stopReason: "end_turn",
          usage: { inputTokens: 100, outputTokens: 20, cacheWriteTokens: 0, cacheReadTokens: 0 },
        },
      },
    ]);
    expect(calls[0]?.body).toMatchObject({ stream: true });
  });

  it("reports reasoning and a tool call, and returns the reasoning block whole with its signature", async () => {
    const thinking = buildThinkingBlock("c2lnbmF0dXJlLWJ5dGVz");
    const message = buildMessage({
      stop_reason: "tool_use",
      content: [thinking, buildToolUseBlock("toolu_1", "get_current_time", { timeZone: "UTC" })],
    });
    const { provider } = createProvider([() => sseResponse(sseEventsOf(message))]);

    const { events } = await collect(provider.stream(REQUEST));

    expect(events.slice(0, 3)).toEqual([
      { type: "started" },
      { type: "reasoning" },
      { type: "tool_call_started", toolCallId: "toolu_1", toolName: "get_current_time" },
    ]);
    expect(events.at(-1)).toEqual({
      type: "completed",
      response: {
        content: [
          { type: "reasoning", providerId: "anthropic", payload: thinking },
          {
            type: "tool_call",
            toolCallId: "toolu_1",
            toolName: "get_current_time",
            input: { timeZone: "UTC" },
          },
        ],
        stopReason: "tool_calls",
        usage: { inputTokens: 100, outputTokens: 20, cacheWriteTokens: 0, cacheReadTokens: 0 },
      },
    });
  });

  it("sends a received reasoning block back unchanged on the next request (owner, 2026-11-12)", async () => {
    const thinking = buildThinkingBlock("c2lnbmF0dXJlLWJ5dGVz");
    const first = buildMessage({
      stop_reason: "tool_use",
      content: [thinking, buildToolUseBlock("toolu_1", "get_current_time", {})],
    });
    const { provider, calls } = createProvider([
      () => sseResponse(sseEventsOf(first)),
      () => sseResponse(sseEventsOf(buildMessage())),
    ]);

    const firstRun = await collect(provider.stream(REQUEST));
    const completed = firstRun.events.at(-1);
    if (completed?.type !== "completed") {
      throw new Error("expected the first call to complete");
    }
    await collect(
      provider.stream({
        ...REQUEST,
        messages: [
          ...REQUEST.messages,
          { role: "assistant", content: completed.response.content },
          {
            role: "tool",
            content: [
              {
                type: "tool_result",
                toolCallId: "toolu_1",
                toolName: "get_current_time",
                isError: false,
                output: '{"utc":"2026-01-01T00:00:00.000Z"}',
              },
            ],
          },
        ],
      }),
    );

    expect(calls[1]?.body).toMatchObject({
      messages: [
        { role: "user" },
        {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "", signature: "c2lnbmF0dXJlLWJ5dGVz" },
            { type: "tool_use", id: "toolu_1", name: "get_current_time", input: {} },
          ],
        },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1" }] },
      ],
    });
    // The first two messages of the second request are exactly the first request's history.
    const firstBody = calls[0]?.body as { messages: unknown[]; system: unknown };
    const secondBody = calls[1]?.body as { messages: unknown[]; system: unknown };
    expect(secondBody.messages.slice(0, firstBody.messages.length)).toEqual(firstBody.messages);
    expect(secondBody.system).toEqual(firstBody.system);
  });

  it("fails after the text it already reported when the answer is cut off at its maximum output", async () => {
    const message = buildMessage({
      stop_reason: "max_tokens",
      content: [buildTextBlock("Rivers are")],
    });
    const { provider } = createProvider([() => sseResponse(sseEventsOf(message))]);

    const { events, failure } = await collect(provider.stream(REQUEST));

    expect(events).toEqual([{ type: "started" }, { type: "text_delta", text: "Rivers are" }]);
    expect(failure).toBeInstanceOf(LlmError);
    expect(failure).toMatchObject({
      problem: "LLM_OUTPUT_TRUNCATED",
      usage: { inputTokens: 100, outputTokens: 20 },
    });
  });

  it("maps an error event in the middle of a stream, after what was already reported", async () => {
    const message = buildMessage({ content: [buildTextBlock("Half an ans")] });
    const events = sseEventsOf(message).slice(0, 4);
    events.push(
      `event: error\ndata: ${JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } })}\n\n`,
    );
    const { provider, calls } = createProvider([() => sseResponse(events)]);

    const result = await collect(provider.stream(REQUEST));

    expect(result.events).toEqual([
      { type: "started" },
      { type: "text_delta", text: "Half an ans" },
    ]);
    expect(result.failure).toBeInstanceOf(LlmError);
    expect(result.failure).toMatchObject({ problem: "LLM_UNAVAILABLE" });
    expect(calls).toHaveLength(1);
  });

  it("maps a rate limit before the stream starts, with one HTTP call", async () => {
    const { provider, calls } = createProvider([
      () => jsonResponse(errorBody("rate_limit_error"), 429, { "retry-after": "3" }),
      () => sseResponse(sseEventsOf(buildMessage())),
    ]);

    const { events, failure } = await collect(provider.stream(REQUEST));

    expect(events).toEqual([]);
    expect(failure).toMatchObject({ problem: "LLM_RATE_LIMITED", retryAfterMs: 3000 });
    expect(calls).toHaveLength(1);
  });

  it("ignores pings and other metadata", async () => {
    const events = [sseEvent({ type: "ping" }), ...sseEventsOf(buildMessage())];
    const { provider } = createProvider([() => sseResponse(events)]);

    const result = await collect(provider.stream(REQUEST));

    expect(result.events.map((event) => event.type)).toEqual([
      "started",
      "text_delta",
      "completed",
    ]);
  });
});
