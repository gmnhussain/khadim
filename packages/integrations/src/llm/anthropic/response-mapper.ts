import type Anthropic from "@anthropic-ai/sdk";
import { LlmError, STOP_REASON_PROBLEMS } from "@khadim/core/llm/llm.errors";
import type {
  LlmAssistantPart,
  LlmCompletedStopReason,
  LlmResponse,
  LlmStopReason,
  LlmStreamEvent,
  LlmUsage,
} from "@khadim/core/llm/llm.types";

import { ANTHROPIC_PROVIDER_ID } from "./request-mapper";

/** Maps token counts. Anthropic's `input_tokens` already excludes the cached tokens beside it. */
export function mapUsage(usage: Anthropic.Usage): LlmUsage {
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
  };
}

const mapStopReason = (stopReason: Anthropic.StopReason | null): LlmStopReason | undefined => {
  switch (stopReason) {
    case "end_turn":
    case "stop_sequence":
      return "end_turn";
    case "tool_use":
      return "tool_calls";
    case "max_tokens":
      return "max_output";
    case "refusal":
      return "refusal";
    case "model_context_window_exceeded":
      return "context_exceeded";
    case "pause_turn":
    case null:
      // `pause_turn` belongs to server tools, which this adapter never declares.
      return undefined;
  }
};

const mapContentBlock = (block: Anthropic.ContentBlock, usage: LlmUsage): LlmAssistantPart => {
  if (block.type === "text") {
    return { type: "text", text: block.text };
  }
  if (block.type === "tool_use") {
    return { type: "tool_call", toolCallId: block.id, toolName: block.name, input: block.input };
  }
  if (block.type === "thinking" || block.type === "redacted_thinking") {
    // Kept whole, empty text included: the signature is what the provider reads back.
    return { type: "reasoning", providerId: ANTHROPIC_PROVIDER_ID, payload: block };
  }
  // Server-tool blocks: this adapter declares no server tools, so none should arrive. The call
  // still used tokens, so they go with the error and its cost is recorded (BR-23, I6).
  throw new LlmError("LLM_REQUEST_REJECTED", { reason: "unexpected_content_block", usage });
};

const isCompleted = (stopReason: LlmStopReason): stopReason is LlmCompletedStopReason => {
  return STOP_REASON_PROBLEMS[stopReason] === undefined;
};

/**
 * Maps a finished message. A refusal, a cut-off answer and a context overflow are thrown as
 * the problem core assigns to their stop reason, with the tokens the call used (plan D-8).
 */
export function mapResponse(message: Anthropic.Message): LlmResponse {
  const usage = mapUsage(message.usage);
  const stopReason = mapStopReason(message.stop_reason);
  if (stopReason === undefined) {
    throw new LlmError("LLM_REQUEST_REJECTED", { reason: "unexpected_stop_reason", usage });
  }
  if (!isCompleted(stopReason)) {
    throw new LlmError(STOP_REASON_PROBLEMS[stopReason], { usage });
  }
  return {
    content: message.content.map((block) => mapContentBlock(block, usage)),
    stopReason,
    usage,
  };
}

/**
 * Maps one raw stream event, or nothing for events core has no use for. Only text and the
 * start of a tool call are content the owner can see (plan D-9 rule 2).
 */
export function mapStreamEvent(event: Anthropic.RawMessageStreamEvent): LlmStreamEvent | undefined {
  if (event.type === "message_start") {
    return { type: "started" };
  }
  if (event.type === "content_block_start") {
    const block = event.content_block;
    if (block.type === "thinking" || block.type === "redacted_thinking") {
      return { type: "reasoning" };
    }
    if (block.type === "tool_use") {
      return { type: "tool_call_started", toolCallId: block.id, toolName: block.name };
    }
    // A text block may start with text of its own; the final message holds it, so it is
    // streamed too, or the owner would see less than is stored (I8).
    if (block.type === "text" && block.text !== "") {
      return { type: "text_delta", text: block.text };
    }
    return undefined;
  }
  if (
    event.type === "content_block_delta" &&
    event.delta.type === "text_delta" &&
    event.delta.text !== ""
  ) {
    return { type: "text_delta", text: event.delta.text };
  }
  return undefined;
}
