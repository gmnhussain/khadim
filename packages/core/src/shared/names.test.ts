import { describe, expect, it } from "vitest";
import * as z from "zod";

import { namedRecordSchema, TASK_NAME_PATTERN, TOOL_NAME_PATTERN } from "./names";

describe("name patterns", () => {
  it.each(["chat", "draft_post", "eval_grader", "step2"])("accepts the task name %s", (name) => {
    expect(TASK_NAME_PATTERN.test(name)).toBe(true);
  });

  it.each(["", "Chat", "draft-post", "_chat", "chat_", "draft__post", "__proto__", "2chat"])(
    "refuses the task name %j",
    (name) => {
      expect(TASK_NAME_PATTERN.test(name)).toBe(false);
    },
  );

  it("needs two words or more in a tool name, unlike a task name", () => {
    expect(TOOL_NAME_PATTERN.test("chat")).toBe(false);
    expect(TOOL_NAME_PATTERN.test("read_note")).toBe(true);
  });
});

describe("namedRecordSchema", () => {
  const schema = namedRecordSchema(TASK_NAME_PATTERN, z.int());

  it("parses a record whose keys are names", () => {
    expect(schema.parse({ chat: 1, draft_post: 2 })).toEqual({ chat: 1, draft_post: 2 });
  });

  it("refuses a __proto__ key from JSON, which z.record alone drops (KP-21)", () => {
    const result = schema.safeParse(JSON.parse('{"__proto__":1,"chat":2}'));

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      { code: "custom", path: ["__proto__"], message: "Not a valid name: __proto__" },
    ]);
  });

  it("reports every key that is not a name, and stops before parsing the values", () => {
    const result = schema.safeParse({ Chat: "x", "draft-post": 1, chat: 1 });

    expect(result.error?.issues.map((issue) => issue.path)).toEqual([["Chat"], ["draft-post"]]);
  });

  it.each([[[]], [null], ["chat"]])(
    "leaves a value that is not an object, %j, to z.record",
    (value) => {
      const result = schema.safeParse(value);

      expect(result.error?.issues).toMatchObject([{ code: "invalid_type" }]);
    },
  );

  it("still checks the values", () => {
    expect(schema.safeParse({ chat: "x" }).error?.issues).toMatchObject([
      { code: "invalid_type", path: ["chat"] },
    ]);
  });
});
