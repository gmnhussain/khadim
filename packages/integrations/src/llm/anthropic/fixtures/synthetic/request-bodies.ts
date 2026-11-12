import type Anthropic from "@anthropic-ai/sdk";

import { SYNTHETIC_MODEL } from "./synthetic-fixture";

/**
 * The request bodies of the hand-built fixtures, written out as the Messages API documents
 * them rather than produced by the adapter: a contract case fails when the adapter sends
 * anything else.
 */

const MAX_TOKENS = 1024;
const TRUNCATING_MAX_TOKENS = 64;
const CACHEABLE_REFERENCE_LINES = 400;

const SYSTEM_TEXT = "You are a test assistant. Follow the instruction exactly and briefly.";

const CACHEABLE_SYSTEM_TEXT = [
  SYSTEM_TEXT,
  ...Array.from(
    { length: CACHEABLE_REFERENCE_LINES },
    (_unused, index) => `Reference line ${index + 1}: this sentence only fills the prompt.`,
  ),
].join("\n");

/** The cache marker sits on the last stable system block. */
function systemBlocks(text: string): Anthropic.TextBlockParam[] {
  return [{ type: "text", text, cache_control: { type: "ephemeral" } }];
}

function userText(text: string): Anthropic.MessageParam {
  return { role: "user", content: [{ type: "text", text }] };
}

const TIME_TOOL: Anthropic.Tool = {
  name: "get_current_time",
  description:
    "Returns the current date and time. Use it whenever an answer depends on today's date or the time now.",
  input_schema: {
    type: "object",
    properties: {
      timeZone: { type: "string", description: "IANA time zone name, for example Europe/Berlin." },
    },
    additionalProperties: false,
  },
  strict: true,
};

function body(
  messages: Anthropic.MessageParam[],
  overrides: Partial<Anthropic.MessageCreateParamsNonStreaming> = {},
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: SYNTHETIC_MODEL,
    max_tokens: MAX_TOKENS,
    system: systemBlocks(SYSTEM_TEXT),
    messages,
    output_config: { effort: "low" },
    ...overrides,
  };
}

/** The same request, streamed. */
export function streamed(
  requestBody: Anthropic.MessageCreateParamsNonStreaming,
): Anthropic.MessageCreateParamsStreaming {
  return { ...requestBody, stream: true };
}

/** The signature of the reasoning block in the tool-call fixture; synthetic, not a credential. */
export const SYNTHETIC_SIGNATURE = "c3ludGhldGljLXJlYXNvbmluZy1zaWduYXR1cmUtMDAwMQ==";

/** The id of the tool call in the tool-call fixture. */
export const SYNTHETIC_TOOL_CALL_ID = "toolu_synthetic_0001";

const TOOL_CALL_QUESTION = userText("What time is it right now in UTC? Use the tool.");

/** One-word answer. */
export const TEXT_BODY = body([userText("Reply with exactly the word: pong")]);

/** A short answer in several deltas. */
export const COUNT_TO_FIVE_BODY = body([
  userText("Count from one to five in words, separated by commas."),
]);

/** A question answered with a tool call. */
export const TOOL_CALL_BODY = body([TOOL_CALL_QUESTION], { tools: [TIME_TOOL] });

/**
 * The turn after the tool call. The assistant message holds the reasoning block exactly as
 * the API returned it, then the tool call; one user message holds the tool's result.
 */
export const TOOL_RESULT_BODY = body(
  [
    TOOL_CALL_QUESTION,
    {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "", signature: SYNTHETIC_SIGNATURE },
        {
          type: "tool_use",
          id: SYNTHETIC_TOOL_CALL_ID,
          name: "get_current_time",
          input: { timeZone: "UTC" },
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: SYNTHETIC_TOOL_CALL_ID,
          content:
            '{"utc":"2026-01-01T00:00:00.000Z","timeZone":"UTC","localDate":"2026-01-01","localTime":"00:00:00"}',
          is_error: false,
        },
      ],
    },
  ],
  { tools: [TIME_TOOL] },
);

/** A question that needs the tool twice in one step. */
export const PARALLEL_TOOLS_BODY = body(
  [
    userText(
      "Give me the current time in UTC and in Asia/Dhaka. Call the tool once for each zone.",
    ),
  ],
  { tools: [TIME_TOOL] },
);

/** A request with a system prompt long enough to cache. */
export const CACHED_BODY = body([userText("Reply with exactly the word: cached")], {
  system: systemBlocks(CACHEABLE_SYSTEM_TEXT),
});

/** A long answer with a maximum output too small for it. */
export const TRUNCATED_BODY = body([userText("Write three paragraphs about rivers.")], {
  max_tokens: TRUNCATING_MAX_TOKENS,
});
