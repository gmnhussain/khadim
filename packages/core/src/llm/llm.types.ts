import * as z from "zod";

/** How hard a model should work on a call; set per task in the catalog (plan D-1). */
export const LLM_EFFORTS = ["low", "medium", "high"] as const;

/** An effort level. */
export type LlmEffort = (typeof LLM_EFFORTS)[number];

const MIN_TOKEN_LIMIT = 1;

/** What a model or adapter can do (ADR-0009). */
export const llmCapabilitiesSchema = z.strictObject({
  supportsTools: z.boolean(),
  supportsStreaming: z.boolean(),
  supportsImages: z.boolean(),
  supportsStructuredOutput: z.boolean(),
  supportsPromptCaching: z.boolean(),
  maxContextTokens: z.int().min(MIN_TOKEN_LIMIT),
});

/** Declared capabilities of a model or adapter. */
export type LlmCapabilities = z.infer<typeof llmCapabilitiesSchema>;

/** A capability a task needs from its model (BR-25). */
export const LLM_TASK_NEEDS = [
  "tools",
  "streaming",
  "images",
  "structured_output",
  "prompt_caching",
] as const;

/** One need of a task. */
export type LlmTaskNeed = (typeof LLM_TASK_NEEDS)[number];

const MIN_PRICE = 0;

/**
 * Prices in integer micro-USD per million tokens, for prompts up to `maxPromptTokens`.
 * The last tier of a model has no maximum (plan D-1, P-6).
 */
export const priceTierSchema = z.strictObject({
  maxPromptTokens: z.int().min(MIN_TOKEN_LIMIT).optional(),
  inputMicroUsdPerMillionTokens: z.int().min(MIN_PRICE),
  outputMicroUsdPerMillionTokens: z.int().min(MIN_PRICE),
  cacheWriteMicroUsdPerMillionTokens: z.int().min(MIN_PRICE),
  cacheReadMicroUsdPerMillionTokens: z.int().min(MIN_PRICE),
});

/** One price tier of a model. */
export type PriceTier = z.infer<typeof priceTierSchema>;

/** Text written by the owner or the model. */
export interface LlmTextPart {
  readonly type: "text";
  readonly text: string;
}

/** A tool the model asks to call. `input` is untrusted until the tool registry validates it. */
export interface LlmToolCallPart {
  readonly type: "tool_call";
  readonly toolCallId: string;
  readonly toolName: string;
  readonly input: unknown;
}

/**
 * The model's reasoning, opaque to core. Only the adapter of `providerId` reads `payload`, and it
 * is sent back to that provider exactly as received (plan increment 4, owner 2026-11-12).
 */
export interface LlmReasoningPart {
  readonly type: "reasoning";
  readonly providerId: string;
  readonly payload: unknown;
}

/** The result of one tool call, or the error the model can act on (conventions §15.4). */
export interface LlmToolResultPart {
  readonly type: "tool_result";
  readonly toolCallId: string;
  readonly toolName: string;
  readonly isError: boolean;
  readonly output: string;
}

/** A part of an assistant message. */
export type LlmAssistantPart = LlmTextPart | LlmToolCallPart | LlmReasoningPart;

/** One message of a conversation, in the provider-neutral shape history is stored in (ADR-0009). */
export type LlmMessage =
  | { readonly role: "user"; readonly content: readonly LlmTextPart[] }
  | { readonly role: "assistant"; readonly content: readonly LlmAssistantPart[] }
  | { readonly role: "tool"; readonly content: readonly LlmToolResultPart[] };

/** A part of the system prompt. Stable parts form the prefix an adapter may cache (conventions §15.2). */
export interface LlmSystemPart {
  readonly text: string;
  readonly isStable: boolean;
}

/** A tool as the model sees it. */
export interface LlmToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputJsonSchema: Readonly<Record<string, unknown>>;
}

/** Why a model call stopped. */
export const LLM_STOP_REASONS = [
  "end_turn",
  "tool_calls",
  "max_output",
  "refusal",
  "context_exceeded",
] as const;

/** A stop reason. */
export type LlmStopReason = (typeof LLM_STOP_REASONS)[number];

/** The stop reasons of a call that completed; the others arrive as an `LlmError`. */
export type LlmCompletedStopReason = Extract<LlmStopReason, "end_turn" | "tool_calls">;

/** Tokens of one call. `inputTokens` excludes the cached tokens counted beside it. */
export interface LlmUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheWriteTokens: number;
  readonly cacheReadTokens: number;
}

/** A completed model call. */
export interface LlmResponse {
  readonly content: readonly LlmAssistantPart[];
  readonly stopReason: LlmCompletedStopReason;
  readonly usage: LlmUsage;
}

/** One request to a model. Every call sets a maximum output and a timeout (conventions §15.2). */
export interface LlmRequest {
  readonly model: string;
  readonly system: readonly LlmSystemPart[];
  readonly tools: readonly LlmToolDefinition[];
  readonly messages: readonly LlmMessage[];
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  readonly effort?: LlmEffort | undefined;
  /** Aborts the call, for example when the run is cancelled. */
  readonly signal?: AbortSignal | undefined;
}

/**
 * What a streamed call reports while it runs. Only `text_delta` and `tool_call_started` carry
 * content the owner can see; the rest is provider metadata or reasoning (plan D-9 rule 2).
 */
export type LlmStreamEvent =
  | { readonly type: "started" }
  | { readonly type: "reasoning" }
  | { readonly type: "text_delta"; readonly text: string }
  | { readonly type: "tool_call_started"; readonly toolCallId: string; readonly toolName: string }
  | { readonly type: "completed"; readonly response: LlmResponse };
