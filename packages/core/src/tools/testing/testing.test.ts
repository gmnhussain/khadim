import { describe, expect, it } from "vitest";

import { createFakeTool } from "./fake-tool";
import { createInMemoryToolCallCounter } from "./in-memory-tool-call-counter";

describe("createFakeTool", () => {
  it.each(["read", "local_write", "external"] as const)("creates a %s tool", (effect) => {
    const { tool } = createFakeTool({ name: "read_note", effect });

    expect(tool.effect).toBe(effect);
    expect(tool.name).toBe("read_note");
  });

  it("records the inputs its handler received and returns the default output", async () => {
    const fake = createFakeTool({ name: "read_note", effect: "read" });
    const prepared = fake.tool.prepare({ text: "hello" });
    if (!prepared.ok) {
      throw new Error("expected valid input");
    }

    await expect(prepared.execute()).resolves.toEqual({ done: true });
    expect(fake.handledInputs).toEqual([{ text: "hello" }]);
  });

  it("returns the output a test gives it", async () => {
    const fake = createFakeTool({ name: "read_note", effect: "read", output: { note: "hi" } });
    const prepared = fake.tool.prepare({ text: "hello" });
    if (!prepared.ok) {
      throw new Error("expected valid input");
    }

    await expect(prepared.execute()).resolves.toEqual({ note: "hi" });
  });

  it("rejects with the failure a test gives it", async () => {
    const failure = new Error("boom");
    const fake = createFakeTool({ name: "read_note", effect: "read", failure });
    const prepared = fake.tool.prepare({ text: "hello" });
    if (!prepared.ok) {
      throw new Error("expected valid input");
    }

    await expect(prepared.execute()).rejects.toBe(failure);
  });
});

describe("createInMemoryToolCallCounter", () => {
  it("counts zero calls for every tool until a test sets a count", async () => {
    const counter = createInMemoryToolCallCounter();

    expect(await counter.countCallsToday("read_note")).toBe(0);

    counter.setCallsToday("read_note", 4);

    expect(await counter.countCallsToday("read_note")).toBe(4);
    expect(await counter.countCallsToday("save_note")).toBe(0);
  });

  it("records which tools were asked about, in order", async () => {
    const counter = createInMemoryToolCallCounter();

    await counter.countCallsToday("save_note");
    await counter.countCallsToday("read_note");

    expect(counter.requestedToolNames).toEqual(["save_note", "read_note"]);
  });
});
