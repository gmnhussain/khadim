import type {
  AgentRunStore,
  AgentStepRecord,
  LlmCallRecord,
  RunOutcomeRecord,
  ToolCallRecord,
} from "../agent.types";

/** A run store that keeps everything in memory, for tests. */
export interface InMemoryRunStore extends AgentRunStore {
  readonly llmCalls: readonly LlmCallRecord[];
  readonly steps: readonly AgentStepRecord[];
  readonly toolCalls: readonly ToolCallRecord[];
  readonly outcomes: readonly RunOutcomeRecord[];
  /** The kind of every write, in order: `llm_call`, `step`, `tool_call` or `outcome`. */
  readonly writes: readonly string[];
}

/** Creates an empty in-memory run store. */
export function createInMemoryRunStore(): InMemoryRunStore {
  const llmCalls: LlmCallRecord[] = [];
  const steps: AgentStepRecord[] = [];
  const toolCalls: ToolCallRecord[] = [];
  const outcomes: RunOutcomeRecord[] = [];
  const writes: string[] = [];
  return {
    llmCalls,
    steps,
    toolCalls,
    outcomes,
    writes,
    recordLlmCall(record) {
      llmCalls.push(record);
      writes.push("llm_call");
      return Promise.resolve();
    },
    recordStep(record) {
      steps.push(record);
      writes.push("step");
      return Promise.resolve();
    },
    recordToolCall(record) {
      toolCalls.push(record);
      writes.push("tool_call");
      return Promise.resolve();
    },
    recordOutcome(record) {
      outcomes.push(record);
      writes.push("outcome");
      return Promise.resolve();
    },
  };
}
