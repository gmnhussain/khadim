import * as z from "zod";

import type { PreparedToolInput, ToolDefinition, ToolEffect, ToolOutput } from "./tool.types";

/** What a tool's author writes: the schema types the handler's input. */
export interface ToolSpecification<TSchema extends z.ZodType> {
  /** snake_case `verb_noun` (conventions §8). */
  readonly name: string;
  /** Written for the model: what the tool does, when to use it, what it returns. */
  readonly description: string;
  readonly effect: ToolEffect;
  /** A strict object schema (`z.strictObject`), so unknown keys are refused (plan D-3). */
  readonly inputSchema: TSchema;
  readonly handler: (input: z.output<TSchema>) => Promise<ToolOutput>;
}

const TOOL_NAME_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;
const MAX_TOOL_NAME_LENGTH = 64;
const INPUT_ROOT_PATH = "input";

/**
 * Builds a tool definition. The handler is reachable only through `prepare`, so it never
 * receives input that has not passed the schema (conventions §15.4).
 */
export function defineTool<TSchema extends z.ZodType>(
  specification: ToolSpecification<TSchema>,
): ToolDefinition {
  const { name, description, effect, inputSchema, handler } = specification;
  if (!TOOL_NAME_PATTERN.test(name) || name.length > MAX_TOOL_NAME_LENGTH) {
    throw new Error(`tool name is not snake_case verb_noun: ${name}`);
  }
  if (description.trim() === "") {
    throw new Error(`tool has no description: ${name}`);
  }
  // "input": the schema describes what the model sends. In the default output mode a plain
  // `z.object` also reports `additionalProperties: false`, because parsing strips unknown keys.
  const inputJsonSchema = z.toJSONSchema(inputSchema, { io: "input" });
  if (inputJsonSchema.type !== "object" || inputJsonSchema.additionalProperties !== false) {
    throw new Error(`tool input schema is not a strict object: ${name}`);
  }

  function prepare(rawInput: unknown): PreparedToolInput {
    const parsed = inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        ok: false,
        issues: parsed.error.issues.map((issue) => ({
          path: [INPUT_ROOT_PATH, ...issue.path.map(String)].join("."),
          code: issue.code,
          message: issue.message,
        })),
      };
    }
    const input = parsed.data;
    return { ok: true, input, execute: () => handler(input) };
  }

  return { name, description, effect, inputJsonSchema, prepare };
}
