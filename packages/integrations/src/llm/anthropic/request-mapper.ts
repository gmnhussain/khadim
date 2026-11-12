import type Anthropic from "@anthropic-ai/sdk";
import { transformJSONSchema } from "@anthropic-ai/sdk/lib/transform-json-schema";
import { LlmError } from "@khadim/core/llm/llm.errors";
import type {
  LlmAssistantPart,
  LlmMessage,
  LlmRequest,
  LlmSystemPart,
  LlmToolDefinition,
} from "@khadim/core/llm/llm.types";

/** The provider id of this adapter; reasoning parts carry it (glossary: Provider). */
export const ANTHROPIC_PROVIDER_ID = "anthropic";

/** A reasoning block exactly as Anthropic returned it; sent back without any change. */
type ReasoningBlock = Anthropic.ThinkingBlockParam | Anthropic.RedactedThinkingBlockParam;

const CACHE_MARKER: Anthropic.CacheControlEphemeral = { type: "ephemeral" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Whether a reasoning payload is a block this adapter produced. */
export function isReasoningBlock(payload: unknown): payload is ReasoningBlock {
  if (!isRecord(payload)) {
    return false;
  }
  if (payload.type === "thinking") {
    return typeof payload.thinking === "string" && typeof payload.signature === "string";
  }
  return payload.type === "redacted_thinking" && typeof payload.data === "string";
}

/**
 * The system prompt as text blocks. The cache marker goes on the last part of the stable
 * prefix, which also caches the tool definitions rendered before it (conventions §15.2).
 * Moving or adding a cache marker never invalidates a reasoning block.
 */
function mapSystem(system: readonly LlmSystemPart[]): Anthropic.TextBlockParam[] {
  const firstVolatileIndex = system.findIndex((part) => !part.isStable);
  const lastStableIndex = (firstVolatileIndex === -1 ? system.length : firstVolatileIndex) - 1;
  return system.map((part, index) => ({
    type: "text",
    text: part.text,
    ...(index === lastStableIndex ? { cache_control: CACHE_MARKER } : {}),
  }));
}

/**
 * A strict tool (plan D-3). Strict schemas reject keywords such as `maxLength` and `minimum`
 * with a 400, so the SDK's own transform moves them into the description; core's tool
 * registry still enforces them with Zod before a handler runs.
 */
function mapTool(tool: LlmToolDefinition): Anthropic.Tool {
  const { $schema: _dialect, ...schema } = tool.inputJsonSchema;
  return {
    name: tool.name,
    description: tool.description,
    input_schema: { ...transformJSONSchema(schema), type: "object" },
    strict: true,
  };
}

function mapAssistantPart(part: LlmAssistantPart): Anthropic.ContentBlockParam[] {
  switch (part.type) {
    case "text":
      return [{ type: "text", text: part.text }];
    case "tool_call":
      return [{ type: "tool_use", id: part.toolCallId, name: part.toolName, input: part.input }];
    case "reasoning":
      // Another provider's reasoning cannot be read here; Anthropic's own is replayed as it
      // was received, because its signature binds it to the conversation before it.
      if (part.providerId !== ANTHROPIC_PROVIDER_ID) {
        return [];
      }
      if (!isReasoningBlock(part.payload)) {
        throw new LlmError("LLM_REQUEST_REJECTED", { reason: "invalid_reasoning_payload" });
      }
      return [part.payload];
  }
}

function mapMessage(message: LlmMessage): Anthropic.MessageParam {
  switch (message.role) {
    case "user":
      return {
        role: "user",
        content: message.content.map((part) => ({ type: "text", text: part.text })),
      };
    case "assistant":
      return { role: "assistant", content: message.content.flatMap(mapAssistantPart) };
    case "tool":
      // Every result of a step goes back in one user message, in the order asked.
      return {
        role: "user",
        content: message.content.map((part) => ({
          type: "tool_result",
          tool_use_id: part.toolCallId,
          content: part.output,
          is_error: part.isError,
        })),
      };
  }
}

/**
 * Maps a provider-neutral request to the Messages API. It never sends `temperature`, `top_p`,
 * `top_k`, a forced `tool_choice`, an assistant prefill or a `thinking` setting: current
 * models reject them, and effort alone controls reasoning depth (plan P-5).
 */
export function mapRequest(request: LlmRequest): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: request.model,
    max_tokens: request.maxOutputTokens,
    messages: request.messages.map(mapMessage),
    ...(request.system.length === 0 ? {} : { system: mapSystem(request.system) }),
    ...(request.tools.length === 0 ? {} : { tools: request.tools.map(mapTool) }),
    ...(request.effort === undefined ? {} : { output_config: { effort: request.effort } }),
  };
}
