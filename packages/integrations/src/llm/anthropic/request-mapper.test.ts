import { LlmError } from "@khadim/core/llm/llm.errors";
import type { LlmMessage, LlmRequest } from "@khadim/core/llm/llm.types";
import { describe, expect, it } from "vitest";

import { isReasoningBlock, mapRequest } from "./request-mapper";
import { buildThinkingBlock } from "./testing/anthropic-shapes";

const TIME_TOOL = {
  name: "get_current_time",
  description: "Returns the current date and time.",
  inputJsonSchema: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: { timeZone: { type: "string", maxLength: 64, description: "IANA time zone." } },
    additionalProperties: false,
  },
};

function request(overrides: Partial<LlmRequest> = {}): LlmRequest {
  return {
    model: "claude-haiku-5-5",
    system: [{ text: "You are Khadim.", isStable: true }],
    tools: [],
    messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
    maxOutputTokens: 16_000,
    timeoutMs: 120_000,
    ...overrides,
  };
}

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

describe("mapRequest", () => {
  it("maps the model, the maximum output and a user message", () => {
    expect(mapRequest(request())).toEqual({
      model: "claude-haiku-5-5",
      max_tokens: 16_000,
      system: [{ type: "text", text: "You are Khadim.", cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
    });
  });

  it("never sends a field current models reject (plan P-5)", () => {
    const mapped = mapRequest(request({ tools: [TIME_TOOL], effort: "low" }));

    for (const field of ["temperature", "top_p", "top_k", "tool_choice", "thinking", "stream"]) {
      expect(mapped).not.toHaveProperty(field);
    }
    expect(Object.keys(mapped).sort()).toEqual([
      "max_tokens",
      "messages",
      "model",
      "output_config",
      "system",
      "tools",
    ]);
  });

  it("adds no message of its own: no assistant prefill (plan P-5)", () => {
    const mapped = mapRequest(request());

    expect(mapped.messages).toHaveLength(1);
    expect(mapped.messages.at(-1)?.role).toBe("user");
  });

  it("sends the task's effort, and nothing when the route sets none", () => {
    expect(mapRequest(request({ effort: "medium" })).output_config).toEqual({ effort: "medium" });
    expect(mapRequest(request())).not.toHaveProperty("output_config");
  });

  it("leaves out system and tools when there are none", () => {
    const mapped = mapRequest(request({ system: [] }));

    expect(mapped).not.toHaveProperty("system");
    expect(mapped).not.toHaveProperty("tools");
  });

  it("gives the same request for the same input, so the cached prefix stays stable", () => {
    const input = request({ tools: [TIME_TOOL] });

    expect(JSON.stringify(mapRequest(input))).toBe(JSON.stringify(mapRequest(input)));
  });
});

describe("mapRequest: prompt caching (conventions §15.2)", () => {
  it("marks the last part of the stable prefix, and only it", () => {
    const mapped = mapRequest(
      request({
        system: [
          { text: "Prompt.", isStable: true },
          { text: "Profile.", isStable: true },
          { text: "Retrieved memory.", isStable: false },
        ],
      }),
    );

    expect(mapped.system).toEqual([
      { type: "text", text: "Prompt." },
      { type: "text", text: "Profile.", cache_control: { type: "ephemeral" } },
      { type: "text", text: "Retrieved memory." },
    ]);
  });

  it("marks nothing when the first part is not stable", () => {
    const mapped = mapRequest(
      request({
        system: [
          { text: "Changes every call.", isStable: false },
          { text: "Prompt.", isStable: true },
        ],
      }),
    );

    expect(mapped.system).toEqual([
      { type: "text", text: "Changes every call." },
      { type: "text", text: "Prompt." },
    ]);
  });
});

describe("mapRequest: tools (plan D-3)", () => {
  it("sends each tool as a strict tool with its name, description and schema", () => {
    const [tool] = mapRequest(request({ tools: [TIME_TOOL] })).tools ?? [];

    expect(tool).toMatchObject({
      name: "get_current_time",
      description: "Returns the current date and time.",
      strict: true,
      input_schema: { type: "object", additionalProperties: false },
    });
  });

  it("moves keywords strict schemas reject into the description, and drops $schema", () => {
    const [tool] = mapRequest(request({ tools: [TIME_TOOL] })).tools ?? [];

    expect(tool).toMatchObject({
      input_schema: {
        properties: {
          timeZone: { type: "string", description: "IANA time zone.\n\n{maxLength: 64}" },
        },
      },
    });
    expect(JSON.stringify(tool)).not.toContain("$schema");
    expect(JSON.stringify(tool)).not.toContain('"maxLength"');
  });

  it("keeps enum and const in the strict schema (review fixes, D-8)", () => {
    const tool = {
      name: "share_post",
      description: "Shares a post.",
      inputJsonSchema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          platform: { type: "string", enum: ["linkedin", "facebook"] },
          kind: { type: "string", const: "post" },
        },
        required: ["platform", "kind"],
        additionalProperties: false,
      },
    };

    const [mapped] = mapRequest(request({ tools: [tool] })).tools ?? [];

    expect(mapped).toMatchObject({
      input_schema: {
        properties: {
          platform: { type: "string", enum: ["linkedin", "facebook"] },
          kind: { type: "string", const: "post" },
        },
      },
    });
  });

  it("does not change a frozen tool schema", () => {
    const schema = Object.freeze({
      type: "object",
      properties: Object.freeze({ text: Object.freeze({ type: "string", maxLength: 5 }) }),
      additionalProperties: false,
    });

    expect(() =>
      mapRequest(
        request({ tools: [{ name: "save_note", description: "Saves.", inputJsonSchema: schema }] }),
      ),
    ).not.toThrow();
    expect(schema.properties.text).toEqual({ type: "string", maxLength: 5 });
  });

  it("does not change the tool definition it was given", () => {
    const before = JSON.stringify(TIME_TOOL);

    mapRequest(request({ tools: [TIME_TOOL] }));

    expect(JSON.stringify(TIME_TOOL)).toBe(before);
  });
});

describe("mapRequest: history", () => {
  it("maps an assistant turn block by block, in order", () => {
    const messages: LlmMessage[] = [
      { role: "user", content: [{ type: "text", text: "Time?" }] },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Checking." },
          { type: "tool_call", toolCallId: "toolu_1", toolName: "get_current_time", input: {} },
        ],
      },
    ];

    expect(mapRequest(request({ messages })).messages[1]).toEqual({
      role: "assistant",
      content: [
        { type: "text", text: "Checking." },
        { type: "tool_use", id: "toolu_1", name: "get_current_time", input: {} },
      ],
    });
  });

  it("sends every tool result of a step in one user message, errors flagged", () => {
    const messages: LlmMessage[] = [
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
          {
            type: "tool_result",
            toolCallId: "toolu_2",
            toolName: "read_note",
            isError: true,
            output: "This tool is not available in this run.",
          },
        ],
      },
    ];

    expect(mapRequest(request({ messages })).messages).toEqual([
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "toolu_1",
            content: '{"utc":"2026-01-01T00:00:00.000Z"}',
            is_error: false,
          },
          {
            type: "tool_result",
            tool_use_id: "toolu_2",
            content: "This tool is not available in this run.",
            is_error: true,
          },
        ],
      },
    ]);
  });
});

describe("mapRequest: reasoning (owner, 2026-11-12)", () => {
  it("sends a reasoning block back as the very object it received, in its place", () => {
    const thinking = buildThinkingBlock("EqQBCgIYAhIM1gbcDa9GJwZA2b3hGgxBdjrkzLoky3dl1pkiMOYds");
    const messages: LlmMessage[] = [
      { role: "user", content: [{ type: "text", text: "Time?" }] },
      {
        role: "assistant",
        content: [
          { type: "reasoning", providerId: "anthropic", payload: thinking },
          { type: "tool_call", toolCallId: "toolu_1", toolName: "get_current_time", input: {} },
        ],
      },
    ];

    const [, assistant] = mapRequest(request({ messages })).messages;

    expect(Array.isArray(assistant?.content)).toBe(true);
    const blocks = Array.isArray(assistant?.content) ? assistant.content : [];
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toBe(thinking);
    expect(blocks[0]).toEqual({
      type: "thinking",
      thinking: "",
      signature: "EqQBCgIYAhIM1gbcDa9GJwZA2b3hGgxBdjrkzLoky3dl1pkiMOYds",
    });
    expect(blocks[1]).toMatchObject({ type: "tool_use", id: "toolu_1" });
  });

  it("keeps a block whose thinking text is empty: the signature carries the reasoning", () => {
    const thinking = buildThinkingBlock("c2lnbmF0dXJl", "");
    const messages: LlmMessage[] = [
      {
        role: "assistant",
        content: [{ type: "reasoning", providerId: "anthropic", payload: thinking }],
      },
    ];

    expect(mapRequest(request({ messages })).messages[0]?.content).toEqual([thinking]);
  });

  it("sends a redacted reasoning block back unchanged too", () => {
    const redacted = { type: "redacted_thinking", data: "ZW5jcnlwdGVk" };
    const messages: LlmMessage[] = [
      {
        role: "assistant",
        content: [
          { type: "reasoning", providerId: "anthropic", payload: redacted },
          { type: "text", text: "Done." },
        ],
      },
    ];

    const [assistant] = mapRequest(request({ messages })).messages;

    expect(Array.isArray(assistant?.content) ? assistant.content[0] : undefined).toBe(redacted);
  });

  it("leaves out another provider's reasoning, which this provider cannot read", () => {
    const messages: LlmMessage[] = [
      {
        role: "assistant",
        content: [
          { type: "reasoning", providerId: "openai", payload: { id: "rs_1" } },
          { type: "text", text: "Done." },
        ],
      },
    ];

    expect(mapRequest(request({ messages })).messages[0]?.content).toEqual([
      { type: "text", text: "Done." },
    ]);
  });

  it.each([
    ["no payload", undefined],
    ["a string", "thinking"],
    ["a block without a signature", { type: "thinking", thinking: "" }],
    ["a redacted block without data", { type: "redacted_thinking" }],
    ["another block type", { type: "text", text: "hi" }],
  ])("refuses %s as an Anthropic reasoning payload", (_, payload) => {
    const messages: LlmMessage[] = [
      { role: "assistant", content: [{ type: "reasoning", providerId: "anthropic", payload }] },
    ];

    const error = captureLlmError(() => mapRequest(request({ messages })));

    expect(error.problem).toBe("LLM_REQUEST_REJECTED");
    expect(error.reason).toBe("invalid_reasoning_payload");
  });
});

describe("isReasoningBlock", () => {
  it("accepts a thinking block and a redacted thinking block", () => {
    expect(isReasoningBlock(buildThinkingBlock("c2ln"))).toBe(true);
    expect(isReasoningBlock({ type: "redacted_thinking", data: "ZGF0YQ==" })).toBe(true);
  });

  it.each([null, 42, [], {}, { type: "thinking", thinking: 1, signature: "x" }])(
    "refuses %j",
    (payload) => {
      expect(isReasoningBlock(payload)).toBe(false);
    },
  );
});
