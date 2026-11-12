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

/** A tool and the owner's policy for it: what a task may call (ADR-0011). */
export interface ClassifiedTool<TTool> {
  readonly tool: TTool;
  readonly entry: ToolPolicyEntry;
}

/** Result of `classifyToolConfig`: each task's tools by name, or the first problem found. */
export type ToolConfigClassification<TTool> =
  | {
      readonly ok: true;
      readonly value: ReadonlyMap<string, ReadonlyMap<string, ClassifiedTool<TTool>>>;
    }
  | ({ readonly ok: false } & ToolConfigFinding);

/**
 * Checks the tool configuration and classifies it in one pass. Every policy must respect its
 * tool's tier, and every tool a task lists must exist and have a policy: a tool is never
 * silently left out (ADR-0014, fail closed). Maps, not objects: tool and task names come from
 * the model and the config file (KP-08; finding #14).
 */
export function classifyToolConfig<TTool extends { readonly effect: ToolEffect }>(
  config: ToolPolicyConfig,
  toolByName: ReadonlyMap<string, TTool>,
): ToolConfigClassification<TTool> {
  for (const [toolName, entry] of Object.entries(config.policies)) {
    const problem = checkPolicyAllowed(toolByName.get(toolName)?.effect, entry.policy);
    if (problem !== undefined) {
      return { ok: false, problem, toolName };
    }
  }
  const classifiedByTask = new Map<string, ReadonlyMap<string, ClassifiedTool<TTool>>>();
  for (const [task, toolNames] of Object.entries(config.tasks)) {
    const classifiedByName = new Map<string, ClassifiedTool<TTool>>();
    for (const toolName of toolNames) {
      const tool = toolByName.get(toolName);
      const entry = Object.hasOwn(config.policies, toolName)
        ? config.policies[toolName]
        : undefined;
      if (tool === undefined || entry === undefined) {
        return { ok: false, problem: "TOOL_UNCLASSIFIED", toolName };
      }
      classifiedByName.set(toolName, { tool, entry });
    }
    classifiedByTask.set(task, classifiedByName);
  }
  return { ok: true, value: classifiedByTask };
}
