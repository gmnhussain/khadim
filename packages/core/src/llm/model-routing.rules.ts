import type { LlmProblem } from "./llm.errors";
import type { LlmCapabilities, LlmTaskNeed } from "./llm.types";

/** The capability flag that satisfies each need. */
const CAPABILITY_BY_NEED: Record<LlmTaskNeed, keyof Omit<LlmCapabilities, "maxContextTokens">> = {
  tools: "supportsTools",
  streaming: "supportsStreaming",
  images: "supportsImages",
  structured_output: "supportsStructuredOutput",
  prompt_caching: "supportsPromptCaching",
};

/** Why a route is invalid. */
export type RouteRefusal = "unknown_model" | "provider_disabled" | "missing_capability";

/** An invalid route and why. */
export interface RouteFinding {
  readonly problem: Extract<LlmProblem, "LLM_ROUTE_INVALID">;
  readonly refusal: RouteRefusal;
}

/** What `findRouteProblem` needs to know about one task route. */
export interface RouteCheck {
  /** The routed model's capabilities, or nothing when the catalog has no such model. */
  readonly capabilities: LlmCapabilities | undefined;
  /** Whether the owner enabled the route's provider (BR-27). */
  readonly isProviderEnabled: boolean;
  readonly needs: readonly LlmTaskNeed[];
}

/** The first need the model cannot meet, or none. */
export function findMissingCapability(
  capabilities: LlmCapabilities,
  needs: readonly LlmTaskNeed[],
): LlmTaskNeed | undefined {
  return needs.find((need) => !capabilities[CAPABILITY_BY_NEED[need]]);
}

/**
 * Checks one task route: the model exists, its provider is enabled, and it can do what the
 * task needs (BR-25, BR-27). 1a resolves the task route only; overrides and fallbacks are 1c.
 */
export function findRouteProblem(check: RouteCheck): RouteFinding | undefined {
  if (check.capabilities === undefined) {
    return { problem: "LLM_ROUTE_INVALID", refusal: "unknown_model" };
  }
  if (!check.isProviderEnabled) {
    return { problem: "LLM_ROUTE_INVALID", refusal: "provider_disabled" };
  }
  if (findMissingCapability(check.capabilities, check.needs) !== undefined) {
    return { problem: "LLM_ROUTE_INVALID", refusal: "missing_capability" };
  }
  return undefined;
}
