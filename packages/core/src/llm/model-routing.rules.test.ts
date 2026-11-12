import { describe, expect, it } from "vitest";

import type { LlmCapabilities } from "./llm.types";
import { findMissingCapability, findRouteProblem } from "./model-routing.rules";

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
  it("finds nothing for a known model on an enabled provider that meets the needs", () => {
    expect(
      findRouteProblem({ capabilities: FULL, isProviderEnabled: true, needs: ["tools"] }),
    ).toBeUndefined();
  });

  it("reports a route to a model the catalog does not list", () => {
    expect(
      findRouteProblem({ capabilities: undefined, isProviderEnabled: true, needs: [] }),
    ).toEqual({ problem: "LLM_ROUTE_INVALID", refusal: "unknown_model" });
  });

  it("reports a route to a provider the owner did not enable (BR-27)", () => {
    expect(findRouteProblem({ capabilities: FULL, isProviderEnabled: false, needs: [] })).toEqual({
      problem: "LLM_ROUTE_INVALID",
      refusal: "provider_disabled",
    });
  });

  it("reports a task that needs tools routed to a model without tool support (BR-25)", () => {
    expect(
      findRouteProblem({
        capabilities: { ...FULL, supportsTools: false },
        isProviderEnabled: true,
        needs: ["tools"],
      }),
    ).toEqual({ problem: "LLM_ROUTE_INVALID", refusal: "missing_capability" });
  });

  it("reports the unknown model before the disabled provider", () => {
    expect(
      findRouteProblem({ capabilities: undefined, isProviderEnabled: false, needs: ["tools"] }),
    ).toMatchObject({ refusal: "unknown_model" });
  });
});
