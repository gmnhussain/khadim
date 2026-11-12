import type { LlmMessage, LlmSystemPart, LlmTextPart, LlmToolDefinition } from "../llm";
import type { PromptFile, RunInputPart } from "./agent.types";

/** What `buildContext` assembles. */
export interface ContextInput {
  readonly systemPrompt: PromptFile;
  readonly tools: readonly LlmToolDefinition[];
  readonly history: readonly LlmMessage[];
  readonly input: readonly RunInputPart[];
}

/** The start of a run's context. The loop only ever appends to `messages`. */
export interface RunContext {
  readonly system: readonly LlmSystemPart[];
  readonly tools: readonly LlmToolDefinition[];
  readonly messages: readonly LlmMessage[];
}

const UNTRUSTED_TAG = "untrusted_content";
/** Where untrusted text came from, such as `comment` or `web_page`. */
const SOURCE_PATTERN = /^[a-z][a-z0-9_]*$/;
/** The tag itself inside untrusted text, opening or closing, in any letter case. */
const EMBEDDED_TAG_PATTERN = /<(\/?)untrusted_content/gi;

/**
 * Wraps text from outside Khadim in a labelled block the system prompt declares to be data
 * (conventions §15.11). The tag is defused inside the text, so the text cannot close its own
 * block and continue as if it were the owner.
 */
export function wrapUntrustedContent(source: string, text: string): string {
  if (!SOURCE_PATTERN.test(source)) {
    throw new Error(`untrusted content source is not a snake_case label: ${source}`);
  }
  const defused = text.replace(EMBEDDED_TAG_PATTERN, "<$1untrusted-content-escaped");
  return `<${UNTRUSTED_TAG} source="${source}">\n${defused}\n</${UNTRUSTED_TAG}>`;
}

function toTextPart(part: RunInputPart): LlmTextPart {
  switch (part.kind) {
    case "owner_text":
      return { type: "text", text: part.text };
    case "untrusted":
      return { type: "text", text: wrapUntrustedContent(part.source, part.text) };
  }
}

/**
 * Builds the context a run starts from, stable prefix first so adapters can cache it: the
 * versioned system prompt, the tool definitions, then history and the current input
 * (agent design §3). Profile and retrieved memory join in Phase 2.
 */
export function buildContext(input: ContextInput): RunContext {
  if (input.input.length === 0) {
    throw new Error("a run needs at least one input part");
  }
  return {
    system: [{ text: input.systemPrompt.text, isStable: true }],
    tools: input.tools,
    messages: [...input.history, { role: "user", content: input.input.map(toTextPart) }],
  };
}
