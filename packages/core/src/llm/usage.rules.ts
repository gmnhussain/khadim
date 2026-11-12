import type { LlmUsage, PriceTier } from "./llm.types";

const TOKENS_PER_PRICE_UNIT = 1_000_000;

/** The size of a call's prompt: fresh input plus what was written to and read from the cache. */
export function countPromptTokens(usage: LlmUsage): number {
  return usage.inputTokens + usage.cacheWriteTokens + usage.cacheReadTokens;
}

/**
 * Whether tiers cover every prompt size exactly once: each tier but the last has a maximum,
 * the maximums rise, and the last tier has none.
 */
export function arePriceTiersValid(tiers: readonly PriceTier[]): boolean {
  const lastTier = tiers.at(-1);
  if (lastTier === undefined || lastTier.maxPromptTokens !== undefined) {
    return false;
  }
  let previousMax = 0;
  for (const tier of tiers.slice(0, -1)) {
    if (tier.maxPromptTokens === undefined || tier.maxPromptTokens <= previousMax) {
      return false;
    }
    previousMax = tier.maxPromptTokens;
  }
  return true;
}

/** The tier a prompt of this size is billed at: the first whose maximum it does not exceed. */
export function selectPriceTier(tiers: readonly PriceTier[], promptTokens: number): PriceTier {
  const tier = tiers.find(
    (candidate) =>
      candidate.maxPromptTokens === undefined || promptTokens <= candidate.maxPromptTokens,
  );
  if (tier === undefined) {
    throw new Error("price tiers do not cover the prompt size: the catalog was not validated");
  }
  return tier;
}

/**
 * The cost of one call in whole micro-USD, rounded up so a budget never undercounts
 * (owner, 2026-11-12). The whole call is billed at the tier its prompt size selects (plan D-1).
 */
export function calculateCallCostMicroUsd(usage: LlmUsage, tiers: readonly PriceTier[]): number {
  const tier = selectPriceTier(tiers, countPromptTokens(usage));
  const microUsdTimesUnit =
    usage.inputTokens * tier.inputMicroUsdPerMillionTokens +
    usage.outputTokens * tier.outputMicroUsdPerMillionTokens +
    usage.cacheWriteTokens * tier.cacheWriteMicroUsdPerMillionTokens +
    usage.cacheReadTokens * tier.cacheReadMicroUsdPerMillionTokens;
  return Math.ceil(microUsdTimesUnit / TOKENS_PER_PRICE_UNIT);
}
