import type { CountToolCallsToday } from "../tool.types";

/** An in-memory source of today's call counts, set by the test. */
export interface InMemoryToolCallCounter {
  readonly countCallsToday: CountToolCallsToday;
  readonly setCallsToday: (toolName: string, count: number) => void;
  /** The tool names the registry asked about, in order. */
  readonly requestedToolNames: readonly string[];
}

/** Creates a counter where every tool has zero calls today until a test sets a count. */
export function createInMemoryToolCallCounter(): InMemoryToolCallCounter {
  const countByToolName = new Map<string, number>();
  const requestedToolNames: string[] = [];
  return {
    countCallsToday(toolName) {
      requestedToolNames.push(toolName);
      return Promise.resolve(countByToolName.get(toolName) ?? 0);
    },
    setCallsToday(toolName, count) {
      countByToolName.set(toolName, count);
    },
    requestedToolNames,
  };
}
