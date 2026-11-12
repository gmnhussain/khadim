import {
  findMissingCapability,
  type LlmCapabilities,
  type LlmErrorReason,
  type LlmTaskNeed,
  type LlmUsage,
} from "../llm";
import type { ToolEffect } from "../tools";
import type { AgentProblem } from "./agent.errors";
import type { RunLimits, RunTotals } from "./agent.types";

/** BR-21 defaults (plan D-5): 10 iterations, USD 0.50, 500,000 tokens, 2 minutes of running time. */
export const DEFAULT_RUN_LIMITS: RunLimits = {
  maxIterations: 10,
  maxCostMicroUsd: 500_000,
  maxTokens: 500_000,
  maxRunningMs: 120_000,
};

/** A run that has used nothing yet. */
export const ZERO_RUN_TOTALS: RunTotals = {
  iterations: 0,
  costMicroUsd: 0,
  tokens: 0,
  runningMs: 0,
};

/** Every token of a call: fresh and cached input, and output. */
export function countCallTokens(usage: LlmUsage): number {
  return usage.inputTokens + usage.cacheWriteTokens + usage.cacheReadTokens + usage.outputTokens;
}

/** Adds the tokens and cost of one model call attempt, failed attempts included (BR-23). */
export function addCallUsage(
  totals: RunTotals,
  usage: LlmUsage | undefined,
  costMicroUsd: number,
): RunTotals {
  return {
    ...totals,
    costMicroUsd: totals.costMicroUsd + costMicroUsd,
    tokens: totals.tokens + (usage === undefined ? 0 : countCallTokens(usage)),
  };
}

/** Counts one completed model call as an iteration. */
export function addIteration(totals: RunTotals): RunTotals {
  return { ...totals, iterations: totals.iterations + 1 };
}

/**
 * Running time: what the run used before it last paused, plus the time since it last entered
 * `running`. Time spent awaiting approval is not counted (conventions §15.1).
 */
export function computeRunningMs(
  priorRunningMs: number,
  enteredRunningAtMs: number,
  nowMs: number,
): number {
  return priorRunningMs + Math.max(0, nowMs - enteredRunningAtMs);
}

/** The running time a run has left; never negative. */
export function computeRemainingRunMs(totals: RunTotals, limits: RunLimits): number {
  return Math.max(0, limits.maxRunningMs - totals.runningMs);
}

/** A call's timeout: the route's, capped by the running time the run has left. */
export function capTimeoutMs(routeTimeoutMs: number, remainingRunMs: number): number {
  return Math.min(routeTimeoutMs, remainingRunMs);
}

/**
 * The limit that stops the next step, or none (BR-21). A limit is reached when its total equals
 * it. It never discards an answer the run already has: the loop asks before a model call and
 * before executing tools, not after a final answer (owner, 2026-11-12).
 */
export function findReachedLimit(totals: RunTotals, limits: RunLimits): AgentProblem | undefined {
  if (totals.iterations >= limits.maxIterations) {
    return "RUN_ITERATION_LIMIT";
  }
  if (totals.costMicroUsd >= limits.maxCostMicroUsd) {
    return "RUN_BUDGET_EXCEEDED";
  }
  if (totals.tokens >= limits.maxTokens) {
    return "RUN_TOKEN_LIMIT";
  }
  if (totals.runningMs >= limits.maxRunningMs) {
    return "RUN_TIME_LIMIT";
  }
  return undefined;
}

/** What the loop knows about one route at startup. */
export interface LoopRouteCheck {
  /** Whether `providers` holds an adapter for the route's provider. */
  readonly hasAdapter: boolean;
  /** The routed model's capabilities, from the catalog. */
  readonly capabilities: LlmCapabilities;
  /** Whether the tool registry offers the task at least one tool. */
  readonly hasTools: boolean;
}

/** Why the loop cannot run a route, and the need the model cannot meet when that is why. */
export interface LoopRouteFinding {
  readonly reason: Extract<LlmErrorReason, "no_adapter" | "missing_capability">;
  readonly need?: LlmTaskNeed | undefined;
}

/**
 * Checks that the loop can run a route: an adapter is registered for its provider, and the
 * model streams, which the loop does on every call, and supports tools when the task has any
 * (review fixes, D-4; findings L1, L3, L10).
 */
export function findLoopRouteProblem(check: LoopRouteCheck): LoopRouteFinding | undefined {
  if (!check.hasAdapter) {
    return { reason: "no_adapter" };
  }
  const needs: readonly LlmTaskNeed[] = check.hasTools ? ["streaming", "tools"] : ["streaming"];
  const need = findMissingCapability(check.capabilities, needs);
  return need === undefined ? undefined : { reason: "missing_capability", need };
}

/**
 * Whether a step's tool calls may run in parallel: only when every one is a `read`. Any
 * `local_write` or `external` call makes the whole step run in order (conventions §15.3).
 */
export function canRunInParallel(effects: readonly ToolEffect[]): boolean {
  return effects.every((effect) => effect === "read");
}
