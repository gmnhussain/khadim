import { TOOL_PROBLEM_MESSAGES, type ToolCallProblem, ToolRefusedError } from "./tool.errors";
import { checkCallLimits, findToolConfigProblem, pausesRun } from "./tool-policy.rules";
import {
  type CountToolCallsToday,
  type OfferedTool,
  type ToolDefinition,
  type ToolEffect,
  type ToolInputIssue,
  type ToolOutput,
  type ToolPolicy,
  toolPolicyConfigSchema,
  type ToolPolicyEntry,
} from "./tool.types";

/** Dependencies of `createToolRegistry`. */
export interface ToolRegistryDependencies {
  readonly tools: readonly ToolDefinition[];
  /** The tool configuration as read from the config file; validated here (plan D-4). */
  readonly policyConfig: unknown;
  readonly countCallsToday: CountToolCallsToday;
}

/** One tool call the model asked for. */
export interface RequestedToolCall {
  readonly toolName: string;
  readonly input: unknown;
}

/** Every tool call of one step, in the order the model asked for them. */
export interface ToolCallsRequest {
  readonly task: string;
  readonly calls: readonly RequestedToolCall[];
  /** Calls of each tool accepted in this run before this step; a tool not listed has none. */
  readonly callsThisRunByToolName: ReadonlyMap<string, number>;
}

/** A tool call that passed every check. `input` is the validated input. */
export interface ResolvedToolCall {
  readonly toolName: string;
  readonly effect: ToolEffect;
  readonly policy: ToolPolicy;
  /** True for `approve`: the caller creates a pending action instead of executing (BR-02). */
  readonly pausesRun: boolean;
  readonly input: unknown;
}

/** A refused or failed tool call: an error result the model can read and act on. */
export interface ToolCallRefusal {
  readonly ok: false;
  readonly problem: ToolCallProblem;
  readonly message: string;
  /** The original error of a failed handler, for logs only; never shown to the model. */
  readonly cause?: unknown;
}

/** The result of one call in `resolveToolCalls`. */
export type ToolCallResolution =
  { readonly ok: true; readonly value: ResolvedToolCall } | ToolCallRefusal;

/** Result of `executeToolCall`: the output as JSON text, ready for the model. */
export type ToolCallExecution = { readonly ok: true; readonly value: string } | ToolCallRefusal;

interface ClassifiedTool {
  readonly tool: ToolDefinition;
  readonly entry: ToolPolicyEntry;
}

/** A requested call that is offered to the task and has valid input, before its limits. */
interface PreparedToolCall {
  readonly ok: true;
  readonly classified: ClassifiedTool;
  readonly input: unknown;
  readonly execute: () => Promise<ToolOutput>;
}

/** More issues than this add noise without helping the model fix its input. */
const MAX_REPORTED_ISSUES = 5;

/**
 * The longest tool output, in characters of JSON, that goes back to the model: about 4,000
 * tokens. Outputs are compact (conventions §15.4); a larger one is refused (review fixes, D-9).
 */
export const MAX_TOOL_OUTPUT_CHARS = 16_000;

function refuse(problem: ToolCallProblem, detail?: string): ToolCallRefusal {
  const message = TOOL_PROBLEM_MESSAGES[problem];
  return { ok: false, problem, message: detail === undefined ? message : `${message} ${detail}` };
}

function describeIssues(issues: readonly ToolInputIssue[]): string {
  return issues
    .slice(0, MAX_REPORTED_ISSUES)
    .map((issue) => `${issue.path}: ${issue.message}`)
    .join("; ");
}

/**
 * Creates the tool registry: it validates the tool configuration once, offers each task only
 * its classified tools, and checks every call the model asks for (ADR-0011, ADR-0014).
 * Throws `ToolRefusedError` when the configuration is not valid, which stops the app at startup.
 */
export function createToolRegistry(dependencies: ToolRegistryDependencies) {
  const { countCallsToday } = dependencies;

  const toolByName = new Map<string, ToolDefinition>();
  for (const tool of dependencies.tools) {
    if (toolByName.has(tool.name)) {
      throw new Error(`tool registered twice: ${tool.name}`);
    }
    toolByName.set(tool.name, tool);
  }

  const parsedConfig = toolPolicyConfigSchema.safeParse(dependencies.policyConfig);
  if (!parsedConfig.success) {
    throw new ToolRefusedError("TOOL_POLICY_INVALID", { cause: parsedConfig.error });
  }
  const config = parsedConfig.data;
  const effectByToolName = new Map<string, ToolEffect>(
    dependencies.tools.map((tool) => [tool.name, tool.effect]),
  );
  const finding = findToolConfigProblem(config, effectByToolName);
  if (finding !== undefined) {
    throw new ToolRefusedError(finding.problem, { toolName: finding.toolName });
  }

  // Maps, not objects: tool and task names come from the model and the config file (KP-08).
  const entryByToolName = new Map(Object.entries(config.policies));
  const classifiedByTask = new Map<string, ReadonlyMap<string, ClassifiedTool>>();
  for (const [task, toolNames] of Object.entries(config.tasks)) {
    const classifiedByName = new Map<string, ClassifiedTool>();
    for (const toolName of toolNames) {
      const tool = toolByName.get(toolName);
      const entry = entryByToolName.get(toolName);
      if (tool === undefined || entry === undefined) {
        throw new Error(`validated tool configuration lost a tool: ${toolName}`);
      }
      classifiedByName.set(toolName, { tool, entry });
    }
    classifiedByTask.set(task, classifiedByName);
  }

  // The handler of a resolved call stays here, so nothing outside the registry can run it.
  const executeByResolvedCall = new WeakMap<ResolvedToolCall, () => Promise<ToolOutput>>();

  /** The tools offered to the model for a task; a task without configuration gets none. */
  function listTools(task: string): readonly OfferedTool[] {
    const classifiedByName = classifiedByTask.get(task);
    if (classifiedByName === undefined) {
      return [];
    }
    return [...classifiedByName.values()].map(({ tool }) => ({
      name: tool.name,
      description: tool.description,
      inputJsonSchema: tool.inputJsonSchema,
    }));
  }

  /** Checks that a call is offered to the task and that its input is valid. */
  function prepareToolCall(
    task: string,
    call: RequestedToolCall,
  ): PreparedToolCall | ToolCallRefusal {
    const classified = classifiedByTask.get(task)?.get(call.toolName);
    if (classified === undefined) {
      return refuse("TOOL_NOT_FOUND");
    }
    const prepared = classified.tool.prepare(call.input);
    if (!prepared.ok) {
      return refuse("TOOL_INPUT_INVALID", describeIssues(prepared.issues));
    }
    return { ok: true, classified, input: prepared.input, execute: prepared.execute };
  }

  /** Today's count of each tool with a per-day limit, read once per tool and all at once. */
  async function readCallsToday(
    preparedCalls: readonly (PreparedToolCall | ToolCallRefusal)[],
  ): Promise<ReadonlyMap<string, number>> {
    const limitedToolNameSet = new Set(
      preparedCalls.flatMap((prepared) =>
        prepared.ok && prepared.classified.entry.maxCallsPerDay !== undefined
          ? [prepared.classified.tool.name]
          : [],
      ),
    );
    const counts = await Promise.all(
      [...limitedToolNameSet].map(
        async (toolName) => [toolName, await countCallsToday(toolName)] as const,
      ),
    );
    return new Map(counts);
  }

  /**
   * Checks every call of a step: offered to this task, valid input, within its limits. Calls are
   * checked in the order asked, and each accepted call counts toward the per-run and per-day
   * limits of the calls after it (review fixes, D-1). Earlier steps are already in today's count.
   */
  async function resolveToolCalls(
    request: ToolCallsRequest,
  ): Promise<readonly ToolCallResolution[]> {
    const preparedCalls = request.calls.map((call) => prepareToolCall(request.task, call));
    const callsTodayByToolName = await readCallsToday(preparedCalls);
    const acceptedThisStepByToolName = new Map<string, number>();

    return preparedCalls.map((prepared): ToolCallResolution => {
      if (!prepared.ok) {
        return prepared;
      }
      const { tool, entry } = prepared.classified;
      const acceptedThisStep = acceptedThisStepByToolName.get(tool.name) ?? 0;
      const limitProblem = checkCallLimits(entry, {
        callsThisRun: (request.callsThisRunByToolName.get(tool.name) ?? 0) + acceptedThisStep,
        callsToday: (callsTodayByToolName.get(tool.name) ?? 0) + acceptedThisStep,
      });
      if (limitProblem !== undefined) {
        return refuse(limitProblem);
      }
      acceptedThisStepByToolName.set(tool.name, acceptedThisStep + 1);

      const resolved: ResolvedToolCall = {
        toolName: tool.name,
        effect: tool.effect,
        policy: entry.policy,
        pausesRun: pausesRun(entry.policy),
        input: prepared.input,
      };
      if (!resolved.pausesRun) {
        executeByResolvedCall.set(resolved, prepared.execute);
      }
      return { ok: true, value: resolved };
    });
  }

  /**
   * Runs the handler of a resolved call, once. A failing handler, or an output over
   * `MAX_TOOL_OUTPUT_CHARS`, becomes an error result.
   */
  async function executeToolCall(resolved: ResolvedToolCall): Promise<ToolCallExecution> {
    if (resolved.pausesRun) {
      // BR-02: an approve tool acts only through a pending action the owner approved.
      throw new Error(`an approve tool never executes inside the loop: ${resolved.toolName}`);
    }
    const execute = executeByResolvedCall.get(resolved);
    if (execute === undefined) {
      throw new Error(`tool call was not resolved here or already executed: ${resolved.toolName}`);
    }
    executeByResolvedCall.delete(resolved);
    let output: ToolOutput;
    try {
      output = await execute();
    } catch (error) {
      return { ...refuse("TOOL_EXECUTION_FAILED"), cause: error };
    }
    const serialized = JSON.stringify(output);
    return serialized.length > MAX_TOOL_OUTPUT_CHARS
      ? refuse("TOOL_OUTPUT_TOO_LARGE")
      : { ok: true, value: serialized };
  }

  return { listTools, resolveToolCalls, executeToolCall };
}

/** The tool registry, created once in a composition root. */
export type ToolRegistry = ReturnType<typeof createToolRegistry>;
