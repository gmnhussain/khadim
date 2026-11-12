import { describe, expect, it } from "vitest";

import type { LlmCapabilities } from "../llm";
import {
  addCallUsage,
  addIteration,
  canRunInParallel,
  capTimeoutMs,
  computeRemainingRunMs,
  computeRunningMs,
  countCallTokens,
  DEFAULT_RUN_LIMITS,
  findLoopRouteProblem,
  findReachedLimit,
  ZERO_RUN_TOTALS,
} from "./agent.rules";
import type { RunLimits, RunTotals } from "./agent.types";

const LIMITS: RunLimits = {
  maxIterations: 10,
  maxCostMicroUsd: 500_000,
  maxTokens: 500_000,
  maxRunningMs: 120_000,
};

function totals(overrides: Partial<RunTotals> = {}): RunTotals {
  return { ...ZERO_RUN_TOTALS, ...overrides };
}

describe("DEFAULT_RUN_LIMITS", () => {
  it("holds the defaults of BR-21: 10 iterations, USD 0.50, 500,000 tokens, 2 minutes", () => {
    expect(DEFAULT_RUN_LIMITS).toEqual(LIMITS);
  });
});

describe("countCallTokens", () => {
  it("counts fresh and cached input, and output", () => {
    expect(
      countCallTokens({
        inputTokens: 1,
        outputTokens: 20,
        cacheWriteTokens: 300,
        cacheReadTokens: 4000,
      }),
    ).toBe(4321);
  });
});

describe("addCallUsage and addIteration", () => {
  it("adds the cost and tokens of a call and leaves the rest", () => {
    const before = totals({ iterations: 2, costMicroUsd: 10, tokens: 100, runningMs: 7 });

    const after = addCallUsage(
      before,
      { inputTokens: 5, outputTokens: 5, cacheWriteTokens: 0, cacheReadTokens: 0 },
      3,
    );

    expect(after).toEqual({ iterations: 2, costMicroUsd: 13, tokens: 110, runningMs: 7 });
    expect(before.costMicroUsd).toBe(10);
  });

  it("adds nothing for a failed call that reported no usage", () => {
    expect(addCallUsage(totals({ tokens: 5 }), undefined, 0)).toEqual(totals({ tokens: 5 }));
  });

  it("counts one more iteration", () => {
    expect(addIteration(totals({ iterations: 2, tokens: 9 }))).toEqual(
      totals({ iterations: 3, tokens: 9 }),
    );
  });
});

describe("computeRunningMs", () => {
  it("is zero at the moment a new run starts", () => {
    expect(computeRunningMs(0, 1000, 1000)).toBe(0);
  });

  it("counts the time since the run entered running", () => {
    expect(computeRunningMs(0, 1000, 4500)).toBe(3500);
  });

  it("adds the running time from before a pause, and none of the pause itself (conventions §15.1)", () => {
    // 30 s ran before the pause; the run re-entered running at t = 1 hour.
    expect(computeRunningMs(30_000, 3_600_000, 3_605_000)).toBe(35_000);
  });

  it("never goes below the earlier running time if the clock steps back", () => {
    expect(computeRunningMs(30_000, 5000, 4000)).toBe(30_000);
  });
});

describe("computeRemainingRunMs and capTimeoutMs", () => {
  it.each([
    [0, 120_000],
    [119_999, 1],
    [120_000, 0],
    [120_001, 0],
  ])("with %i ms used of 120,000, leaves %i ms", (runningMs, remaining) => {
    expect(computeRemainingRunMs(totals({ runningMs }), LIMITS)).toBe(remaining);
  });

  it.each([
    [120_000, 200_000, 120_000],
    [120_000, 120_000, 120_000],
    [120_000, 20_000, 20_000],
    [120_000, 0, 0],
  ])(
    "caps a route timeout of %i ms with %i ms left at %i ms",
    (routeTimeout, remaining, expected) => {
      expect(capTimeoutMs(routeTimeout, remaining)).toBe(expected);
    },
  );
});

describe("findLoopRouteProblem (review fixes, D-4)", () => {
  const FULL: LlmCapabilities = {
    supportsTools: true,
    supportsStreaming: true,
    supportsImages: false,
    supportsStructuredOutput: false,
    supportsPromptCaching: true,
    maxContextTokens: 200_000,
  };

  it("finds nothing for a streaming model with an adapter", () => {
    expect(
      findLoopRouteProblem({ hasAdapter: true, capabilities: FULL, hasTools: true }),
    ).toBeUndefined();
  });

  it("reports a route without an adapter first", () => {
    expect(
      findLoopRouteProblem({
        hasAdapter: false,
        capabilities: { ...FULL, supportsStreaming: false },
        hasTools: false,
      }),
    ).toEqual({ reason: "no_adapter" });
  });

  it("needs streaming for every route, tools or not", () => {
    expect(
      findLoopRouteProblem({
        hasAdapter: true,
        capabilities: { ...FULL, supportsStreaming: false },
        hasTools: false,
      }),
    ).toEqual({ reason: "missing_capability", need: "streaming" });
  });

  it.each([
    [true, { reason: "missing_capability", need: "tools" }],
    [false, undefined],
  ])("for a model without tools, with task tools %s, reports %j", (hasTools, expected) => {
    expect(
      findLoopRouteProblem({
        hasAdapter: true,
        capabilities: { ...FULL, supportsTools: false },
        hasTools,
      }),
    ).toEqual(expected);
  });
});

describe("findReachedLimit", () => {
  it("finds no limit for a run that has used nothing", () => {
    expect(findReachedLimit(ZERO_RUN_TOTALS, LIMITS)).toBeUndefined();
  });

  it.each([
    [0, undefined],
    [9, undefined],
    [10, "RUN_ITERATION_LIMIT"],
    [11, "RUN_ITERATION_LIMIT"],
  ] as const)("with %i of 10 iterations, returns %s (BR-21)", (iterations, expected) => {
    expect(findReachedLimit(totals({ iterations }), LIMITS)).toBe(expected);
  });

  it.each([
    [0, undefined],
    [499_999, undefined],
    [500_000, "RUN_BUDGET_EXCEEDED"],
    [500_001, "RUN_BUDGET_EXCEEDED"],
  ] as const)("with %i of 500,000 micro-USD, returns %s (BR-21)", (costMicroUsd, expected) => {
    expect(findReachedLimit(totals({ costMicroUsd }), LIMITS)).toBe(expected);
  });

  it.each([
    [0, undefined],
    [499_999, undefined],
    [500_000, "RUN_TOKEN_LIMIT"],
    [500_001, "RUN_TOKEN_LIMIT"],
  ] as const)("with %i of 500,000 tokens, returns %s (BR-21)", (tokens, expected) => {
    expect(findReachedLimit(totals({ tokens }), LIMITS)).toBe(expected);
  });

  it.each([
    [0, undefined],
    [119_999, undefined],
    [120_000, "RUN_TIME_LIMIT"],
    [120_001, "RUN_TIME_LIMIT"],
  ] as const)(
    "with %i of 120,000 ms of running time, returns %s (BR-21)",
    (runningMs, expected) => {
      expect(findReachedLimit(totals({ runningMs }), LIMITS)).toBe(expected);
    },
  );

  it("reports limits in a fixed order: iterations, cost, tokens, time", () => {
    const all = { iterations: 10, costMicroUsd: 500_000, tokens: 500_000, runningMs: 120_000 };

    expect(findReachedLimit(all, LIMITS)).toBe("RUN_ITERATION_LIMIT");
    expect(findReachedLimit({ ...all, iterations: 0 }, LIMITS)).toBe("RUN_BUDGET_EXCEEDED");
    expect(findReachedLimit({ ...all, iterations: 0, costMicroUsd: 0 }, LIMITS)).toBe(
      "RUN_TOKEN_LIMIT",
    );
  });
});

describe("canRunInParallel", () => {
  it("lets a step of read tools run in parallel (conventions §15.3)", () => {
    expect(canRunInParallel(["read", "read", "read"])).toBe(true);
    expect(canRunInParallel(["read"])).toBe(true);
  });

  it("is true for a step with nothing to execute", () => {
    expect(canRunInParallel([])).toBe(true);
  });

  it.each([
    [["local_write"]],
    [["external"]],
    [["read", "local_write"]],
    [["read", "read", "external"]],
  ] as const)("runs %j in order: a write is among them (ADR-0011)", (effects) => {
    expect(canRunInParallel(effects)).toBe(false);
  });
});
