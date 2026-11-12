import type { LlmResponse, LlmToolCallPart, LlmUsage } from "../llm.types";

/** Small, fixed usage for scripted responses whose cost does not matter to the test. */
export const FAKE_LLM_USAGE: LlmUsage = {
  inputTokens: 100,
  outputTokens: 20,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
};

/** A final answer: text only. */
export function createTextResponse(text: string, usage: LlmUsage = FAKE_LLM_USAGE): LlmResponse {
  return { content: [{ type: "text", text }], stopReason: "end_turn", usage };
}

/** A response that asks for tools. */
export function createToolCallResponse(
  toolCalls: readonly Omit<LlmToolCallPart, "type">[],
  usage: LlmUsage = FAKE_LLM_USAGE,
): LlmResponse {
  return {
    content: toolCalls.map((toolCall) => ({ type: "tool_call", ...toolCall })),
    stopReason: "tool_calls",
    usage,
  };
}
