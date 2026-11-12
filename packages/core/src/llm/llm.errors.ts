import type { LlmStopReason, LlmUsage } from "./llm.types";

/** Every problem the llm module can report (features/agent.md, "Problem codes"). */
export const LLM_PROBLEMS = [
  "LLM_RATE_LIMITED",
  "LLM_UNAVAILABLE",
  "LLM_REFUSED",
  "LLM_REQUEST_REJECTED",
  "LLM_NOT_AUTHORIZED",
  "LLM_OUTPUT_TRUNCATED",
  "LLM_CONTEXT_EXCEEDED",
  "LLM_ROUTE_INVALID",
] as const;

/** An LLM problem code. */
export type LlmProblem = (typeof LLM_PROBLEMS)[number];

/** Messages for the owner; none carries a vendor's wording (conventions §12.1). */
export const LLM_PROBLEM_MESSAGES: Record<LlmProblem, string> = {
  LLM_RATE_LIMITED: "The model provider is rate limiting requests.",
  LLM_UNAVAILABLE: "The model provider is unavailable.",
  LLM_REFUSED: "The model refused the request.",
  LLM_REQUEST_REJECTED: "The model provider rejected the request as invalid.",
  LLM_NOT_AUTHORIZED: "The model provider refused the key, a permission or the account's credit.",
  LLM_OUTPUT_TRUNCATED: "The model reached its maximum output before finishing.",
  LLM_CONTEXT_EXCEEDED: "The conversation is larger than the model's context limit.",
  LLM_ROUTE_INVALID: "The model catalog or a model route is not valid.",
};

/**
 * The problem each stop reason means, or none for a completed call. Adapters map a vendor's stop
 * reason to the neutral one, then throw the problem found here (plan D-8), so every adapter agrees.
 */
export const STOP_REASON_PROBLEMS: Record<LlmStopReason, LlmProblem | undefined> = {
  end_turn: undefined,
  tool_calls: undefined,
  max_output: "LLM_OUTPUT_TRUNCATED",
  refusal: "LLM_REFUSED",
  context_exceeded: "LLM_CONTEXT_EXCEEDED",
};

/** Details of an LLM error. None of them holds prompt or completion text. */
export interface LlmErrorOptions {
  /** How long the provider asked to wait, on `LLM_RATE_LIMITED` (plan D-9 rule 1). */
  readonly retryAfterMs?: number | undefined;
  /** Tokens the failed call still used, so its cost is recorded (BR-23). */
  readonly usage?: LlmUsage | undefined;
  /** The task whose route is invalid, on `LLM_ROUTE_INVALID`. */
  readonly task?: string | undefined;
  /** A short reason code for logs, such as `unknown_model`. */
  readonly reason?: string | undefined;
  /** The vendor's error, for logs only; it never crosses the port any other way. */
  readonly cause?: unknown;
}

/** A failed model call, or an invalid model catalog or route (ADR-0009). */
export class LlmError extends Error {
  readonly problem: LlmProblem;
  readonly retryAfterMs: number | undefined;
  readonly usage: LlmUsage | undefined;
  readonly task: string | undefined;
  readonly reason: string | undefined;
  constructor(problem: LlmProblem, options: LlmErrorOptions = {}) {
    super(LLM_PROBLEM_MESSAGES[problem], { cause: options.cause });
    this.name = "LlmError";
    this.problem = problem;
    this.retryAfterMs = options.retryAfterMs;
    this.usage = options.usage;
    this.task = options.task;
    this.reason = options.reason;
  }
}
