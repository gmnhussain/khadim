import { describe, expect, it } from "vitest";

import { AGENT_PROBLEM_MESSAGES, AGENT_PROBLEMS } from "../agent.errors";
import { createFakePendingActions } from "./fake-pending-actions";
import { createFakeSleep } from "./fake-sleep";
import { createInMemoryRunStore } from "./in-memory-run-store";

describe("agent problems", () => {
  it("has a message for every problem code (conventions §12.1)", () => {
    expect(Object.keys(AGENT_PROBLEM_MESSAGES)).toEqual([...AGENT_PROBLEMS]);
    for (const problem of AGENT_PROBLEMS) {
      expect(AGENT_PROBLEM_MESSAGES[problem]).not.toBe("");
    }
  });

  it("has one code for each limit of BR-21", () => {
    expect(AGENT_PROBLEMS).toEqual([
      "RUN_ITERATION_LIMIT",
      "RUN_BUDGET_EXCEEDED",
      "RUN_TOKEN_LIMIT",
      "RUN_TIME_LIMIT",
    ]);
  });
});

describe("createInMemoryRunStore", () => {
  it("keeps each kind of record and the order of all writes", async () => {
    const store = createInMemoryRunStore();
    const totals = { iterations: 1, costMicroUsd: 20, tokens: 120, runningMs: 0 };

    await store.recordLlmCall({
      runId: "run",
      stepNumber: 1,
      attempt: 1,
      provider: "anthropic",
      model: "claude-haiku-5-5",
      usage: undefined,
      costMicroUsd: 0,
      latencyMs: 5,
      stopReason: "end_turn",
      problem: undefined,
    });
    await store.recordStep({
      runId: "run",
      stepNumber: 1,
      promptVersion: "system.v1",
      content: [],
    });
    await store.recordToolCall({
      runId: "run",
      stepNumber: 1,
      toolCallId: "call_1",
      toolName: "get_current_time",
      input: {},
      policy: "auto",
      result: { status: "completed", output: "{}" },
      durationMs: 1,
    });
    await store.recordOutcome({
      runId: "run",
      outcome: { status: "succeeded", answer: "Hi" },
      totals,
    });

    expect(store.llmCalls).toHaveLength(1);
    expect(store.steps).toHaveLength(1);
    expect(store.toolCalls).toHaveLength(1);
    expect(store.outcomes).toEqual([
      { runId: "run", outcome: { status: "succeeded", answer: "Hi" }, totals },
    ]);
    expect(store.writes).toEqual(["llm_call", "step", "tool_call", "outcome"]);
  });
});

describe("createFakeSleep", () => {
  it("returns at once, records the delay and moves the clock by it", async () => {
    const advanced: number[] = [];
    const fake = createFakeSleep({ advanceBy: (milliseconds) => advanced.push(milliseconds) });

    await fake.sleep(500, new AbortController().signal);

    expect(fake.delays).toEqual([500]);
    expect(fake.completedDelays).toEqual([500]);
    expect(advanced).toEqual([500]);
  });

  it("does not move the clock for a wait that is cancelled while it starts", async () => {
    const advanced: number[] = [];
    const controller = new AbortController();
    const fake = createFakeSleep({
      advanceBy: (milliseconds) => advanced.push(milliseconds),
      onSleep: () => {
        controller.abort();
      },
    });

    await fake.sleep(60_000, controller.signal);

    expect(fake.delays).toEqual([60_000]);
    expect(fake.completedDelays).toEqual([]);
    expect(advanced).toEqual([]);
  });
});

describe("createFakePendingActions", () => {
  it("hands out ids in order and remembers each request", async () => {
    const fake = createFakePendingActions();
    const request = {
      runId: "run",
      stepNumber: 1,
      toolCallId: "call_1",
      toolName: "publish_post",
      input: { text: "Hello" },
    };

    await expect(fake.requestPendingAction(request)).resolves.toEqual({
      pendingActionId: "pending_1",
    });
    await expect(fake.requestPendingAction({ ...request, toolCallId: "call_2" })).resolves.toEqual({
      pendingActionId: "pending_2",
    });
    expect(fake.requests.map((entry) => entry.toolCallId)).toEqual(["call_1", "call_2"]);
  });
});
