import * as z from "zod";

import { namedRecordSchema, TASK_NAME_PATTERN, TOOL_NAME_PATTERN } from "../shared";

/** What a tool changes: nothing, Khadim's own state, or something outside Khadim (ADR-0011). */
export const TOOL_EFFECTS = ["read", "local_write", "external"] as const;

/** The effect tier of a tool. */
export type ToolEffect = (typeof TOOL_EFFECTS)[number];

/** How a tool call executes: now, as a stored proposal, or after the owner approves (ADR-0011). */
export const TOOL_POLICIES = ["auto", "propose", "approve"] as const;

/** The policy the owner gave a tool. */
export type ToolPolicy = (typeof TOOL_POLICIES)[number];

/** A JSON value: what a tool returns and what goes back to the model. */
export type JsonValue = string | number | boolean | null | readonly JsonValue[] | JsonObject;

/** A JSON object. An interface, because a recursive `Record<string, JsonValue>` alias cannot reference itself. */
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

/** A tool's result: compact and structured, never a raw API response (conventions §15.4). */
export type ToolOutput = JsonObject;

/** One problem in model-supplied input: where it is, Zod's issue code and a short message. */
export interface ToolInputIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

/** Model-supplied input after validation: ready to execute, or the issues the model must fix. */
export type PreparedToolInput =
  | { readonly ok: true; readonly input: unknown; readonly execute: () => Promise<ToolOutput> }
  | { readonly ok: false; readonly issues: readonly ToolInputIssue[] };

/** A capability the model may call, built with `defineTool` (glossary: Tool). */
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly effect: ToolEffect;
  /** The input schema as JSON Schema, with `additionalProperties: false` (plan D-3). */
  readonly inputJsonSchema: Readonly<Record<string, unknown>>;
  /** Validates model-supplied input; the handler runs only through the returned `execute`. */
  readonly prepare: (rawInput: unknown) => PreparedToolInput;
}

/** What the model is told about a tool it may call. */
export type OfferedTool = Pick<ToolDefinition, "name" | "description" | "inputJsonSchema">;

const MIN_CALL_LIMIT = 1;

/** The owner's policy for one tool: how it executes and how often it may be called. */
export const toolPolicyEntrySchema = z.strictObject({
  policy: z.enum(TOOL_POLICIES),
  maxCallsPerRun: z.int().min(MIN_CALL_LIMIT).optional(),
  maxCallsPerDay: z.int().min(MIN_CALL_LIMIT).optional(),
});

/**
 * Tool configuration: a policy per tool name, and the tools each task may use (ADR-0011). Keys
 * are names, checked before parsing so none is silently dropped (KP-21; ADR-0014).
 */
export const toolPolicyConfigSchema = z.strictObject({
  policies: namedRecordSchema(TOOL_NAME_PATTERN, toolPolicyEntrySchema),
  tasks: namedRecordSchema(TASK_NAME_PATTERN, z.array(z.string())),
});

/** The owner's policy for one tool. */
export type ToolPolicyEntry = z.infer<typeof toolPolicyEntrySchema>;

/** Validated tool configuration. */
export type ToolPolicyConfig = z.infer<typeof toolPolicyConfigSchema>;

/**
 * Source of how many calls of a tool were already accepted today, across runs and including
 * earlier calls of the current run. In memory in tests; the database in 1b.
 */
export type CountToolCallsToday = (toolName: string) => Promise<number>;
