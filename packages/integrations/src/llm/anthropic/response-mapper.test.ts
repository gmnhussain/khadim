import type Anthropic from "@anthropic-ai/sdk";
import { LlmError } from "@khadim/core/llm/llm.errors";
import { describe, expect, it } from "vitest";

import { mapResponse, mapStreamEvent, mapUsage } from "./response-mapper";
import {
  buildMessage,
  buildTextBlock,
  buildThinkingBlock,
  buildToolUseBlock,
  buildUsage,
} from "./testing/anthropic-shapes";

function captureLlmError(action: () => unknown): LlmError {
  try {
    action();
  } catch (error) {
    if (error instanceof LlmError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected an LlmError");
}

describe("mapUsage", () => {
  it("maps fresh input, output, cache writes and cache reads", () => {
    expect(
      mapUsage(
        buildUsage({
          input_tokens: 12,
          output_tokens: 34,
          cache_creation_input_tokens: 560,
          cache_read_input_tokens: 7800,
        }),
      ),
    ).toEqual({ inputTokens: 12, outputTokens: 34, cacheWriteTokens: 560, cacheReadTokens: 7800 });
  });

  it("counts missing cache numbers as zero", () => {
    expect(
      mapUsage(buildUsage({ cache_creation_input_tokens: null, cache_read_input_tokens: null })),
    ).toMatchObject({ cacheWriteTokens: 0, cacheReadTokens: 0 });
  });
});

describe("mapResponse", () => {
  it("maps a final answer", () => {
    expect(mapResponse(buildMessage())).toEqual({
      content: [{ type: "text", text: "pong" }],
      stopReason: "end_turn",
      usage: { inputTokens: 100, outputTokens: 20, cacheWriteTokens: 0, cacheReadTokens: 0 },
    });
  });

  it("maps a stop sequence as a finished answer", () => {
    expect(mapResponse(buildMessage({ stop_reason: "stop_sequence" })).stopReason).toBe("end_turn");
  });

  it("maps tool calls, keeping the order of the blocks", () => {
    const response = mapResponse(
      buildMessage({
        stop_reason: "tool_use",
        content: [
          buildTextBlock("Checking."),
          buildToolUseBlock("toolu_1", "get_current_time", { timeZone: "UTC" }),
          buildToolUseBlock("toolu_2", "get_current_time", {}),
        ],
      }),
    );

    expect(response.stopReason).toBe("tool_calls");
    expect(response.content).toEqual([
      { type: "text", text: "Checking." },
      {
        type: "tool_call",
        toolCallId: "toolu_1",
        toolName: "get_current_time",
        input: { timeZone: "UTC" },
      },
      { type: "tool_call", toolCallId: "toolu_2", toolName: "get_current_time", input: {} },
    ]);
  });

  it("keeps a thinking block whole as an opaque reasoning part, empty text included", () => {
    const thinking = buildThinkingBlock("c2lnbmF0dXJl");

    const response = mapResponse(buildMessage({ content: [thinking, buildTextBlock("pong")] }));

    expect(response.content[0]).toEqual({
      type: "reasoning",
      providerId: "anthropic",
      payload: thinking,
    });
    expect(response.content[0]).toHaveProperty("payload", thinking);
    expect(response.content).toHaveLength(2);
  });

  it("keeps a redacted thinking block whole too", () => {
    const redacted: Anthropic.RedactedThinkingBlock = {
      type: "redacted_thinking",
      data: "ZW5jcnlwdGVk",
    };

    const response = mapResponse(buildMessage({ content: [redacted, buildTextBlock("pong")] }));

    expect(response.content[0]).toEqual({
      type: "reasoning",
      providerId: "anthropic",
      payload: redacted,
    });
  });

  it.each([
    ["refusal", "LLM_REFUSED"],
    ["max_tokens", "LLM_OUTPUT_TRUNCATED"],
    ["model_context_window_exceeded", "LLM_CONTEXT_EXCEEDED"],
  ] as const)(
    "throws the stop reason %s as %s, with the tokens the call used (plan D-8)",
    (stopReason, problem) => {
      const error = captureLlmError(() =>
        mapResponse(
          buildMessage({
            stop_reason: stopReason,
            usage: buildUsage({ input_tokens: 9, output_tokens: 3 }),
          }),
        ),
      );

      expect(error.problem).toBe(problem);
      expect(error.usage).toEqual({
        inputTokens: 9,
        outputTokens: 3,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
      });
    },
  );

  it("never returns the text of a cut-off answer (owner, 2026-11-12)", () => {
    const error = captureLlmError(() =>
      mapResponse(
        buildMessage({ stop_reason: "max_tokens", content: [buildTextBlock("The answer is")] }),
      ),
    );

    expect(JSON.stringify(error)).not.toContain("The answer is");
    expect(error.message).not.toContain("The answer is");
  });

  it.each(["pause_turn", null] as const)(
    "refuses the stop reason %s, which only server tools produce",
    (stopReason) => {
      const error = captureLlmError(() => mapResponse(buildMessage({ stop_reason: stopReason })));

      expect(error.problem).toBe("LLM_REQUEST_REJECTED");
      expect(error.reason).toBe("unexpected_stop_reason");
    },
  );

  it("refuses a content block this adapter never asks for", () => {
    const serverToolUse: Anthropic.ServerToolUseBlock = {
      type: "server_tool_use",
      id: "srvtoolu_1",
      name: "web_search",
      input: {},
      caller: { type: "direct" },
    };

    const error = captureLlmError(() => mapResponse(buildMessage({ content: [serverToolUse] })));

    expect(error.problem).toBe("LLM_REQUEST_REJECTED");
    expect(error.reason).toBe("unexpected_content_block");
  });

  it("keeps the call's usage on an unexpected content block, so its cost is recorded (I6, BR-23)", () => {
    const serverToolUse: Anthropic.ServerToolUseBlock = {
      type: "server_tool_use",
      id: "srvtoolu_1",
      name: "web_search",
      input: {},
      caller: { type: "direct" },
    };
    const usage = buildUsage({ input_tokens: 40, output_tokens: 9 });

    const error = captureLlmError(() =>
      mapResponse(buildMessage({ content: [serverToolUse], usage })),
    );

    expect(error.usage).toEqual({
      inputTokens: 40,
      outputTokens: 9,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
    });
  });
});

describe("mapStreamEvent", () => {
  it("maps the start of the message", () => {
    expect(mapStreamEvent({ type: "message_start", message: buildMessage() })).toEqual({
      type: "started",
    });
  });

  it("maps a text delta, and nothing for an empty one", () => {
    expect(
      mapStreamEvent({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "po" },
      }),
    ).toEqual({ type: "text_delta", text: "po" });
    expect(
      mapStreamEvent({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "" },
      }),
    ).toBeUndefined();
  });

  it("maps text that arrives in the start of a text block as a delta (I8)", () => {
    expect(
      mapStreamEvent({
        type: "content_block_start",
        index: 0,
        content_block: buildTextBlock("Hello"),
      }),
    ).toEqual({ type: "text_delta", text: "Hello" });
  });

  it("maps the start of a tool call with its id and name", () => {
    expect(
      mapStreamEvent({
        type: "content_block_start",
        index: 1,
        content_block: buildToolUseBlock("toolu_1", "get_current_time", {}),
      }),
    ).toEqual({ type: "tool_call_started", toolCallId: "toolu_1", toolName: "get_current_time" });
  });

  it("maps the start of a thinking block as reasoning, which is not emitted content (D-9 rule 2)", () => {
    expect(
      mapStreamEvent({
        type: "content_block_start",
        index: 0,
        content_block: buildThinkingBlock(""),
      }),
    ).toEqual({ type: "reasoning" });
    expect(
      mapStreamEvent({
        type: "content_block_start",
        index: 0,
        content_block: { type: "redacted_thinking", data: "" },
      }),
    ).toEqual({ type: "reasoning" });
  });

  it.each<[string, Anthropic.RawMessageStreamEvent]>([
    [
      "the start of a text block",
      { type: "content_block_start", index: 0, content_block: buildTextBlock("") },
    ],
    [
      "a thinking delta",
      { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "hm" } },
    ],
    [
      "a signature delta",
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "signature_delta", signature: "c2" },
      },
    ],
    [
      "a tool input delta",
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: '{"a"' },
      },
    ],
    ["the end of a block", { type: "content_block_stop", index: 0 }],
    ["the end of the message", { type: "message_stop" }],
  ])("maps nothing for %s", (_, event) => {
    expect(mapStreamEvent(event)).toBeUndefined();
  });
});
