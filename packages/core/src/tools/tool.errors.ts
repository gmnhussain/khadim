/** Every problem the tools module can report (features/agent.md, "Problem codes"). */
export const TOOL_PROBLEMS = [
  "TOOL_INPUT_INVALID",
  "TOOL_NOT_FOUND",
  "TOOL_LIMIT_REACHED",
  "TOOL_EXECUTION_FAILED",
  "TOOL_OUTPUT_TOO_LARGE",
  "TOOL_CALL_DEFERRED",
  "TOOL_UNCLASSIFIED",
  "TOOL_POLICY_INVALID",
] as const;

/** A tool problem code. */
export type ToolProblem = (typeof TOOL_PROBLEMS)[number];

/** Problems of one tool call; they go back to the model as error results (conventions §15.4). */
export type ToolCallProblem = Extract<
  ToolProblem,
  | "TOOL_INPUT_INVALID"
  | "TOOL_NOT_FOUND"
  | "TOOL_LIMIT_REACHED"
  | "TOOL_EXECUTION_FAILED"
  | "TOOL_OUTPUT_TOO_LARGE"
  | "TOOL_CALL_DEFERRED"
>;

/** Problems of the tool configuration; they stop the app at startup (conventions §15.4). */
export type ToolConfigProblem = Extract<ToolProblem, "TOOL_UNCLASSIFIED" | "TOOL_POLICY_INVALID">;

/** Short, actionable messages: the model reads the call problems, the owner the config problems. */
export const TOOL_PROBLEM_MESSAGES: Record<ToolProblem, string> = {
  TOOL_INPUT_INVALID: "The tool input does not match its schema.",
  TOOL_NOT_FOUND: "This tool is not available in this run.",
  TOOL_LIMIT_REACHED: "The tool reached its per-run or per-day call limit.",
  TOOL_EXECUTION_FAILED: "The tool failed. Try again, or continue without it.",
  // The handler has run, so a `local_write` tool's change has happened (review fixes, D-9).
  TOOL_OUTPUT_TOO_LARGE:
    "The tool ran, but its result is too large to return. Ask for less, for example a narrower range.",
  TOOL_CALL_DEFERRED:
    "Not run: an earlier call in this step waits for the owner's decision. Ask for this call again after that decision if it is still needed.",
  TOOL_UNCLASSIFIED: "The tool has no owner-assigned tier and policy.",
  TOOL_POLICY_INVALID: "The tool policy configuration is not valid.",
};

/** Details of a refused tool configuration, for logs and the startup message. */
export interface ToolRefusedErrorOptions {
  readonly toolName?: string | undefined;
  readonly cause?: unknown;
}

/** Tool configuration refused by the registry (ADR-0011, ADR-0014). */
export class ToolRefusedError extends Error {
  readonly problem: ToolConfigProblem;
  readonly toolName: string | undefined;
  constructor(problem: ToolConfigProblem, options: ToolRefusedErrorOptions = {}) {
    super(TOOL_PROBLEM_MESSAGES[problem], { cause: options.cause });
    this.name = "ToolRefusedError";
    this.problem = problem;
    this.toolName = options.toolName;
  }
}
