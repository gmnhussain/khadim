import type { LlmAssistantPart, LlmMessage, LlmProblem, LlmStopReason, LlmUsage } from "../llm";
import type { ToolCallProblem, ToolPolicy } from "../tools";
import type { AgentProblem } from "./agent.errors";

/** The limits of one run (BR-21). */
export interface RunLimits {
  /** Model calls that completed; each is one iteration of the loop. */
  readonly maxIterations: number;
  readonly maxCostMicroUsd: number;
  /** Input and output tokens across all calls. */
  readonly maxTokens: number;
  /** Running time only: time spent awaiting approval does not count (conventions §15.1). */
  readonly maxRunningMs: number;
}

/** What a run has used so far. */
export interface RunTotals {
  readonly iterations: number;
  readonly costMicroUsd: number;
  readonly tokens: number;
  readonly runningMs: number;
}

/** One part of what a run is asked to work on. */
export type RunInputPart =
  | { readonly kind: "owner_text"; readonly text: string }
  /** Text from outside Khadim: data, never instructions (conventions §15.11). */
  | { readonly kind: "untrusted"; readonly source: string; readonly text: string };

/** A versioned prompt file, loaded once (conventions §15.5). */
export interface PromptFile {
  /** The version a run records, such as `system.v1`. */
  readonly version: string;
  readonly text: string;
}

/** What `runAgent` is given. The loop never knows what triggered the run (conventions §15.1). */
export interface AgentRunInput {
  readonly runId: string;
  readonly task: string;
  /** Earlier messages of the conversation, oldest first; sent unchanged. */
  readonly history: readonly LlmMessage[];
  readonly input: readonly RunInputPart[];
  /** What the run used before it was paused; a new run starts at zero. */
  readonly priorTotals?: RunTotals | undefined;
  /**
   * Calls of each tool the run accepted before it was paused, so per-run limits hold across a
   * pause (review fixes, D-5). A new run has none.
   */
  readonly priorToolCallCounts?: ReadonlyMap<string, number> | undefined;
  /**
   * Aborted when the owner cancels: honoured between steps, during a retry wait, and when a
   * model call returns, before its tools run.
   */
  readonly cancelSignal: AbortSignal;
}

/** How a run ended, or why it paused. Status names match the run state machine (agent design §1). */
export type AgentRunOutcome =
  | { readonly status: "succeeded"; readonly answer: string }
  | { readonly status: "awaiting_approval"; readonly pendingActionIds: readonly string[] }
  | { readonly status: "cancelled" }
  | { readonly status: "failed"; readonly problem: AgentProblem | LlmProblem };

/** The result of `runAgent`. */
export interface AgentRunResult {
  readonly outcome: AgentRunOutcome;
  readonly totals: RunTotals;
}

/** One attempt of a model call, as recorded (BR-23, BR-24). No prompt or completion text. */
export interface LlmCallRecord {
  readonly runId: string;
  readonly stepNumber: number;
  /** 1 for the first try; retries count up (phase-1 plan, D-9). */
  readonly attempt: number;
  readonly provider: string;
  readonly model: string;
  /** Tokens used; absent when a failed call reported none. */
  readonly usage: LlmUsage | undefined;
  readonly costMicroUsd: number;
  readonly latencyMs: number;
  readonly stopReason: LlmStopReason | undefined;
  readonly problem: LlmProblem | undefined;
}

/** One iteration of the loop: what the model answered. */
export interface AgentStepRecord {
  readonly runId: string;
  readonly stepNumber: number;
  readonly promptVersion: string;
  readonly content: readonly LlmAssistantPart[];
}

/** What happened to one tool call the model asked for. */
export type ToolCallResultRecord =
  | { readonly status: "completed"; readonly output: string }
  | {
      readonly status: "refused";
      readonly problem: ToolCallProblem;
      readonly message: string;
      /**
       * The original error of a failed handler. For the logger only, with redaction (KP-16,
       * conventions §14): never shown to the model, and never written to the database.
       */
      readonly cause?: unknown;
    }
  | { readonly status: "pending_approval"; readonly pendingActionId: string };

/** One tool call, as recorded (BR-23). */
export interface ToolCallRecord {
  readonly runId: string;
  readonly stepNumber: number;
  readonly toolCallId: string;
  readonly toolName: string;
  /** The validated input, or the model's raw input when the call was refused. */
  readonly input: unknown;
  /** The policy applied; absent when the call was refused before one applied. */
  readonly policy: ToolPolicy | undefined;
  readonly result: ToolCallResultRecord;
  readonly durationMs: number;
}

/** The end of a run, or its pause, as recorded. */
export interface RunOutcomeRecord {
  readonly runId: string;
  readonly outcome: AgentRunOutcome;
  readonly totals: RunTotals;
}

/**
 * Where the loop records a run. A stand-in for the type of the run repository, which needs the
 * database and arrives in 1b; it then becomes `ReturnType<typeof createAgentRunRepository>`
 * (ADR-0012; plan increment 5, owner 2026-11-12). It is not a persistence port.
 */
export interface AgentRunStore {
  readonly recordLlmCall: (record: LlmCallRecord) => Promise<void>;
  readonly recordStep: (record: AgentStepRecord) => Promise<void>;
  readonly recordToolCall: (record: ToolCallRecord) => Promise<void>;
  readonly recordOutcome: (record: RunOutcomeRecord) => Promise<void>;
}

/** A tool call whose policy is `approve`, to become a pending action (BR-02). */
export interface PendingActionRequest {
  readonly runId: string;
  readonly stepNumber: number;
  readonly toolCallId: string;
  readonly toolName: string;
  /** The validated input: the exact payload the owner will approve (BR-03). */
  readonly input: unknown;
}

/**
 * Creates a pending action for the owner to decide. Injected: the approvals module arrives in
 * Phase 3, and tests pass a fake (owner, 2026-11-12).
 */
export type RequestPendingAction = (
  request: PendingActionRequest,
) => Promise<{ readonly pendingActionId: string }>;

/** Waits `delayMs`, or less when `signal` aborts; it never rejects (plan D-9 rule 5). */
export type Sleep = (delayMs: number, signal: AbortSignal) => Promise<void>;
