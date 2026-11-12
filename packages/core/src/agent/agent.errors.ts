/** Every limit that ends a run (BR-21; features/agent.md, "Problem codes"). */
export const AGENT_PROBLEMS = [
  "RUN_ITERATION_LIMIT",
  "RUN_BUDGET_EXCEEDED",
  "RUN_TOKEN_LIMIT",
  "RUN_TIME_LIMIT",
] as const;

/** An agent problem code. */
export type AgentProblem = (typeof AGENT_PROBLEMS)[number];

/** Messages for the owner. */
export const AGENT_PROBLEM_MESSAGES: Record<AgentProblem, string> = {
  RUN_ITERATION_LIMIT: "The run reached its limit of model calls.",
  RUN_BUDGET_EXCEEDED: "The run reached its cost budget.",
  RUN_TOKEN_LIMIT: "The run reached its token limit.",
  RUN_TIME_LIMIT: "The run reached its running-time limit.",
};
