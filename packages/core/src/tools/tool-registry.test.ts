import { describe, expect, it } from "vitest";
import * as z from "zod";

import { defineTool } from "./tool-definition";
import { ToolRefusedError } from "./tool.errors";
import { createToolRegistry } from "./tool-registry";
import {
  createFakeTool,
  createInMemoryToolCallCounter,
  FAKE_TOOL_MAX_TEXT_LENGTH,
} from "./testing";

const TASK = "chat";

function createFixture(policyConfig?: unknown) {
  const readTool = createFakeTool({ name: "read_note", effect: "read", output: { note: "hi" } });
  const writeTool = createFakeTool({ name: "save_note", effect: "local_write" });
  const proposeTool = createFakeTool({ name: "suggest_note", effect: "local_write" });
  const externalTool = createFakeTool({ name: "publish_note", effect: "external" });
  const counter = createInMemoryToolCallCounter();
  const registry = createToolRegistry({
    tools: [readTool.tool, writeTool.tool, proposeTool.tool, externalTool.tool],
    policyConfig: policyConfig ?? {
      policies: {
        read_note: { policy: "auto", maxCallsPerRun: 3, maxCallsPerDay: 5 },
        save_note: { policy: "auto" },
        suggest_note: { policy: "propose" },
        publish_note: { policy: "approve" },
      },
      tasks: {
        [TASK]: ["read_note", "save_note", "suggest_note", "publish_note"],
        draft_post: ["publish_note"],
      },
    },
    countCallsToday: counter.countCallsToday,
  });
  return { registry, readTool, writeTool, proposeTool, externalTool, counter };
}

function request(toolName: string, input: unknown = { text: "hello" }, callsThisRun = 0) {
  return { task: TASK, toolName, input, callsThisRun };
}

function captureError(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error("expected the action to throw");
}

describe("createToolRegistry: configuration", () => {
  it("refuses a tool registered twice", () => {
    const tool = createFakeTool({ name: "read_note", effect: "read" }).tool;

    expect(() =>
      createToolRegistry({
        tools: [tool, tool],
        policyConfig: { policies: {}, tasks: {} },
        countCallsToday: createInMemoryToolCallCounter().countCallsToday,
      }),
    ).toThrow("tool registered twice: read_note");
  });

  it("stops on a configuration of the wrong shape, keeping the schema issues as the cause", () => {
    const error = captureError(() => createFixture({ policies: {} }));

    expect(error).toBeInstanceOf(ToolRefusedError);
    expect(error).toMatchObject({ problem: "TOOL_POLICY_INVALID", toolName: undefined });
    expect((error as ToolRefusedError).cause).toBeInstanceOf(Error);
  });

  it("stops when an external tool is set to auto: the tier is a floor (BR-02, ADR-0011)", () => {
    const error = captureError(() =>
      createFixture({ policies: { publish_note: { policy: "auto" } }, tasks: {} }),
    );

    expect(error).toBeInstanceOf(ToolRefusedError);
    expect(error).toMatchObject({ problem: "TOOL_POLICY_INVALID", toolName: "publish_note" });
  });

  it("stops when a task lists a tool without a policy: never silently left out (ADR-0014)", () => {
    const error = captureError(() =>
      createFixture({
        policies: { read_note: { policy: "auto" } },
        tasks: { [TASK]: ["read_note", "save_note"] },
      }),
    );

    expect(error).toBeInstanceOf(ToolRefusedError);
    expect(error).toMatchObject({ problem: "TOOL_UNCLASSIFIED", toolName: "save_note" });
  });

  it("stops when a task lists a tool no source provides (ADR-0014)", () => {
    const error = captureError(() =>
      createFixture({
        policies: { send_email: { policy: "approve" } },
        tasks: { [TASK]: ["send_email"] },
      }),
    );

    expect(error).toMatchObject({ problem: "TOOL_UNCLASSIFIED", toolName: "send_email" });
  });
});

describe("listTools", () => {
  it("offers a task its tools with name, description and JSON Schema, in configured order", () => {
    const { registry } = createFixture();

    const tools = registry.listTools(TASK);

    expect(tools.map((tool) => tool.name)).toEqual([
      "read_note",
      "save_note",
      "suggest_note",
      "publish_note",
    ]);
    expect(tools[0]).toMatchObject({
      name: "read_note",
      description: "Fake read tool for tests.",
      inputJsonSchema: { type: "object", additionalProperties: false },
    });
    expect(Object.keys(tools[0] ?? {})).toEqual(["name", "description", "inputJsonSchema"]);
  });

  it("offers each task only its own tools: least privilege (conventions §15.11)", () => {
    const { registry } = createFixture();

    expect(registry.listTools("draft_post").map((tool) => tool.name)).toEqual(["publish_note"]);
  });

  it("never offers a registered tool that no task lists (ADR-0014)", () => {
    const { registry } = createFixture({
      policies: { read_note: { policy: "auto" } },
      tasks: { [TASK]: ["read_note"] },
    });

    expect(registry.listTools(TASK).map((tool) => tool.name)).toEqual(["read_note"]);
  });

  it.each(["summarise", "constructor", "__proto__"])(
    "offers nothing to the unconfigured task %s",
    (task) => {
      const { registry } = createFixture();

      expect(registry.listTools(task)).toEqual([]);
    },
  );

  it("lists a tool once when the task names it twice", () => {
    const { registry } = createFixture({
      policies: { read_note: { policy: "auto" } },
      tasks: { [TASK]: ["read_note", "read_note"] },
    });

    expect(registry.listTools(TASK)).toHaveLength(1);
  });
});

describe("resolveToolCall", () => {
  it("resolves a valid call with its tier, policy and validated input, without running it", async () => {
    const { registry, readTool } = createFixture();

    const resolution = await registry.resolveToolCall(request("read_note"));

    expect(resolution).toEqual({
      ok: true,
      value: {
        toolName: "read_note",
        effect: "read",
        policy: "auto",
        pausesRun: false,
        input: { text: "hello" },
      },
    });
    expect(readTool.handledInputs).toEqual([]);
  });

  it("marks only an approve call as pausing the run; propose continues (ADR-0011)", async () => {
    const { registry } = createFixture();

    const proposed = await registry.resolveToolCall(request("suggest_note"));
    const approved = await registry.resolveToolCall(request("publish_note"));

    expect(proposed).toMatchObject({ ok: true, value: { policy: "propose", pausesRun: false } });
    expect(approved).toMatchObject({ ok: true, value: { policy: "approve", pausesRun: true } });
  });

  it.each(["delete_note", "constructor", "__proto__", "toString", ""])(
    "returns TOOL_NOT_FOUND for the tool name %j (KP-08)",
    async (toolName) => {
      const { registry } = createFixture();

      expect(await registry.resolveToolCall(request(toolName))).toEqual({
        ok: false,
        problem: "TOOL_NOT_FOUND",
        message: "This tool is not available in this run.",
      });
    },
  );

  it("returns TOOL_NOT_FOUND for a tool another task has but this one does not", async () => {
    const { registry } = createFixture();

    const resolution = await registry.resolveToolCall({
      task: "draft_post",
      toolName: "read_note",
      input: { text: "hello" },
      callsThisRun: 0,
    });

    expect(resolution).toMatchObject({ ok: false, problem: "TOOL_NOT_FOUND" });
  });

  it("returns TOOL_NOT_FOUND for an unconfigured task", async () => {
    const { registry } = createFixture();

    const resolution = await registry.resolveToolCall({ ...request("read_note"), task: "other" });

    expect(resolution).toMatchObject({ ok: false, problem: "TOOL_NOT_FOUND" });
  });

  it("returns TOOL_INPUT_INVALID the model can act on, without calling the handler (conventions §15.4)", async () => {
    const { registry, readTool } = createFixture();
    const tooLong = "x".repeat(FAKE_TOOL_MAX_TEXT_LENGTH + 1);

    const resolution = await registry.resolveToolCall(request("read_note", { text: tooLong }));

    expect(resolution).toMatchObject({ ok: false, problem: "TOOL_INPUT_INVALID" });
    expect(resolution).toHaveProperty(
      "message",
      expect.stringMatching(/^The tool input does not match its schema\. input\.text: /),
    );
    expect(readTool.handledInputs).toEqual([]);
  });

  it("accepts input at the maximum length", async () => {
    const { registry } = createFixture();
    const longest = "x".repeat(FAKE_TOOL_MAX_TEXT_LENGTH);

    const resolution = await registry.resolveToolCall(request("read_note", { text: longest }));

    expect(resolution.ok).toBe(true);
  });

  it("names the unknown key in the message", async () => {
    const { registry } = createFixture();

    const resolution = await registry.resolveToolCall(
      request("read_note", { text: "hello", platform: "linkedin" }),
    );

    expect(resolution).toMatchObject({ ok: false, problem: "TOOL_INPUT_INVALID" });
    expect(resolution).toHaveProperty("message", expect.stringContaining("platform"));
  });

  it("reports at most five issues, so a badly wrong input stays a short message", async () => {
    const wideTool = defineTool({
      name: "save_form",
      description: "Saves a form.",
      effect: "read",
      inputSchema: z.strictObject({
        a: z.string(),
        b: z.string(),
        c: z.string(),
        d: z.string(),
        e: z.string(),
        f: z.string(),
        g: z.string(),
      }),
      handler: () => Promise.resolve({}),
    });
    const registry = createToolRegistry({
      tools: [wideTool],
      policyConfig: {
        policies: { save_form: { policy: "auto" } },
        tasks: { [TASK]: ["save_form"] },
      },
      countCallsToday: createInMemoryToolCallCounter().countCallsToday,
    });

    const resolution = await registry.resolveToolCall(request("save_form", {}));
    if (resolution.ok) {
      throw new Error("expected a refusal");
    }

    expect(resolution.message.split("; ")).toHaveLength(5);
    expect(resolution.message).toContain("input.a: ");
    expect(resolution.message).toContain("input.e: ");
    expect(resolution.message).not.toContain("input.f: ");
  });

  it.each([
    [0, true],
    [2, true],
    [3, false],
    [4, false],
  ])("with a per-run limit of 3 and %i earlier calls, accepts: %s", async (callsThisRun, ok) => {
    const { registry } = createFixture();

    const resolution = await registry.resolveToolCall(
      request("read_note", { text: "hello" }, callsThisRun),
    );

    expect(resolution.ok).toBe(ok);
    if (!resolution.ok) {
      expect(resolution).toEqual({
        ok: false,
        problem: "TOOL_LIMIT_REACHED",
        message: "The tool reached its per-run or per-day call limit.",
      });
    }
  });

  it.each([
    [0, true],
    [4, true],
    [5, false],
    [6, false],
  ])("with a per-day limit of 5 and %i calls today, accepts: %s", async (callsToday, ok) => {
    const { registry, counter, readTool } = createFixture();
    counter.setCallsToday("read_note", callsToday);

    const resolution = await registry.resolveToolCall(request("read_note"));

    expect(resolution.ok).toBe(ok);
    if (!resolution.ok) {
      expect(resolution.problem).toBe("TOOL_LIMIT_REACHED");
    }
    expect(readTool.handledInputs).toEqual([]);
  });

  it("asks for today's count only for a tool with a per-day limit", async () => {
    const { registry, counter } = createFixture();

    await registry.resolveToolCall(request("save_note"));
    await registry.resolveToolCall(request("read_note"));

    expect(counter.requestedToolNames).toEqual(["read_note"]);
  });

  it("checks the input before the limits, and neither when the tool is not offered", async () => {
    const { registry, counter } = createFixture();
    counter.setCallsToday("read_note", 99);

    const invalid = await registry.resolveToolCall(request("read_note", {}, 99));
    await registry.resolveToolCall(request("delete_note", {}, 99));

    expect(invalid).toMatchObject({ ok: false, problem: "TOOL_INPUT_INVALID" });
    expect(counter.requestedToolNames).toEqual([]);
  });
});

describe("executeToolCall", () => {
  async function resolve(registry: ReturnType<typeof createFixture>["registry"], toolName: string) {
    const resolution = await registry.resolveToolCall(request(toolName));
    if (!resolution.ok) {
      throw new Error(`expected ${toolName} to resolve`);
    }
    return resolution.value;
  }

  it("runs the handler with the validated input and returns its output", async () => {
    const { registry, readTool } = createFixture();
    const resolved = await resolve(registry, "read_note");

    const execution = await registry.executeToolCall(resolved);

    expect(execution).toEqual({ ok: true, value: { note: "hi" } });
    expect(readTool.handledInputs).toEqual([{ text: "hello" }]);
  });

  it("runs a propose tool now, like auto (ADR-0011)", async () => {
    const { registry, proposeTool } = createFixture();
    const resolved = await resolve(registry, "suggest_note");

    const execution = await registry.executeToolCall(resolved);

    expect(execution).toEqual({ ok: true, value: { done: true } });
    expect(proposeTool.handledInputs).toEqual([{ text: "hello" }]);
  });

  it("never executes an approve tool (BR-02)", async () => {
    const { registry, externalTool } = createFixture();
    const resolved = await resolve(registry, "publish_note");

    await expect(registry.executeToolCall(resolved)).rejects.toThrow(
      "an approve tool never executes inside the loop: publish_note",
    );
    expect(externalTool.handledInputs).toEqual([]);
  });

  it("does not execute an approve tool when the resolved call is altered (BR-02)", async () => {
    const { registry, externalTool } = createFixture();
    const resolved = await resolve(registry, "publish_note");

    await expect(registry.executeToolCall({ ...resolved, pausesRun: false })).rejects.toThrow(
      "tool call was not resolved here or already executed: publish_note",
    );
    expect(externalTool.handledInputs).toEqual([]);
  });

  it("executes a resolved call only once", async () => {
    const { registry, writeTool } = createFixture();
    const resolved = await resolve(registry, "save_note");

    await registry.executeToolCall(resolved);

    await expect(registry.executeToolCall(resolved)).rejects.toThrow(
      "tool call was not resolved here or already executed: save_note",
    );
    expect(writeTool.handledInputs).toHaveLength(1);
  });

  it("refuses a call another registry resolved", async () => {
    const first = createFixture();
    const second = createFixture();
    const resolved = await resolve(first.registry, "save_note");

    await expect(second.registry.executeToolCall(resolved)).rejects.toThrow(
      "tool call was not resolved here or already executed: save_note",
    );
    expect(second.writeTool.handledInputs).toEqual([]);
  });

  it("turns a failing handler into an error result without its internals (conventions §15.4)", async () => {
    const failure = new Error("connect ECONNREFUSED 10.0.0.5:5432");
    const failingTool = createFakeTool({ name: "read_note", effect: "read", failure });
    const registry = createToolRegistry({
      tools: [failingTool.tool],
      policyConfig: {
        policies: { read_note: { policy: "auto" } },
        tasks: { [TASK]: ["read_note"] },
      },
      countCallsToday: createInMemoryToolCallCounter().countCallsToday,
    });
    const resolved = await resolve(registry, "read_note");

    const execution = await registry.executeToolCall(resolved);

    expect(execution).toEqual({
      ok: false,
      problem: "TOOL_EXECUTION_FAILED",
      message: "The tool failed. Try again, or continue without it.",
      cause: failure,
    });
  });
});
