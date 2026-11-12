import { describe, expect, it } from "vitest";

import { LLM_PROBLEM_MESSAGES, LLM_PROBLEMS, LlmError, STOP_REASON_PROBLEMS } from "./llm.errors";
import { LLM_STOP_REASONS } from "./llm.types";

describe("LlmError: cause (L13)", () => {
  it("has no cause property when none was given (KP-07)", () => {
    expect("cause" in new LlmError("LLM_UNAVAILABLE")).toBe(false);
  });

  it("keeps the vendor error it was given as its cause", () => {
    const cause = new Error("vendor");

    expect(new LlmError("LLM_UNAVAILABLE", { cause }).cause).toBe(cause);
  });
});

describe("LLM problems", () => {
  it("has a message for every problem code (conventions §12.1)", () => {
    expect(Object.keys(LLM_PROBLEM_MESSAGES)).toEqual([...LLM_PROBLEMS]);
    for (const problem of LLM_PROBLEMS) {
      expect(LLM_PROBLEM_MESSAGES[problem]).not.toBe("");
    }
  });
});

describe("STOP_REASON_PROBLEMS", () => {
  it("covers every stop reason", () => {
    expect(Object.keys(STOP_REASON_PROBLEMS)).toEqual([...LLM_STOP_REASONS]);
  });

  it("gives a completed call no problem", () => {
    expect(STOP_REASON_PROBLEMS.end_turn).toBeUndefined();
    expect(STOP_REASON_PROBLEMS.tool_calls).toBeUndefined();
  });

  it("maps a refusal to LLM_REFUSED (plan D-8)", () => {
    expect(STOP_REASON_PROBLEMS.refusal).toBe("LLM_REFUSED");
  });

  it("maps a call cut off at its maximum output to LLM_OUTPUT_TRUNCATED (owner, 2026-11-12)", () => {
    expect(STOP_REASON_PROBLEMS.max_output).toBe("LLM_OUTPUT_TRUNCATED");
  });

  it("maps a context over the model's limit to LLM_CONTEXT_EXCEEDED (owner, 2026-11-12)", () => {
    expect(STOP_REASON_PROBLEMS.context_exceeded).toBe("LLM_CONTEXT_EXCEEDED");
  });
});

describe("LlmError", () => {
  it("carries its name, its problem code and that problem's message", () => {
    const error = new LlmError("LLM_UNAVAILABLE");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("LlmError");
    expect(error.problem).toBe("LLM_UNAVAILABLE");
    expect(error.message).toBe(LLM_PROBLEM_MESSAGES.LLM_UNAVAILABLE);
    expect(error.retryAfterMs).toBeUndefined();
    expect(error.usage).toBeUndefined();
    expect(error.task).toBeUndefined();
    expect(error.reason).toBeUndefined();
    expect(error.cause).toBeUndefined();
  });

  it("carries the provider's retry delay on a rate limit (plan D-9 rule 1)", () => {
    expect(new LlmError("LLM_RATE_LIMITED", { retryAfterMs: 20_000 }).retryAfterMs).toBe(20_000);
  });

  it("carries the tokens a failed call still used, so its cost is recorded (BR-23)", () => {
    const usage = { inputTokens: 50, outputTokens: 10, cacheWriteTokens: 0, cacheReadTokens: 0 };

    expect(new LlmError("LLM_REFUSED", { usage }).usage).toEqual(usage);
  });

  it("names the task and reason of an invalid route", () => {
    const error = new LlmError("LLM_ROUTE_INVALID", { task: "chat", reason: "unknown_model" });

    expect(error.task).toBe("chat");
    expect(error.reason).toBe("unknown_model");
  });

  it("keeps the vendor error as the cause and out of its own message (conventions §12.1)", () => {
    const cause = new Error('429 {"type":"error","error":{"type":"rate_limit_error"}}');
    const error = new LlmError("LLM_RATE_LIMITED", { cause });

    expect(error.cause).toBe(cause);
    expect(error.message).toBe("The model provider is rate limiting requests.");
  });

  it("carries a problem code and never an HTTP status (conventions §12.1)", () => {
    const error = new LlmError("LLM_RATE_LIMITED");

    expect(error).not.toHaveProperty("status");
    expect(error).not.toHaveProperty("statusCode");
  });
});
