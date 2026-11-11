import * as z from "zod";

import { defineTool } from "../tool-definition";
import type { ToolDefinition, ToolEffect, ToolOutput } from "../tool.types";

/** Options of `createFakeTool`. */
export interface FakeToolOptions {
  readonly name: string;
  readonly effect: ToolEffect;
  /** What the handler returns. Default: `{ done: true }`. */
  readonly output?: ToolOutput | undefined;
  /** When set, the handler rejects with this error instead of returning. */
  readonly failure?: Error | undefined;
}

/** A fake tool and the validated inputs its handler received, in order. */
export interface FakeTool {
  readonly tool: ToolDefinition;
  readonly handledInputs: readonly FakeToolInput[];
}

/** The longest `text` a fake tool accepts, so tests can send input that is too long. */
export const FAKE_TOOL_MAX_TEXT_LENGTH = 20;

const fakeToolInputSchema = z.strictObject({ text: z.string().max(FAKE_TOOL_MAX_TEXT_LENGTH) });

/** The input every fake tool takes. */
export type FakeToolInput = z.infer<typeof fakeToolInputSchema>;

const DEFAULT_OUTPUT: ToolOutput = { done: true };

/** Creates a tool of any tier that records what its handler was called with. */
export function createFakeTool(options: FakeToolOptions): FakeTool {
  const handledInputs: FakeToolInput[] = [];
  const tool = defineTool({
    name: options.name,
    description: `Fake ${options.effect} tool for tests.`,
    effect: options.effect,
    inputSchema: fakeToolInputSchema,
    handler: (input) => {
      handledInputs.push(input);
      return options.failure === undefined
        ? Promise.resolve(options.output ?? DEFAULT_OUTPUT)
        : Promise.reject(options.failure);
    },
  });
  return { tool, handledInputs };
}
