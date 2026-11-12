import { LlmError } from "@khadim/core/llm/llm.errors";
import { describe, expect, it } from "vitest";

import { toStrictInputSchema } from "./strict-schema";

/** What Zod 4.6.7's `z.toJSONSchema` gives for a strict object, without `$schema`. */
const objectOf = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const deepFreeze = <T>(value: T): T => {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
};

const captureError = (action: () => unknown): unknown => {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error("expected the action to throw");
};

describe("toStrictInputSchema", () => {
  it("keeps enum and const, which the SDK's transform moved into the description (I3)", () => {
    const schema = objectOf({
      platform: { type: "string", enum: ["linkedin", "facebook"] },
      kind: { type: "string", const: "post" },
    });

    expect(toStrictInputSchema(schema)).toEqual(schema);
  });

  it("keeps default and a supported string format", () => {
    const schema = objectOf({
      at: { type: "string", format: "date-time", default: "2026-11-12T00:00:00Z" },
    });

    expect(toStrictInputSchema(schema)).toEqual(schema);
  });

  it("moves an unsupported keyword of a nested field into its description", () => {
    const schema = objectOf({
      draft: objectOf({ text: { type: "string", description: "Post text.", maxLength: 3000 } }),
    });

    expect(toStrictInputSchema(schema)).toEqual(
      objectOf({
        draft: objectOf({
          text: { type: "string", description: "Post text.\n\n{maxLength: 3000}" },
        }),
      }),
    );
  });

  it("writes the description from the moved keywords when a field had none", () => {
    const schema = objectOf({ count: { type: "integer", minimum: 1, maximum: 5 } });

    expect(toStrictInputSchema(schema)).toEqual(
      objectOf({ count: { type: "integer", description: "{minimum: 1, maximum: 5}" } }),
    );
  });

  it.each([
    [
      { type: "string", format: "regex" },
      { type: "string", description: '{format: "regex"}' },
    ],
    [
      { type: "array", items: { type: "string" }, minItems: 2 },
      { type: "array", items: { type: "string" }, description: "{minItems: 2}" },
    ],
    [
      { type: "array", items: { type: "string" }, minItems: 1 },
      { type: "array", items: { type: "string" }, minItems: 1 },
    ],
    [
      { type: "string", enum: [{ nested: true }] },
      { type: "string", description: '{enum: [{"nested":true}]}' },
    ],
  ])("maps %j to %j", (field, expected) => {
    expect(toStrictInputSchema(objectOf({ field }))).toEqual(objectOf({ field: expected }));
  });

  it("sends a oneOf as anyOf", () => {
    const field = { oneOf: [{ type: "string" }, { type: "null" }] };

    expect(toStrictInputSchema(objectOf({ field }))).toEqual(
      objectOf({ field: { anyOf: [{ type: "string" }, { type: "null" }] } }),
    );
  });

  it("closes every object, nested ones too", () => {
    const schema = {
      type: "object",
      properties: { inner: { type: "object", properties: {} } },
    };

    expect(toStrictInputSchema(schema)).toEqual({
      type: "object",
      properties: { inner: { type: "object", properties: {}, additionalProperties: false } },
      additionalProperties: false,
    });
  });

  it("refuses an untyped field with an LlmError, not a plain Error (I2)", () => {
    const error = captureError(() => toStrictInputSchema(objectOf({ anything: {} })));

    expect(error).toBeInstanceOf(LlmError);
    expect(error).toMatchObject({
      problem: "LLM_REQUEST_REJECTED",
      reason: "untyped_tool_schema",
    });
  });

  it("never changes the schema it was given", () => {
    const schema = deepFreeze(
      objectOf({
        text: { type: "string", maxLength: 10 },
        tags: { type: "array", items: { type: "string", minLength: 1 }, minItems: 3 },
      }),
    );
    const before = JSON.stringify(schema);

    toStrictInputSchema(schema);

    expect(JSON.stringify(schema)).toBe(before);
  });
});
