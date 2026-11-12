import { LlmError } from "@khadim/core/llm/llm.errors";

/** A JSON Schema node, read only: the transform never changes its input. */
type SchemaNode = Readonly<Record<string, unknown>>;

/**
 * What Anthropic's strict mode accepts: the "Supported features" list of "JSON Schema
 * limitations" in "Structured outputs"
 * (platform.claude.com/docs/en/build-with-claude/structured-outputs.md, read in full
 * 2026-11-12, SDK 1.3.0), which strict tools and JSON outputs share. "If you use an unsupported
 * feature, you'll receive a 400 error with details", so the rest moves into the description,
 * and core still enforces it with Zod (KP-19, KP-23).
 */
const SUPPORTED_STRING_FORMAT_SET: ReadonlySet<string> = new Set([
  "date-time",
  "time",
  "date",
  "duration",
  "email",
  "hostname",
  "uri",
  "ipv4",
  "ipv6",
  "uuid",
]);
/** "Array minItems (only values 0 and 1 supported)". */
const SUPPORTED_MIN_ITEMS_SET: ReadonlySet<unknown> = new Set([0, 1]);
/** Keywords kept exactly as they are on any node. `enum` is checked on its own. */
const KEPT_KEYWORD_SET: ReadonlySet<string> = new Set([
  "type",
  "description",
  "title",
  "const",
  "default",
  "required",
  "$ref",
]);
/** Keywords this transform rebuilds, so they never land in the description. */
const REBUILT_KEYWORD_SET: ReadonlySet<string> = new Set([
  "enum",
  "properties",
  "additionalProperties",
  "items",
  "anyOf",
  "oneOf",
  "allOf",
  "$defs",
  "format",
  "minItems",
]);
const DESCRIPTION_SEPARATOR = "\n\n";

const isSchemaNode = (value: unknown): value is SchemaNode =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasType = (node: SchemaNode, type: string): boolean =>
  Array.isArray(node.type) ? node.type.includes(type) : node.type === type;

/** "enum: strings, numbers, booleans, or nulls only, no complex types". */
const isSupportedEnum = (values: unknown): values is readonly unknown[] =>
  Array.isArray(values) &&
  values.every((value) => value === null || ["string", "number", "boolean"].includes(typeof value));

const mapEntries = (map: unknown): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(isSchemaNode(map) ? map : {}).map(([key, child]) => [key, transformNode(child)]),
  );

/** Writes the keywords strict mode cannot take into the description, in the SDK's format. */
const describeLeftOver = (description: unknown, leftOver: readonly [string, unknown][]) => {
  const detail = `{${leftOver.map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join(", ")}}`;
  return typeof description === "string" && description !== ""
    ? `${description}${DESCRIPTION_SEPARATOR}${detail}`
    : detail;
};

/** One node and everything under it, rebuilt as a new object. */
const transformNode = (node: unknown): Record<string, unknown> => {
  if (!isSchemaNode(node)) {
    throw new LlmError("LLM_REQUEST_REJECTED", { reason: "invalid_tool_schema" });
  }
  const strict: Record<string, unknown> = {};
  const leftOver: [string, unknown][] = [];
  for (const [key, value] of Object.entries(node)) {
    if (KEPT_KEYWORD_SET.has(key)) {
      strict[key] = value;
    } else if (!REBUILT_KEYWORD_SET.has(key)) {
      leftOver.push([key, value]);
    }
  }

  // Strict mode has no `oneOf`; sent as `anyOf`, it reads the same to the model, and Zod still
  // checks the input. A `oneOf` beside an `anyOf` goes to the description.
  const variants = Array.isArray(node.anyOf) ? node.anyOf : node.oneOf;
  if (Array.isArray(variants)) {
    strict.anyOf = variants.map(transformNode);
  }
  if (node.oneOf !== undefined && variants !== node.oneOf) {
    leftOver.push(["oneOf", node.oneOf]);
  }
  if (Array.isArray(node.allOf)) {
    strict.allOf = node.allOf.map(transformNode);
  }
  const isUntyped =
    node.type === undefined &&
    strict.anyOf === undefined &&
    strict.allOf === undefined &&
    node.$ref === undefined;
  if (isUntyped) {
    // defineTool refuses such a schema at startup; this guards any other source of tools.
    throw new LlmError("LLM_REQUEST_REJECTED", { reason: "untyped_tool_schema" });
  }
  if (node.$defs !== undefined) {
    strict.$defs = mapEntries(node.$defs);
  }
  if (node.enum !== undefined) {
    if (isSupportedEnum(node.enum)) {
      strict.enum = node.enum;
    } else {
      leftOver.push(["enum", node.enum]);
    }
  }
  if (hasType(node, "object")) {
    strict.properties = mapEntries(node.properties);
    strict.additionalProperties = false;
  }
  if (hasType(node, "array") && node.items !== undefined) {
    strict.items = transformNode(node.items);
  }
  if (node.format !== undefined) {
    if (
      hasType(node, "string") &&
      typeof node.format === "string" &&
      SUPPORTED_STRING_FORMAT_SET.has(node.format)
    ) {
      strict.format = node.format;
    } else {
      leftOver.push(["format", node.format]);
    }
  }
  if (node.minItems !== undefined) {
    if (hasType(node, "array") && SUPPORTED_MIN_ITEMS_SET.has(node.minItems)) {
      strict.minItems = node.minItems;
    } else {
      leftOver.push(["minItems", node.minItems]);
    }
  }
  if (leftOver.length > 0) {
    strict.description = describeLeftOver(strict.description, leftOver);
  }
  return strict;
};

/**
 * Rebuilds a tool's input schema for a strict tool (`strict: true`). It keeps what strict mode
 * accepts, `enum` and `const` included, and moves every other keyword into the field's
 * description. It never changes its input (review fixes, D-8; finding I14).
 */
export function toStrictInputSchema(schema: SchemaNode): Record<string, unknown> {
  return transformNode(schema);
}
