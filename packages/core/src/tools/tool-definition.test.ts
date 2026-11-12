import { describe, expect, it } from "vitest";
import * as z from "zod";

import { defineTool } from "./tool-definition";

function defineNoteTool(overrides: { name?: string; description?: string } = {}) {
  const handledInputs: { text: string; count?: number | undefined }[] = [];
  const tool = defineTool({
    name: overrides.name ?? "save_note",
    description: overrides.description ?? "Saves a note.",
    effect: "local_write",
    inputSchema: z.strictObject({
      text: z.string().max(10),
      count: z.int().min(1).optional(),
    }),
    handler: (input) => {
      handledInputs.push(input);
      return Promise.resolve({ saved: input.text });
    },
  });
  return { tool, handledInputs };
}

describe("defineTool", () => {
  it("keeps the name, description and effect tier", () => {
    const { tool } = defineNoteTool();

    expect(tool.name).toBe("save_note");
    expect(tool.description).toBe("Saves a note.");
    expect(tool.effect).toBe("local_write");
  });

  it("exports the input schema as JSON Schema that refuses unknown keys (plan D-3)", () => {
    const { tool } = defineNoteTool();

    expect(tool.inputJsonSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["text"],
      properties: {
        text: { type: "string", maxLength: 10 },
        count: { type: "integer", minimum: 1 },
      },
    });
  });

  it("exports the same JSON Schema every time, so the cached prompt prefix stays stable", () => {
    const first = JSON.stringify(defineNoteTool().tool.inputJsonSchema);
    const second = JSON.stringify(defineNoteTool().tool.inputJsonSchema);

    expect(first).toBe(second);
  });

  it.each(["save_note", "get_current_time", "list_2fa_codes"])("accepts the name %s", (name) => {
    expect(defineNoteTool({ name }).tool.name).toBe(name);
  });

  it.each(["save", "saveNote", "Save_note", "save-note", "save__note", "_save_note", "save_", ""])(
    "refuses the name %j: not snake_case verb_noun (conventions §8)",
    (name) => {
      expect(() => defineNoteTool({ name })).toThrow("not snake_case verb_noun");
    },
  );

  it("accepts a name of 64 characters and refuses one of 65", () => {
    const longestName = `save_${"n".repeat(59)}`;

    expect(defineNoteTool({ name: longestName }).tool.name).toHaveLength(64);
    expect(() => defineNoteTool({ name: `${longestName}n` })).toThrow("not snake_case verb_noun");
  });

  it.each(["", "   "])("refuses the description %j", (description) => {
    expect(() => defineNoteTool({ description })).toThrow("tool has no description: save_note");
  });

  it("refuses an input schema that lets unknown keys through", () => {
    expect(() =>
      defineTool({
        name: "save_note",
        description: "Saves a note.",
        effect: "local_write",
        inputSchema: z.object({ text: z.string() }),
        handler: () => Promise.resolve({}),
      }),
    ).toThrow("tool input schema is not a strict object: save_note");
  });

  const defineWith = (inputSchema: z.ZodType) => () =>
    defineTool({
      name: "save_note",
      description: "Saves a note.",
      effect: "local_write",
      inputSchema,
      handler: () => Promise.resolve({}),
    });

  it("refuses a nested object that lets unknown keys through (R1)", () => {
    expect(defineWith(z.strictObject({ draft: z.object({ text: z.string() }) }))).toThrow(
      "tool input schema is not a strict object at input.draft: save_note",
    );
  });

  it("refuses an object in a list that lets unknown keys through (R1)", () => {
    expect(defineWith(z.strictObject({ notes: z.array(z.object({ text: z.string() })) }))).toThrow(
      "tool input schema is not a strict object at input.notes[]: save_note",
    );
  });

  it("refuses an object in a union that lets unknown keys through (R1)", () => {
    expect(
      defineWith(z.strictObject({ note: z.union([z.string(), z.object({ text: z.string() })]) })),
    ).toThrow("tool input schema is not a strict object at input.note: save_note");
  });

  it("accepts strict objects all the way down", () => {
    const schema = z.strictObject({
      draft: z.strictObject({ text: z.string() }),
      notes: z.array(z.strictObject({ text: z.string() })).optional(),
      note: z.union([z.string(), z.strictObject({ text: z.string() })]).nullable(),
    });

    expect(defineWith(schema)().name).toBe("save_note");
  });

  it("refuses a strict object made optional at the root, which its JSON Schema hides (#5)", () => {
    expect(defineWith(z.strictObject({ text: z.string() }).optional())).toThrow(
      "tool input schema accepts no input at its root: save_note",
    );
  });

  it("refuses a strict object made nullable at the root", () => {
    expect(defineWith(z.strictObject({ text: z.string() }).nullable())).toThrow(
      "tool input schema is not a strict object: save_note",
    );
  });

  it.each([
    ["z.unknown()", z.unknown()],
    ["z.any()", z.any()],
  ])("refuses a field typed %s: strict tools need a type (review fixes, D-8)", (_, field) => {
    expect(defineWith(z.strictObject({ value: field }))).toThrow(
      "tool input schema has no type at input.value: save_note",
    );
  });

  it("refuses an input schema that is not an object", () => {
    expect(() =>
      defineTool({
        name: "save_note",
        description: "Saves a note.",
        effect: "local_write",
        inputSchema: z.string(),
        handler: () => Promise.resolve({}),
      }),
    ).toThrow("tool input schema is not a strict object: save_note");
  });
});

describe("prepare", () => {
  it("does not run the handler while validating", () => {
    const { tool, handledInputs } = defineNoteTool();

    const prepared = tool.prepare({ text: "hello" });

    expect(prepared.ok).toBe(true);
    expect(handledInputs).toEqual([]);
  });

  it("gives the handler the validated input and returns its output", async () => {
    const { tool, handledInputs } = defineNoteTool();

    const prepared = tool.prepare({ text: "hello", count: 2 });
    if (!prepared.ok) {
      throw new Error("expected valid input");
    }

    expect(prepared.input).toEqual({ text: "hello", count: 2 });
    await expect(prepared.execute()).resolves.toEqual({ saved: "hello" });
    expect(handledInputs).toEqual([{ text: "hello", count: 2 }]);
  });

  it("accepts text at the maximum length and reports one character more", () => {
    const { tool, handledInputs } = defineNoteTool();

    expect(tool.prepare({ text: "x".repeat(10) }).ok).toBe(true);
    expect(tool.prepare({ text: "x".repeat(11) })).toMatchObject({
      ok: false,
      issues: [{ path: "input.text", code: "too_big" }],
    });
    expect(handledInputs).toEqual([]);
  });

  it("reports an unknown key at the input root", () => {
    const { tool } = defineNoteTool();

    expect(tool.prepare({ text: "hello", extra: true })).toMatchObject({
      ok: false,
      issues: [{ path: "input", code: "unrecognized_keys" }],
    });
  });

  it("reports a missing required field", () => {
    const { tool } = defineNoteTool();

    expect(tool.prepare({})).toMatchObject({
      ok: false,
      issues: [{ path: "input.text", code: "invalid_type" }],
    });
  });

  it.each([null, undefined, "hello", 42, []])("reports input %j, which is not an object", (raw) => {
    const { tool } = defineNoteTool();

    expect(tool.prepare(raw)).toMatchObject({
      ok: false,
      issues: [{ path: "input", code: "invalid_type" }],
    });
  });

  it("reports every issue, each with a message", () => {
    const { tool } = defineNoteTool();

    const prepared = tool.prepare({ text: 5, count: 0 });
    if (prepared.ok) {
      throw new Error("expected invalid input");
    }

    expect(prepared.issues.map((issue) => issue.path)).toEqual(["input.text", "input.count"]);
    for (const issue of prepared.issues) {
      expect(issue.message).not.toBe("");
    }
  });
});
