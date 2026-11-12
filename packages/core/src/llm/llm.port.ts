import type { LlmCapabilities, LlmRequest, LlmResponse, LlmStreamEvent } from "./llm.types";

/**
 * Port for language models (ADR-0009). Adapters in `integrations` implement it; core never sees
 * a vendor type. Both methods fail only with an `LlmError`, and neither retries: retrying is
 * core's decision (plan D-9).
 */
export interface LlmProvider {
  /** The provider this adapter talks to, such as `anthropic` (glossary: Provider). */
  readonly providerId: string;
  /** What the adapter itself supports; each model's own capabilities are in the catalog. */
  readonly capabilities: LlmCapabilities;
  /** Calls the model and returns the completed response. */
  readonly generate: (request: LlmRequest) => Promise<LlmResponse>;
  /** Calls the model and reports events as they arrive; the last one is `completed`. */
  readonly stream: (request: LlmRequest) => AsyncIterable<LlmStreamEvent>;
}
