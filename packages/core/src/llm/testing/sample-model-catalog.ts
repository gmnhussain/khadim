import type { LlmCapabilities } from "../llm.types";
import type { ModelCatalogInput } from "../model-registry";
import type { TaskRequirements } from "../model-routing.rules";

const CLAUDE_CAPABILITIES: LlmCapabilities = {
  supportsTools: true,
  supportsStreaming: true,
  supportsImages: true,
  supportsStructuredOutput: true,
  supportsPromptCaching: true,
  maxContextTokens: 1_000_000,
};

/**
 * The most output per call, for tests only. The real value of each model is confirmed against
 * the provider's docs with the catalog file in 1b (review fixes, D-3).
 */
const SAMPLE_MAX_OUTPUT_TOKENS = 64_000;

/**
 * A catalog with the values of plan D-1, for tests only. Prices are micro-USD per million
 * tokens. The real catalog is a config file read by the worker in 1b, with ids, limits and
 * prices confirmed against the provider's docs then (plan D-4).
 */
export const SAMPLE_MODEL_CATALOG = {
  models: [
    {
      provider: "anthropic",
      id: "claude-haiku-5-5",
      capabilities: CLAUDE_CAPABILITIES,
      maxOutputTokens: SAMPLE_MAX_OUTPUT_TOKENS,
      priceTiers: [
        {
          maxPromptTokens: 100_000,
          inputMicroUsdPerMillionTokens: 100_000,
          outputMicroUsdPerMillionTokens: 500_000,
          cacheWriteMicroUsdPerMillionTokens: 125_000,
          cacheReadMicroUsdPerMillionTokens: 10_000,
        },
        {
          inputMicroUsdPerMillionTokens: 500_000,
          outputMicroUsdPerMillionTokens: 2_500_000,
          cacheWriteMicroUsdPerMillionTokens: 625_000,
          cacheReadMicroUsdPerMillionTokens: 50_000,
        },
      ],
    },
    {
      provider: "anthropic",
      id: "claude-sonnet-5-5",
      capabilities: CLAUDE_CAPABILITIES,
      maxOutputTokens: SAMPLE_MAX_OUTPUT_TOKENS,
      priceTiers: [
        {
          inputMicroUsdPerMillionTokens: 2_000_000,
          outputMicroUsdPerMillionTokens: 10_000_000,
          cacheWriteMicroUsdPerMillionTokens: 2_500_000,
          cacheReadMicroUsdPerMillionTokens: 100_000,
        },
      ],
    },
    {
      provider: "anthropic",
      id: "claude-opus-5-5",
      capabilities: CLAUDE_CAPABILITIES,
      maxOutputTokens: SAMPLE_MAX_OUTPUT_TOKENS,
      priceTiers: [
        {
          inputMicroUsdPerMillionTokens: 4_000_000,
          outputMicroUsdPerMillionTokens: 20_000_000,
          cacheWriteMicroUsdPerMillionTokens: 5_000_000,
          cacheReadMicroUsdPerMillionTokens: 200_000,
        },
      ],
    },
  ],
  routes: {
    chat: { provider: "anthropic", model: "claude-haiku-5-5", effort: "low" },
    draft_post: { provider: "anthropic", model: "claude-sonnet-5-5", effort: "medium" },
    draft_reply: { provider: "anthropic", model: "claude-sonnet-5-5", effort: "medium" },
    eval_grader: { provider: "anthropic", model: "claude-opus-5-5", effort: "high" },
  },
} satisfies ModelCatalogInput;

/** What the sample tasks need from their models; the context sizes are test values. */
export const SAMPLE_TASK_REQUIREMENTS: ReadonlyMap<string, TaskRequirements> = new Map([
  ["chat", { needs: ["tools", "streaming"], minContextTokens: 100_000 }],
  ["draft_post", { needs: ["tools"], minContextTokens: 50_000 }],
  ["draft_reply", { needs: ["tools"], minContextTokens: 50_000 }],
]);
