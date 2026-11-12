import { describe, expect, it } from "vitest";

import type { LlmCapabilities } from "./llm.types";
import { findMissingCapability, findRouteProblem, type RouteCheck } from "./model-routing.rules";

const FULL: LlmCapabilities = {
  supportsTools: true,
  supportsStreaming: true,
  supportsImages: true,
  supportsStructuredOutput: true,
  supportsPromptCaching: true,
  maxContextTokens: 200_000,
};

describe("findMissingCapability", () => {
  it("finds nothing when the task needs nothing", () => {
    expect(findMissingCapability({ ...FULL, supportsTools: false }, [])).toBeUndefined();
  });

  it("finds nothing when the model meets every need", () => {
    expect(
      findMissingCapability(FULL, [
        "tools",
        "streaming",
        "images",
        "structured_output",
        "prompt_caching",
      ]),
    ).toBeUndefined();
  });

  it.each([
    ["tools", "supportsTools"],
    ["streaming", "supportsStreaming"],
    ["images", "supportsImages"],
    ["structured_output", "supportsStructuredOutput"],
    ["prompt_caching", "supportsPromptCaching"],
  ] as const)("reports %s when the model lacks %s (BR-25)", (need, flag) => {
    expect(findMissingCapability({ ...FULL, [flag]: false }, [need])).toBe(need);
  });

  it("reports the first unmet need, in the order the task lists them", () => {
    const capabilities = { ...FULL, supportsTools: false, supportsImages: false };

    expect(findMissingCapability(capabilities, ["streaming", "images", "tools"])).toBe("images");
  });
});

describe("findRouteProblem", () => {
  const check = (overrides: Partial<RouteCheck> = {}): RouteCheck => ({
    capabilities: FULL,
    modelMaxOutputTokens: 64_000,
    routeMaxOutputTokens: 16_000,
    isProviderEnabled: true,
    requirements: { needs: ["tools"], minContextTokens: 100_000 },
    ...overrides,
  });

  it("finds nothing for an enabled provider and a model that meets the task's requirements", () => {
    expect(findRouteProblem(check())).toBeUndefined();
  });

  it("reports a route to a provider the owner did not enable (BR-27)", () => {
    expect(findRouteProblem(check({ isProviderEnabled: false }))).toEqual({
      problem: "LLM_ROUTE_INVALID",
      refusal: "provider_disabled",
    });
  });

  it("names the need a model cannot meet (BR-25, L11)", () => {
    expect(findRouteProblem(check({ capabilities: { ...FULL, supportsTools: false } }))).toEqual({
      problem: "LLM_ROUTE_INVALID",
      refusal: "missing_capability",
      need: "tools",
    });
  });

  it.each([
    [200_000, undefined],
    [199_999, "context_too_small"],
  ])(
    "with a task that needs 200,000 tokens of context and a model of %i, reports %s (D-3)",
    (maxContextTokens, refusal) => {
      const finding = findRouteProblem(
        check({
          capabilities: { ...FULL, maxContextTokens },
          requirements: { needs: [], minContextTokens: 200_000 },
        }),
      );

      expect(finding?.refusal).toBe(refusal);
    },
  );

  it.each([
    [64_000, undefined],
    [64_001, "output_over_model_limit"],
  ])(
    "with a model limit of 64,000 output tokens and a route asking %i, reports %s (L5)",
    (routeMaxOutputTokens, refusal) => {
      expect(findRouteProblem(check({ routeMaxOutputTokens }))?.refusal).toBe(refusal);
    },
  );

  it.each([
    [8_191, undefined],
    [8_192, "output_not_below_context"],
  ])(
    "with an 8,192-token context and a route asking %i output tokens, reports %s (L5)",
    (routeMaxOutputTokens, refusal) => {
      const finding = findRouteProblem(
        check({
          capabilities: { ...FULL, maxContextTokens: 8_192 },
          routeMaxOutputTokens,
          requirements: { needs: [], minContextTokens: 0 },
        }),
      );

      expect(finding?.refusal).toBe(refusal);
    },
  );

  it("reports the disabled provider before a missing capability", () => {
    expect(
      findRouteProblem(
        check({ isProviderEnabled: false, capabilities: { ...FULL, supportsTools: false } }),
      ),
    ).toMatchObject({ refusal: "provider_disabled" });
  });
});
