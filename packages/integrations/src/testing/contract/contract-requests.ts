import type {
  LlmMessage,
  LlmRequest,
  LlmResponse,
  LlmToolDefinition,
} from "@khadim/core/llm/llm.types";

/**
 * The provider-neutral requests of the adapter contract suite. They are the requests the
 * recording script sends (plan D-6) and must stay identical to it, so that a recorded request
 * body equals what a contract case sends. Every prompt is synthetic.
 */

const MAX_OUTPUT_TOKENS = 1024;
/** Small enough to cut the answer off. */
const TRUNCATING_MAX_OUTPUT_TOKENS = 64;
const TIMEOUT_MS = 120_000;
const CACHEABLE_REFERENCE_LINES = 400;

/** The system prompt of every contract request. */
export const CONTRACT_SYSTEM_PROMPT =
  "You are a test assistant. Follow the instruction exactly and briefly.";

/** Long enough to be cached: one synthetic sentence, numbered, many times. */
export const CONTRACT_CACHEABLE_SYSTEM_PROMPT = [
  CONTRACT_SYSTEM_PROMPT,
  ...Array.from(
    { length: CACHEABLE_REFERENCE_LINES },
    (_unused, index) => `Reference line ${index + 1}: this sentence only fills the prompt.`,
  ),
].join("\n");

/** The one tool of the contract requests, as core's registry describes `get_current_time`. */
export const CONTRACT_TIME_TOOL: LlmToolDefinition = {
  name: "get_current_time",
  description:
    "Returns the current date and time. Use it whenever an answer depends on today's date or the time now.",
  inputJsonSchema: {
    type: "object",
    properties: {
      timeZone: { type: "string", description: "IANA time zone name, for example Europe/Berlin." },
    },
    additionalProperties: false,
  },
};

/** The fixed result every tool call of a contract case gets. */
export const CONTRACT_TOOL_OUTPUT = JSON.stringify({
  utc: "2026-01-01T00:00:00.000Z",
  timeZone: "UTC",
  localDate: "2026-01-01",
  localTime: "00:00:00",
});

function userMessage(text: string): LlmMessage {
  return { role: "user", content: [{ type: "text", text }] };
}

/** The contract requests for one model. */
export function createContractRequests(model: string) {
  function request(overrides: Partial<LlmRequest>): LlmRequest {
    return {
      model,
      system: [{ text: CONTRACT_SYSTEM_PROMPT, isStable: true }],
      tools: [],
      messages: [],
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      timeoutMs: TIMEOUT_MS,
      effort: "low",
      ...overrides,
    };
  }

  const toolCallMessages = [userMessage("What time is it right now in UTC? Use the tool.")];

  return {
    /** A one-word answer. */
    text: request({ messages: [userMessage("Reply with exactly the word: pong")] }),
    /** A short answer that arrives in several deltas. */
    countToFive: request({
      messages: [userMessage("Count from one to five in words, separated by commas.")],
    }),
    /** A question the model answers by calling the tool. */
    toolCall: request({ tools: [CONTRACT_TIME_TOOL], messages: toolCallMessages }),
    /** The turn after `toolCall`: the model's own parts replayed, then the tool's result. */
    toolResult(toolCallResponse: LlmResponse): LlmRequest {
      const toolResults = toolCallResponse.content.flatMap((part) =>
        part.type === "tool_call"
          ? [
              {
                type: "tool_result" as const,
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                isError: false,
                output: CONTRACT_TOOL_OUTPUT,
              },
            ]
          : [],
      );
      return request({
        tools: [CONTRACT_TIME_TOOL],
        messages: [
          ...toolCallMessages,
          { role: "assistant", content: toolCallResponse.content },
          { role: "tool", content: toolResults },
        ],
      });
    },
    /** A question that needs the tool twice in one step. */
    parallelTools: request({
      tools: [CONTRACT_TIME_TOOL],
      messages: [
        userMessage(
          "Give me the current time in UTC and in Asia/Dhaka. Call the tool once for each zone.",
        ),
      ],
    }),
    /** A request with a system prompt long enough to cache; sent twice. */
    cached: request({
      system: [{ text: CONTRACT_CACHEABLE_SYSTEM_PROMPT, isStable: true }],
      messages: [userMessage("Reply with exactly the word: cached")],
    }),
    /** A long answer with a maximum output too small for it. */
    truncated: request({
      maxOutputTokens: TRUNCATING_MAX_OUTPUT_TOKENS,
      messages: [userMessage("Write three paragraphs about rivers.")],
    }),
  };
}
