import { describe, expect, it } from "vitest";

import { LLM_PROBLEMS } from "./llm.errors";
import type { LlmStreamEvent } from "./llm.types";
import { computeBackoffMs, decideRetry, isEmittedContent, type RetryInput } from "./retry.rules";
import { createTextResponse } from "./testing";

function input(overrides: Partial<RetryInput> = {}): RetryInput {
  return {
    problem: "LLM_UNAVAILABLE",
    hasEmittedContent: false,
    attemptsMade: 1,
    maxAttempts: 3,
    remainingRunMs: 120_000,
    randomValue: 0,
    ...overrides,
  };
}

describe("isEmittedContent", () => {
  it.each<[LlmStreamEvent, boolean]>([
    [{ type: "started" }, false],
    [{ type: "reasoning" }, false],
    [{ type: "text_delta", text: "Hi" }, true],
    [{ type: "tool_call_started", toolCallId: "call_1", toolName: "get_current_time" }, true],
    [{ type: "completed", response: createTextResponse("Hi") }, false],
  ])("counts %j as emitted content: %s (D-9 rule 2)", (event, expected) => {
    expect(isEmittedContent(event)).toBe(expected);
  });
});

describe("computeBackoffMs", () => {
  it.each([
    [1, 0, 500],
    [1, 0.5, 750],
    [2, 0, 1000],
    [2, 0.5, 1500],
    [3, 0.25, 2500],
  ])(
    "after %i attempts with random value %d waits exactly %i ms (D-9 rule 4)",
    (attemptsMade, randomValue, expected) => {
      expect(computeBackoffMs(attemptsMade, randomValue)).toBe(expected);
    },
  );

  it("stays below the full backoff for a random value just under one", () => {
    expect(computeBackoffMs(1, 0.999_999)).toBe(999);
  });

  it("doubles until the 30-second cap and never passes it", () => {
    expect(computeBackoffMs(5, 0)).toBe(8000);
    expect(computeBackoffMs(6, 0)).toBe(15_000);
    expect(computeBackoffMs(7, 0)).toBe(15_000);
    expect(computeBackoffMs(1000, 0.999_999)).toBe(29_999);
  });
});

describe("decideRetry", () => {
  it.each(["LLM_RATE_LIMITED", "LLM_UNAVAILABLE"] as const)("retries %s (D-9)", (problem) => {
    expect(decideRetry(input({ problem }))).toEqual({ retry: true, delayMs: 500 });
  });

  it.each(
    LLM_PROBLEMS.filter(
      (problem) => problem !== "LLM_RATE_LIMITED" && problem !== "LLM_UNAVAILABLE",
    ),
  )("never retries %s: it fails fast (D-9)", (problem) => {
    expect(decideRetry(input({ problem }))).toEqual({ retry: false, refusal: "not_retryable" });
  });

  it("does not retry once text or a tool call was emitted (D-9 rule 2)", () => {
    expect(decideRetry(input({ hasEmittedContent: true }))).toEqual({
      retry: false,
      refusal: "content_emitted",
    });
  });

  it.each([
    [1, true],
    [2, true],
    [3, false],
    [4, false],
  ])("with maxAttempts 3 and %i attempts made, retries: %s (D-9 rule 3)", (attemptsMade, retry) => {
    const decision = decideRetry(input({ attemptsMade }));

    expect(decision.retry).toBe(retry);
    if (!decision.retry) {
      expect(decision.refusal).toBe("attempts_exhausted");
    }
  });

  it("with maxAttempts 1 never retries: the first try is the only one", () => {
    expect(decideRetry(input({ maxAttempts: 1 }))).toEqual({
      retry: false,
      refusal: "attempts_exhausted",
    });
  });

  it("uses the jittered backoff when the provider gave no delay", () => {
    expect(decideRetry(input({ attemptsMade: 2, randomValue: 0.5 }))).toEqual({
      retry: true,
      delayMs: 1500,
    });
  });

  it("waits the provider's delay in full when it is longer than the backoff (D-9 rule 1)", () => {
    expect(decideRetry(input({ problem: "LLM_RATE_LIMITED", retryAfterMs: 20_000 }))).toEqual({
      retry: true,
      delayMs: 20_000,
    });
  });

  it("keeps the backoff when the provider's delay is shorter", () => {
    expect(decideRetry(input({ problem: "LLM_RATE_LIMITED", retryAfterMs: 100 }))).toEqual({
      retry: true,
      delayMs: 500,
    });
  });

  it("treats a provider delay of zero as no delay", () => {
    expect(decideRetry(input({ problem: "LLM_RATE_LIMITED", retryAfterMs: 0 }))).toEqual({
      retry: true,
      delayMs: 500,
    });
  });

  it.each([
    [20_001, true],
    [20_000, false],
    [19_999, false],
    [0, false],
  ])(
    "with a 20-second provider delay and %i ms of running time left, retries: %s (D-9 rule 1)",
    (remainingRunMs, retry) => {
      const decision = decideRetry(
        input({ problem: "LLM_RATE_LIMITED", retryAfterMs: 20_000, remainingRunMs }),
      );

      expect(decision.retry).toBe(retry);
      if (!decision.retry) {
        expect(decision.refusal).toBe("exceeds_time_budget");
      }
    },
  );

  it.each([
    [501, true],
    [500, false],
    [499, false],
  ])(
    "with a 500 ms backoff and %i ms of running time left, retries: %s",
    (remainingRunMs, retry) => {
      const decision = decideRetry(input({ remainingRunMs }));

      expect(decision.retry).toBe(retry);
      if (!decision.retry) {
        expect(decision.refusal).toBe("exceeds_time_budget");
      }
    },
  );

  it("refuses a wait that would end exactly when the running time does: no time is left for the call", () => {
    expect(decideRetry(input({ remainingRunMs: 500 }))).toEqual({
      retry: false,
      refusal: "exceeds_time_budget",
    });
  });

  it("checks in a fixed order: retryable, emitted, attempts, then time", () => {
    const everythingWrong = { hasEmittedContent: true, attemptsMade: 3, remainingRunMs: 0 };

    expect(decideRetry(input({ ...everythingWrong, problem: "LLM_REFUSED" }))).toMatchObject({
      refusal: "not_retryable",
    });
    expect(decideRetry(input(everythingWrong))).toMatchObject({ refusal: "content_emitted" });
    expect(decideRetry(input({ ...everythingWrong, hasEmittedContent: false }))).toMatchObject({
      refusal: "attempts_exhausted",
    });
  });
});
