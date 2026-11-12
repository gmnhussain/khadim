import { describe, expect, it } from "vitest";

import { toolPolicyConfigSchema, toolPolicyEntrySchema } from "./tool.types";

describe("toolPolicyEntrySchema", () => {
  it.each(["auto", "propose", "approve"])("accepts the %s policy without limits", (policy) => {
    expect(toolPolicyEntrySchema.safeParse({ policy }).success).toBe(true);
  });

  it("accepts limits of one, the smallest limit", () => {
    const result = toolPolicyEntrySchema.safeParse({
      policy: "auto",
      maxCallsPerRun: 1,
      maxCallsPerDay: 1,
    });

    expect(result.success).toBe(true);
  });

  it("refuses an unknown policy", () => {
    const result = toolPolicyEntrySchema.safeParse({ policy: "autopilot" });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toMatchObject([{ code: "invalid_value", path: ["policy"] }]);
  });

  it("refuses a missing policy", () => {
    const result = toolPolicyEntrySchema.safeParse({});

    expect(result.success).toBe(false);
    expect(result.error?.issues).toMatchObject([{ code: "invalid_value", path: ["policy"] }]);
  });

  it.each(["maxCallsPerRun", "maxCallsPerDay"])("refuses a %s of zero", (field) => {
    const result = toolPolicyEntrySchema.safeParse({ policy: "auto", [field]: 0 });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toMatchObject([{ code: "too_small", path: [field] }]);
  });

  it("refuses a limit that is not a whole number", () => {
    const result = toolPolicyEntrySchema.safeParse({ policy: "auto", maxCallsPerRun: 1.5 });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toMatchObject([
      { code: "invalid_type", path: ["maxCallsPerRun"] },
    ]);
  });

  it("refuses an unknown key, so a misspelt limit is not silently ignored", () => {
    const result = toolPolicyEntrySchema.safeParse({ policy: "auto", maxCallsPerHour: 3 });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toMatchObject([
      { code: "unrecognized_keys", keys: ["maxCallsPerHour"], path: [] },
    ]);
  });
});

describe("toolPolicyConfigSchema", () => {
  it.each([
    ["policies", '{"policies":{"__proto__":{"policy":"auto"}},"tasks":{}}'],
    ["tasks", '{"policies":{},"tasks":{"__proto__":["read_note"]}}'],
  ])("refuses a __proto__ key in %s instead of dropping it (#7, KP-21)", (field, json) => {
    const result = toolPolicyConfigSchema.safeParse(JSON.parse(json));

    expect(result.success).toBe(false);
    expect(result.error?.issues).toMatchObject([{ code: "custom", path: [field, "__proto__"] }]);
  });

  it.each([
    ["policies", { policies: { ReadNote: { policy: "auto" } }, tasks: {} }],
    ["policies", { policies: { read: { policy: "auto" } }, tasks: {} }],
    ["tasks", { policies: {}, tasks: { "draft-post": [] } }],
  ])("refuses a key in %s that is not a name", (field, config) => {
    const result = toolPolicyConfigSchema.safeParse(config);

    expect(result.error?.issues.map((issue) => [issue.code, issue.path[0]])).toEqual([
      ["custom", field],
    ]);
  });

  it("accepts one-word task names such as chat", () => {
    expect(toolPolicyConfigSchema.safeParse({ policies: {}, tasks: { chat: [] } }).success).toBe(
      true,
    );
  });

  it("accepts policies by tool name and tools by task", () => {
    const result = toolPolicyConfigSchema.safeParse({
      policies: { get_current_time: { policy: "auto", maxCallsPerRun: 5 } },
      tasks: { chat: ["get_current_time"] },
    });

    expect(result.success).toBe(true);
  });

  it("accepts an empty configuration", () => {
    expect(toolPolicyConfigSchema.safeParse({ policies: {}, tasks: {} }).success).toBe(true);
  });

  it("refuses a configuration without tasks", () => {
    const result = toolPolicyConfigSchema.safeParse({ policies: {} });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toMatchObject([{ code: "invalid_type", path: ["tasks"] }]);
  });

  it("refuses an unknown top-level key", () => {
    const result = toolPolicyConfigSchema.safeParse({ policies: {}, tasks: {}, defaults: {} });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toMatchObject([
      { code: "unrecognized_keys", keys: ["defaults"], path: [] },
    ]);
  });

  it("reports an invalid policy with the path of its tool", () => {
    const result = toolPolicyConfigSchema.safeParse({
      policies: { publish_post: { policy: "always" } },
      tasks: {},
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toMatchObject([
      { code: "invalid_value", path: ["policies", "publish_post", "policy"] },
    ]);
  });

  it("refuses a task whose tool list holds something other than names", () => {
    const result = toolPolicyConfigSchema.safeParse({ policies: {}, tasks: { chat: [42] } });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toMatchObject([
      { code: "invalid_type", path: ["tasks", "chat", 0] },
    ]);
  });
});
