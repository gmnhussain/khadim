import { describe, expect, it } from "vitest";

import type { LlmUsage, PriceTier } from "./llm.types";
import {
  arePriceTiersValid,
  calculateCallCostMicroUsd,
  countPromptTokens,
  selectPriceTier,
} from "./usage.rules";

const LOW_TIER: PriceTier = {
  maxPromptTokens: 100_000,
  inputMicroUsdPerMillionTokens: 100_000,
  outputMicroUsdPerMillionTokens: 500_000,
  cacheWriteMicroUsdPerMillionTokens: 125_000,
  cacheReadMicroUsdPerMillionTokens: 10_000,
};

const HIGH_TIER: PriceTier = {
  inputMicroUsdPerMillionTokens: 500_000,
  outputMicroUsdPerMillionTokens: 2_500_000,
  cacheWriteMicroUsdPerMillionTokens: 625_000,
  cacheReadMicroUsdPerMillionTokens: 50_000,
};

const TIERS = [LOW_TIER, HIGH_TIER];

function usage(overrides: Partial<LlmUsage> = {}): LlmUsage {
  return { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, ...overrides };
}

describe("countPromptTokens", () => {
  it("adds fresh input, cache writes and cache reads, and leaves output out", () => {
    expect(
      countPromptTokens({
        inputTokens: 10,
        outputTokens: 1000,
        cacheWriteTokens: 20,
        cacheReadTokens: 30,
      }),
    ).toBe(60);
  });

  it("is zero for an empty call", () => {
    expect(countPromptTokens(usage())).toBe(0);
  });
});

describe("arePriceTiersValid", () => {
  it("accepts one tier without a maximum", () => {
    expect(arePriceTiersValid([HIGH_TIER])).toBe(true);
  });

  it("accepts rising maximums that end in a tier without one", () => {
    const middle = { ...LOW_TIER, maxPromptTokens: 200_000 };

    expect(arePriceTiersValid([LOW_TIER, middle, HIGH_TIER])).toBe(true);
  });

  it("refuses no tiers", () => {
    expect(arePriceTiersValid([])).toBe(false);
  });

  it("refuses a last tier with a maximum: larger prompts would have no price", () => {
    expect(arePriceTiersValid([LOW_TIER])).toBe(false);
  });

  it("refuses an earlier tier without a maximum", () => {
    expect(arePriceTiersValid([HIGH_TIER, HIGH_TIER])).toBe(false);
  });

  it.each([100_000, 99_999])(
    "refuses a second maximum of %i after 100,000: maximums must rise",
    (maxPromptTokens) => {
      expect(arePriceTiersValid([LOW_TIER, { ...LOW_TIER, maxPromptTokens }, HIGH_TIER])).toBe(
        false,
      );
    },
  );
});

describe("selectPriceTier", () => {
  it.each([
    [0, LOW_TIER],
    [99_999, LOW_TIER],
    [100_000, LOW_TIER],
    [100_001, HIGH_TIER],
    [1_000_000, HIGH_TIER],
  ])(
    "bills a prompt of %i tokens at the right side of the 100K boundary (plan P-6)",
    (size, tier) => {
      expect(selectPriceTier(TIERS, size)).toBe(tier);
    },
  );

  it("refuses tiers that do not cover the prompt size: an unvalidated catalog", () => {
    expect(() => selectPriceTier([LOW_TIER], 100_001)).toThrow("the catalog was not validated");
    expect(() => selectPriceTier([], 0)).toThrow("the catalog was not validated");
  });
});

describe("calculateCallCostMicroUsd", () => {
  it("costs nothing for a call with no tokens", () => {
    expect(calculateCallCostMicroUsd(usage(), TIERS)).toBe(0);
  });

  it("prices each kind of token at its own rate", () => {
    const cost = calculateCallCostMicroUsd(
      { inputTokens: 1000, outputTokens: 200, cacheWriteTokens: 400, cacheReadTokens: 5000 },
      TIERS,
    );

    // 1000 × 0.1 + 200 × 0.5 + 400 × 0.125 + 5000 × 0.01 micro-USD
    expect(cost).toBe(100 + 100 + 50 + 50);
  });

  it("prices a million tokens at exactly the listed price", () => {
    expect(calculateCallCostMicroUsd(usage({ outputTokens: 1_000_000 }), TIERS)).toBe(500_000);
  });

  it("uses the low tier at exactly 100,000 prompt tokens (plan D-1, P-6)", () => {
    expect(calculateCallCostMicroUsd(usage({ inputTokens: 100_000 }), TIERS)).toBe(10_000);
  });

  it("uses the high tier for the whole call at 100,001 prompt tokens", () => {
    const cost = calculateCallCostMicroUsd(
      usage({ inputTokens: 100_001, outputTokens: 1000 }),
      TIERS,
    );

    // 100,001 × 0.5 = 50,000.5, plus 1000 × 2.5 = 2500; rounded up.
    expect(cost).toBe(52_501);
  });

  it("counts cached tokens toward the prompt size that selects the tier", () => {
    const below = usage({ inputTokens: 1, cacheReadTokens: 99_999 });
    const above = usage({ inputTokens: 2, cacheReadTokens: 99_999 });

    // Low tier: 1 × 0.1 + 99,999 × 0.01 = 1000.09. High tier: 2 × 0.5 + 99,999 × 0.05 = 5000.95.
    expect(calculateCallCostMicroUsd(below, TIERS)).toBe(1001);
    expect(calculateCallCostMicroUsd(above, TIERS)).toBe(5001);
  });

  it("does not let output tokens change the tier", () => {
    const cost = calculateCallCostMicroUsd(
      usage({ inputTokens: 10, outputTokens: 500_000 }),
      TIERS,
    );

    expect(cost).toBe(1 + 250_000);
  });

  it.each([
    [1, 1],
    [9, 1],
    [10, 1],
    [11, 2],
  ])(
    "rounds %i input tokens at 0.1 micro-USD each up to %i (owner, 2026-11-12)",
    (tokens, cost) => {
      expect(calculateCallCostMicroUsd(usage({ inputTokens: tokens }), TIERS)).toBe(cost);
    },
  );

  it("rounds the call once, not each kind of token", () => {
    // 5 × 0.1 + 1 × 0.5 = 1.0 exactly; rounding each part up would give 2.
    expect(calculateCallCostMicroUsd(usage({ inputTokens: 5, outputTokens: 1 }), TIERS)).toBe(1);
  });
});
