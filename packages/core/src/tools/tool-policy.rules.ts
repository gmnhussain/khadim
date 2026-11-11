import type { ToolCallProblem, ToolConfigProblem } from "./tool.errors";
import type { ToolEffect, ToolPolicy, ToolPolicyConfig, ToolPolicyEntry } from "./tool.types";

/** ADR-0011: the tier is a floor. `external` is always `approve` (BR-02); `read` has no effect to propose or approve. */
const ALLOWED_POLICIES: Record<ToolEffect, readonly ToolPolicy[]> = {
  read: ["auto"],
  local_write: ["auto", "propose", "approve"],
  external: ["approve"],
};

/** ADR-0014: validation that meets a tool name no source provides assumes the strictest tier. */
const UNKNOWN_TOOL_EFFECT: ToolEffect = "external";

/** For the loop, `propose` runs now like `auto`; only `approve` waits for the owner (ADR-0011). */
const PAUSES_RUN: Record<ToolPolicy, boolean> = { auto: false, propose: false, approve: true };

/** A configuration problem and the tool it concerns. */
export interface ToolConfigFinding {
  readonly problem: ToolConfigProblem;
  readonly toolName: string;
}

/** The call limits of a tool's policy. */
export type ToolCallLimits = Pick<ToolPolicyEntry, "maxCallsPerRun" | "maxCallsPerDay">;

/** Calls of one tool already accepted, before the call being checked. */
export interface ToolCallCounts {
  readonly callsThisRun: number;
  readonly callsToday: number;
}

/** Checks a policy against the tier floor; an unknown tool (no effect) counts as `external`. */
export function checkPolicyAllowed(
  effect: ToolEffect | undefined,
  policy: ToolPolicy,
): Extract<ToolConfigProblem, "TOOL_POLICY_INVALID"> | undefined {
  const allowedPolicies = ALLOWED_POLICIES[effect ?? UNKNOWN_TOOL_EFFECT];
  return allowedPolicies.includes(policy) ? undefined : "TOOL_POLICY_INVALID";
}

/** Whether a call under this policy creates a pending action and pauses the run. */
export function pausesRun(policy: ToolPolicy): boolean {
  return PAUSES_RUN[policy];
}

/** Checks the per-run and per-day limits before one more call is accepted. */
export function checkCallLimits(
  limits: ToolCallLimits,
  counts: ToolCallCounts,
): Extract<ToolCallProblem, "TOOL_LIMIT_REACHED"> | undefined {
  if (limits.maxCallsPerRun !== undefined && counts.callsThisRun >= limits.maxCallsPerRun) {
    return "TOOL_LIMIT_REACHED";
  }
  if (limits.maxCallsPerDay !== undefined && counts.callsToday >= limits.maxCallsPerDay) {
    return "TOOL_LIMIT_REACHED";
  }
  return undefined;
}

/**
 * Finds the first problem in the tool configuration, or none. Every policy must respect its
 * tool's tier, and every tool a task lists must exist and have a policy: a tool is never
 * silently left out (ADR-0014, fail closed).
 */
export function findToolConfigProblem(
  config: ToolPolicyConfig,
  effectByToolName: ReadonlyMap<string, ToolEffect>,
): ToolConfigFinding | undefined {
  for (const [toolName, entry] of Object.entries(config.policies)) {
    const problem = checkPolicyAllowed(effectByToolName.get(toolName), entry.policy);
    if (problem !== undefined) {
      return { problem, toolName };
    }
  }
  for (const toolNames of Object.values(config.tasks)) {
    for (const toolName of toolNames) {
      const isClassified =
        effectByToolName.has(toolName) && Object.hasOwn(config.policies, toolName);
      if (!isClassified) {
        return { problem: "TOOL_UNCLASSIFIED", toolName };
      }
    }
  }
  return undefined;
}
