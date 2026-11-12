import * as z from "zod";

import { TOOL_NAME_PATTERN } from "../shared";
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

const MAX_TOOL_NAME_LENGTH = 64;
const INPUT_ROOT_PATH = "input";
/** Keywords whose value is a list of schemas, each a node of its own. */
const SCHEMA_LIST_KEYWORDS = ["anyOf", "oneOf", "allOf", "prefixItems"] as const;
/** Keywords whose value is a map of named schemas. */
const SCHEMA_MAP_KEYWORDS = ["properties", "$defs"] as const;

const isSchemaNode = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasType = (node: Readonly<Record<string, unknown>>, type: string): boolean =>
  Array.isArray(node.type) ? node.type.includes(type) : node.type === type;

/** The subschemas of a node, each with its path for the error message. */
const childNodesOf = (
  node: Readonly<Record<string, unknown>>,
  path: string,
): (readonly [unknown, string])[] => {
  const children: (readonly [unknown, string])[] = [];
  for (const keyword of SCHEMA_MAP_KEYWORDS) {
    const map = node[keyword];
    if (isSchemaNode(map)) {
      children.push(
        ...Object.entries(map).map(([key, child]) => [child, `${path}.${key}`] as const),
      );
    }
  }
  for (const keyword of SCHEMA_LIST_KEYWORDS) {
    const list = node[keyword];
    if (Array.isArray(list)) {
      children.push(...list.map((child: unknown) => [child, path] as const));
    }
  }
  if (node.items !== undefined) {
    children.push([node.items, `${path}[]`]);
  }
  return children;
};

/**
 * The first problem in a tool's input JSON Schema, or none. Every object, nested ones too,
 * refuses unknown keys (phase-1 plan, D-3; R1), and every node has a type, or is a union or a
 * reference: strict tools reject an untyped schema, so such a tool would fail every model call
 * (review fixes, D-8).
 */
const findInputSchemaProblem = (node: unknown, path: string): string | undefined => {
  if (!isSchemaNode(node)) {
    return `is not a schema at ${path}`;
  }
  const isCombination = SCHEMA_LIST_KEYWORDS.some((keyword) => Array.isArray(node[keyword]));
  if (node.type === undefined && !isCombination && node.$ref === undefined) {
    return `has no type at ${path}`;
  }
  if (hasType(node, "object") && node.additionalProperties !== false) {
    return `is not a strict object at ${path}`;
  }
  for (const [child, childPath] of childNodesOf(node, path)) {
    const problem = findInputSchemaProblem(child, childPath);
    if (problem !== undefined) {
      return problem;
    }
  }
  return undefined;
};

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
  const schemaProblem = findInputSchemaProblem(inputJsonSchema, INPUT_ROOT_PATH);
  if (schemaProblem !== undefined) {
    throw new Error(`tool input schema ${schemaProblem}: ${name}`);
  }
  // `.optional()` on the root object does not show in the JSON Schema, but would let the handler
  // run without the validated object (finding #5). `null` is checked for any schema that hides it.
  if (inputSchema.safeParse(undefined).success || inputSchema.safeParse(null).success) {
    throw new Error(`tool input schema accepts no input at its root: ${name}`);
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
