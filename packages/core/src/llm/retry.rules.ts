import type { LlmProblem } from "./llm.errors";
import type { LlmStreamEvent } from "./llm.types";

/** Plan D-9: only rate limits and outages are retried; every other problem fails fast. */
const IS_RETRYABLE: Record<LlmProblem, boolean> = {
  LLM_RATE_LIMITED: true,
  LLM_UNAVAILABLE: true,
  LLM_REFUSED: false,
  LLM_REQUEST_REJECTED: false,
  LLM_NOT_AUTHORIZED: false,
  LLM_OUTPUT_TRUNCATED: false,
  LLM_CONTEXT_EXCEEDED: false,
  LLM_ROUTE_INVALID: false,
};

/**
 * Plan D-9 rule 2: only text and tool-call content counts as emitted. Stream start and
 * reasoning do not, and `completed` ends a call that has nothing left to retry.
 */
const EMITS_CONTENT: Record<LlmStreamEvent["type"], boolean> = {
  started: false,
  reasoning: false,
  text_delta: true,
  tool_call_started: true,
  completed: false,
};

/** The wait before the second attempt, before jitter. */
const BACKOFF_BASE_MS = 1_000;
/** No backoff is longer than this, however many attempts were made. */
const BACKOFF_MAX_MS = 30_000;
const BACKOFF_FACTOR = 2;
/** Equal jitter: half of the backoff is fixed and half is random. */
const JITTER_FIXED_SHARE = 0.5;

/** What `decideRetry` needs to know about a failed model call. */
export interface RetryInput {
  readonly problem: LlmProblem;
  /** The provider's retry delay, when it gave one (D-9 rule 1). */
  readonly retryAfterMs?: number | undefined;
  /** Whether this call emitted text or tool-call content before it failed (D-9 rule 2). */
  readonly hasEmittedContent: boolean;
  /** Attempts made so far, counting the one that just failed. */
  readonly attemptsMade: number;
  /** The route's limit, counting the first try (D-9 rule 3). */
  readonly maxAttempts: number;
  /** Running time the run has left (BR-21). */
  readonly remainingRunMs: number;
  /** A random value in [0, 1) from an injected source (D-9 rule 4). */
  readonly randomValue: number;
}

/** Why a failed call is not retried. */
export type RetryRefusal =
  "not_retryable" | "content_emitted" | "attempts_exhausted" | "exceeds_time_budget";

/** Retry after `delayMs`, or fail with the call's own problem. */
export type RetryDecision =
  | { readonly retry: true; readonly delayMs: number }
  | { readonly retry: false; readonly refusal: RetryRefusal };

/** Whether a stream event is content the owner can already see (D-9 rule 2). */
export function isEmittedContent(event: LlmStreamEvent): boolean {
  return EMITS_CONTENT[event.type];
}

/** Exponential backoff with equal jitter, in whole milliseconds. */
export function computeBackoffMs(attemptsMade: number, randomValue: number): number {
  const ceilingMs = Math.min(
    BACKOFF_MAX_MS,
    BACKOFF_BASE_MS * BACKOFF_FACTOR ** (attemptsMade - 1),
  );
  const fixedMs = ceilingMs * JITTER_FIXED_SHARE;
  return Math.floor(fixedMs + (ceilingMs - fixedMs) * randomValue);
}

/** Decides whether a failed model call is tried again, and after how long (plan D-9). */
export function decideRetry(input: RetryInput): RetryDecision {
  if (!IS_RETRYABLE[input.problem]) {
    return { retry: false, refusal: "not_retryable" };
  }
  if (input.hasEmittedContent) {
    return { retry: false, refusal: "content_emitted" };
  }
  if (input.attemptsMade >= input.maxAttempts) {
    return { retry: false, refusal: "attempts_exhausted" };
  }
  const backoffMs = computeBackoffMs(input.attemptsMade, input.randomValue);
  const delayMs = Math.max(backoffMs, input.retryAfterMs ?? 0);
  // A wait that ends exactly when the running time does leaves no time for the call itself.
  if (delayMs >= input.remainingRunMs) {
    return { retry: false, refusal: "exceeds_time_budget" };
  }
  return { retry: true, delayMs };
}
