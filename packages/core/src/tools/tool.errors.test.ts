import { describe, expect, it } from "vitest";

import { TOOL_PROBLEM_MESSAGES, TOOL_PROBLEMS, ToolRefusedError } from "./tool.errors";

describe("tool problems", () => {
  it("has a message for every problem code (conventions §12.1)", () => {
    expect(Object.keys(TOOL_PROBLEM_MESSAGES)).toEqual([...TOOL_PROBLEMS]);
    for (const problem of TOOL_PROBLEMS) {
      expect(TOOL_PROBLEM_MESSAGES[problem]).not.toBe("");
    }
  });
});

describe("ToolRefusedError", () => {
  it("carries its name, its problem code and that problem's message", () => {
    const error = new ToolRefusedError("TOOL_UNCLASSIFIED");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ToolRefusedError");
    expect(error.problem).toBe("TOOL_UNCLASSIFIED");
    expect(error.message).toBe(TOOL_PROBLEM_MESSAGES.TOOL_UNCLASSIFIED);
    expect(error.toolName).toBeUndefined();
    expect(error.cause).toBeUndefined();
  });

  it("has no cause property when none was given (L13, KP-07)", () => {
    expect("cause" in new ToolRefusedError("TOOL_UNCLASSIFIED")).toBe(false);
  });

  it("names the tool and keeps the cause for logs", () => {
    const cause = new Error("schema issue");
    const error = new ToolRefusedError("TOOL_POLICY_INVALID", {
      toolName: "publish_post",
      cause,
    });

    expect(error.toolName).toBe("publish_post");
    expect(error.cause).toBe(cause);
  });

  it("carries a problem code and never an HTTP status (conventions §12.1)", () => {
    const error = new ToolRefusedError("TOOL_POLICY_INVALID");

    expect(error).not.toHaveProperty("status");
    expect(error).not.toHaveProperty("statusCode");
  });
});
