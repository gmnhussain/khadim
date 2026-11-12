import type { LlmErrorReason, LlmProblem } from "./llm.errors";
import type { LlmCapabilities, LlmTaskNeed } from "./llm.types";

/** The capability flag that satisfies each need. */
const CAPABILITY_BY_NEED: Record<LlmTaskNeed, keyof Omit<LlmCapabilities, "maxContextTokens">> = {
  tools: "supportsTools",
  streaming: "supportsStreaming",
  images: "supportsImages",
  structured_output: "supportsStructuredOutput",
  prompt_caching: "supportsPromptCaching",
};

/** What a task needs from the model it is routed to (BR-25; review fixes, D-3). */
export interface TaskRequirements {
  readonly needs: readonly LlmTaskNeed[];
  /** The smallest context window the task can work in, in tokens (conventions §15.2). */
  readonly minContextTokens: number;
}

/** Why a route is invalid. */
export type RouteRefusal = Extract<
  LlmErrorReason,
  | "unknown_model"
  | "provider_disabled"
  | "missing_capability"
  | "context_too_small"
  | "output_over_model_limit"
  | "output_not_below_context"
>;

/** An invalid route, why, and the need the model cannot meet when that is the reason. */
export interface RouteFinding {
  readonly problem: Extract<LlmProblem, "LLM_ROUTE_INVALID">;
  readonly refusal: RouteRefusal;
  readonly need?: LlmTaskNeed | undefined;
}

/** What `findRouteProblem` needs to know about one task route to a model the catalog lists. */
export interface RouteCheck {
  readonly capabilities: LlmCapabilities;
  /** The most output the model can write in one call. */
  readonly modelMaxOutputTokens: number;
  /** The output the route asks for on every call. */
  readonly routeMaxOutputTokens: number;
  /** Whether the owner enabled the route's provider (BR-27). */
  readonly isProviderEnabled: boolean;
  readonly requirements: TaskRequirements;
}

/** A task that needs nothing, such as one the composition root does not list. */
export const NO_TASK_REQUIREMENTS: TaskRequirements = { needs: [], minContextTokens: 0 };

/** The first need the model cannot meet, or none. */
export function findMissingCapability(
  capabilities: LlmCapabilities,
  needs: readonly LlmTaskNeed[],
): LlmTaskNeed | undefined {
  return needs.find((need) => !capabilities[CAPABILITY_BY_NEED[need]]);
}

/**
 * Checks one task route to a known model: its provider is enabled, the model can do what the
 * task needs, its context is large enough for the task, and the output the route asks for fits
 * the model and leaves room for input (BR-25, BR-27; review fixes, D-3). 1a resolves the task
 * route only; overrides and fallbacks are 1c.
 */
export function findRouteProblem(check: RouteCheck): RouteFinding | undefined {
  const problem = "LLM_ROUTE_INVALID";
  if (!check.isProviderEnabled) {
    return { problem, refusal: "provider_disabled" };
  }
  const need = findMissingCapability(check.capabilities, check.requirements.needs);
  if (need !== undefined) {
    return { problem, refusal: "missing_capability", need };
  }
  if (check.capabilities.maxContextTokens < check.requirements.minContextTokens) {
    return { problem, refusal: "context_too_small" };
  }
  if (check.routeMaxOutputTokens > check.modelMaxOutputTokens) {
    return { problem, refusal: "output_over_model_limit" };
  }
  if (check.routeMaxOutputTokens >= check.capabilities.maxContextTokens) {
    return { problem, refusal: "output_not_below_context" };
  }
  return undefined;
}
