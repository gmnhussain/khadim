import {
  calculateCallCostMicroUsd,
  decideRetry,
  isEmittedContent,
  LlmError,
  type LlmAssistantPart,
  type LlmMessage,
  type LlmProblem,
  type LlmProvider,
  type LlmResponse,
  type LlmToolCallPart,
  type LlmToolResultPart,
  type ModelRegistry,
} from "../llm";
import type { Clock } from "../shared";
import {
  type ResolvedToolCall,
  TOOL_PROBLEM_MESSAGES,
  type ToolCallRefusal,
  type ToolRegistry,
} from "../tools";
import type { AgentProblem } from "./agent.errors";
import {
  addCallUsage,
  addIteration,
  canRunInParallel,
  capTimeoutMs,
  computeRemainingRunMs,
  computeRunningMs,
  findReachedLimit,
  ZERO_RUN_TOTALS,
} from "./agent.rules";
import type {
  AgentRunInput,
  AgentRunOutcome,
  AgentRunResult,
  AgentRunStore,
  PromptFile,
  RequestPendingAction,
  RunLimits,
  Sleep,
  ToolCallResultRecord,
} from "./agent.types";
import { buildContext } from "./context-builder";

/** Dependencies of `createAgentLoop`. */
export interface AgentLoopDependencies {
  /** The enabled providers, by provider id (BR-27). */
  readonly providers: ReadonlyMap<string, LlmProvider>;
  readonly modelRegistry: ModelRegistry;
  readonly toolRegistry: ToolRegistry;
  readonly runStore: AgentRunStore;
  readonly requestPendingAction: RequestPendingAction;
  readonly systemPrompt: PromptFile;
  readonly limits: RunLimits;
  readonly clock: Clock;
  /** Returns a value in [0, 1) for retry jitter (plan D-9 rule 4). */
  readonly random: () => number;
  readonly sleep: Sleep;
}

/** How one model call ended, after any retries; a run limit can end it too (fix 1.3). */
type ModelCallResult =
  | { readonly kind: "completed"; readonly response: LlmResponse }
  | { readonly kind: "failed"; readonly problem: LlmProblem | AgentProblem }
  | { readonly kind: "cancelled" };

/**
 * A tool call that was refused, resolved and waiting to execute or to be approved, or deferred
 * because an earlier call of its step waits for the owner (review fixes, D-6).
 */
type CheckedToolCall =
  | { readonly call: LlmToolCallPart; readonly refusal: ToolCallRefusal }
  | { readonly call: LlmToolCallPart; readonly resolved: ResolvedToolCall }
  | { readonly call: LlmToolCallPart; readonly deferred: true };

/** A checked tool call after it was refused, executed or turned into a pending action. */
interface PerformedToolCall {
  readonly checked: CheckedToolCall;
  readonly result: ToolCallResultRecord;
  readonly durationMs: number;
}

/** A tool call after its step: what the model is told, and the pending action if it made one. */
interface HandledToolCall {
  readonly result: LlmToolResultPart | undefined;
  readonly pendingActionId: string | undefined;
}

function isToolCall(part: LlmAssistantPart): part is LlmToolCallPart {
  return part.type === "tool_call";
}

function joinText(content: readonly LlmAssistantPart[]): string {
  return content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("");
}

/**
 * Creates the tool-calling loop (ADR-0005). `runAgent` calls the model, executes the tools it
 * asks for under each tool's policy, and repeats until a final answer, a pause for approval, a
 * cancel or a limit (conventions §15.3). A run's history is append-only: every model call
 * starts with exactly the messages of the previous one (plan increment 4, owner 2026-11-12).
 */
export function createAgentLoop(dependencies: AgentLoopDependencies) {
  const { clock, limits, modelRegistry, runStore, toolRegistry } = dependencies;

  async function runAgent(input: AgentRunInput): Promise<AgentRunResult> {
    const { runId, task, cancelSignal } = input;
    // Read through a function: after one check, TypeScript would treat `aborted` as fixed,
    // though a cancel can arrive during any await.
    const isCancelled = (): boolean => cancelSignal.aborted;
    const priorTotals = input.priorTotals ?? ZERO_RUN_TOTALS;
    const enteredRunningAtMs = clock.now().getTime();
    let totals = priorTotals;

    function refreshRunningTime(): void {
      const nowMs = clock.now().getTime();
      totals = {
        ...totals,
        runningMs: computeRunningMs(priorTotals.runningMs, enteredRunningAtMs, nowMs),
      };
    }

    async function finish(outcome: AgentRunOutcome): Promise<AgentRunResult> {
      refreshRunningTime();
      await runStore.recordOutcome({ runId, outcome, totals });
      return { outcome, totals };
    }

    function fail(problem: AgentProblem | LlmProblem): Promise<AgentRunResult> {
      return finish({ status: "failed", problem });
    }

    const routeResolution = modelRegistry.resolveRoute(task);
    if (!routeResolution.ok) {
      return fail(routeResolution.problem);
    }
    const route = routeResolution.value;
    const routedProvider = dependencies.providers.get(route.provider);
    if (routedProvider === undefined) {
      return fail("LLM_ROUTE_INVALID");
    }
    // A new constant keeps the checked type inside the functions declared below.
    const provider: LlmProvider = routedProvider;

    const context = buildContext({
      systemPrompt: dependencies.systemPrompt,
      tools: toolRegistry.listTools(task),
      history: input.history,
      input: input.input,
    });
    const messages: LlmMessage[] = [...context.messages];
    // Calls accepted in this run, by tool name, so per-run limits hold across a pause
    // (review fixes, D-5).
    const callCountByToolName = new Map<string, number>(input.priorToolCallCounts ?? []);

    /**
     * One model call with the retry policy of phase-1 plan, D-9. Every attempt is recorded
     * (BR-23). The run's limits are checked after a failed attempt and before a retry, so a limit
     * reached during a call or a wait ends the run with its own code (fix 1.3).
     */
    async function callModel(stepNumber: number): Promise<ModelCallResult> {
      for (let attempt = 1; ; attempt += 1) {
        refreshRunningTime();
        // The first attempt was checked by the loop just before; a retry follows a wait.
        const limitBeforeAttempt = attempt === 1 ? undefined : findReachedLimit(totals, limits);
        if (limitBeforeAttempt !== undefined) {
          return { kind: "failed", problem: limitBeforeAttempt };
        }
        const startedAtMs = clock.now().getTime();
        let hasEmittedContent = false;
        let response: LlmResponse | undefined;
        let failure: LlmError | undefined;
        try {
          const events = provider.stream({
            model: route.model,
            system: context.system,
            tools: context.tools,
            messages: [...messages],
            maxOutputTokens: route.maxOutputTokens,
            timeoutMs: capTimeoutMs(route.timeoutMs, computeRemainingRunMs(totals, limits)),
            ...(route.effort === undefined ? {} : { effort: route.effort }),
          });
          for await (const event of events) {
            hasEmittedContent ||= isEmittedContent(event);
            if (event.type === "completed") {
              response = event.response;
            }
          }
          // A stream that ends without a completed response was cut off: an outage.
          failure = response === undefined ? new LlmError("LLM_UNAVAILABLE") : undefined;
        } catch (error) {
          if (!(error instanceof LlmError)) {
            throw error;
          }
          // An error after the completed response loses nothing: the answer is kept, and the
          // call is neither failed nor paid for twice (fix 1.4).
          failure = response === undefined ? error : undefined;
        }

        const usage = response?.usage ?? failure?.usage;
        const costMicroUsd =
          usage === undefined ? 0 : calculateCallCostMicroUsd(usage, route.priceTiers);
        totals = addCallUsage(totals, usage, costMicroUsd);
        refreshRunningTime();
        await runStore.recordLlmCall({
          runId,
          stepNumber,
          attempt,
          provider: route.provider,
          model: route.model,
          usage,
          costMicroUsd,
          latencyMs: clock.now().getTime() - startedAtMs,
          stopReason: failure === undefined ? response?.stopReason : undefined,
          problem: failure?.problem,
        });

        if (failure === undefined && response !== undefined) {
          return { kind: "completed", response };
        }
        const problem = failure?.problem ?? "LLM_UNAVAILABLE";
        const decision = decideRetry({
          problem,
          retryAfterMs: failure?.retryAfterMs,
          hasEmittedContent,
          attemptsMade: attempt,
          maxAttempts: route.maxAttempts,
          remainingRunMs: computeRemainingRunMs(totals, limits),
          randomValue: dependencies.random(),
        });
        // A limit replaces the call's own problem only when the call would otherwise wait for a
        // retry: a refusal or a cut-off answer keeps its code. The totals were refreshed above.
        const wouldWait = decision.retry || decision.refusal === "exceeds_time_budget";
        const limitAfterFailure = wouldWait ? findReachedLimit(totals, limits) : undefined;
        if (limitAfterFailure !== undefined) {
          return { kind: "failed", problem: limitAfterFailure };
        }
        if (!decision.retry) {
          return { kind: "failed", problem };
        }
        await dependencies.sleep(decision.delayMs, cancelSignal);
        if (cancelSignal.aborted) {
          return { kind: "cancelled" };
        }
      }
    }

    /**
     * Checks a step's calls against the task's tools, their schemas and their limits. Once a
     * call pauses the run, the calls after it are deferred: they wait for the owner's decision
     * and do not count toward any limit (review fixes, D-6).
     */
    async function checkToolCalls(
      calls: readonly LlmToolCallPart[],
    ): Promise<readonly CheckedToolCall[]> {
      const resolutions = await toolRegistry.resolveToolCalls({
        task,
        calls: calls.map((call) => ({ toolName: call.toolName, input: call.input })),
        callsThisRunByToolName: callCountByToolName,
      });
      const checkedCalls: CheckedToolCall[] = [];
      let isAfterPausingCall = false;
      for (const [index, call] of calls.entries()) {
        const resolution = resolutions[index];
        if (resolution === undefined) {
          throw new Error(`tool registry returned no resolution for call ${index + 1}`);
        }
        if (isAfterPausingCall) {
          checkedCalls.push({ call, deferred: true });
        } else if (resolution.ok) {
          callCountByToolName.set(call.toolName, (callCountByToolName.get(call.toolName) ?? 0) + 1);
          checkedCalls.push({ call, resolved: resolution.value });
          isAfterPausingCall = resolution.value.pausesRun;
        } else {
          checkedCalls.push({ call, refusal: resolution });
        }
      }
      return checkedCalls;
    }

    /** Executes a checked call, or turns an `approve` call into a pending action (BR-02). */
    async function performToolCall(
      stepNumber: number,
      checked: CheckedToolCall,
    ): Promise<PerformedToolCall> {
      const { call } = checked;
      const startedAtMs = clock.now().getTime();
      let result: ToolCallResultRecord;

      if ("deferred" in checked) {
        const problem = "TOOL_CALL_DEFERRED";
        result = { status: "refused", problem, message: TOOL_PROBLEM_MESSAGES[problem] };
      } else if ("refusal" in checked) {
        const { problem, message } = checked.refusal;
        result = { status: "refused", problem, message };
      } else if (checked.resolved.pausesRun) {
        const pending = await dependencies.requestPendingAction({
          runId,
          stepNumber,
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          input: checked.resolved.input,
        });
        result = { status: "pending_approval", pendingActionId: pending.pendingActionId };
      } else {
        const execution = await toolRegistry.executeToolCall(checked.resolved);
        // The cause is kept for logs only; the model is told the problem and its message (§14).
        result = execution.ok
          ? { status: "completed", output: execution.value }
          : {
              status: "refused",
              problem: execution.problem,
              message: execution.message,
              ...(execution.cause === undefined ? {} : { cause: execution.cause }),
            };
      }
      return { checked, result, durationMs: clock.now().getTime() - startedAtMs };
    }

    /** Records a performed call and returns what the model is told about it. */
    async function recordToolCall(
      stepNumber: number,
      performed: PerformedToolCall,
    ): Promise<HandledToolCall> {
      const { checked, result, durationMs } = performed;
      const { call } = checked;
      await runStore.recordToolCall({
        runId,
        stepNumber,
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        input: "resolved" in checked ? checked.resolved.input : call.input,
        policy: "resolved" in checked ? checked.resolved.policy : undefined,
        result,
        durationMs,
      });
      if (result.status === "pending_approval") {
        return { result: undefined, pendingActionId: result.pendingActionId };
      }
      return {
        result: {
          type: "tool_result",
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          isError: result.status === "refused",
          output: result.status === "completed" ? result.output : result.message,
        },
        pendingActionId: undefined,
      };
    }

    /**
     * Handles every tool call of a step: all reads in parallel, anything else in order. Calls
     * are recorded, and answered to the model, in the order the model asked for them.
     */
    async function handleToolCalls(
      stepNumber: number,
      calls: readonly LlmToolCallPart[],
    ): Promise<readonly HandledToolCall[]> {
      const checkedCalls = await checkToolCalls(calls);
      const effects = checkedCalls.flatMap((checked) =>
        "resolved" in checked ? [checked.resolved.effect] : [],
      );
      const handledCalls: HandledToolCall[] = [];
      if (canRunInParallel(effects)) {
        const performedCalls = await Promise.all(
          checkedCalls.map((checked) => performToolCall(stepNumber, checked)),
        );
        for (const performed of performedCalls) {
          handledCalls.push(await recordToolCall(stepNumber, performed));
        }
        return handledCalls;
      }
      for (const checked of checkedCalls) {
        const performed = await performToolCall(stepNumber, checked);
        handledCalls.push(await recordToolCall(stepNumber, performed));
      }
      return handledCalls;
    }

    for (;;) {
      if (cancelSignal.aborted) {
        return finish({ status: "cancelled" });
      }
      refreshRunningTime();
      const limitBeforeCall = findReachedLimit(totals, limits);
      if (limitBeforeCall !== undefined) {
        return fail(limitBeforeCall);
      }

      const stepNumber = totals.iterations + 1;
      const modelCall = await callModel(stepNumber);
      if (modelCall.kind === "cancelled") {
        return finish({ status: "cancelled" });
      }
      if (modelCall.kind === "failed") {
        return fail(modelCall.problem);
      }
      const { content } = modelCall.response;
      totals = addIteration(totals);
      await runStore.recordStep({
        runId,
        stepNumber,
        promptVersion: dependencies.systemPrompt.version,
        content,
      });
      messages.push({ role: "assistant", content });

      const toolCalls = content.filter(isToolCall);
      const answer = joinText(content);
      if (toolCalls.length === 0 && answer.trim() !== "") {
        // A finished answer is never discarded, even when this call crossed a budget or the
        // owner cancelled while it was written: nothing is left to stop.
        return finish({ status: "succeeded", answer });
      }

      // A cancel that came while the model was answering stops the step's tools, and wins over
      // a blank answer (fix 1.1).
      if (isCancelled()) {
        return finish({ status: "cancelled" });
      }

      if (toolCalls.length === 0) {
        // A blank answer is not an answer, and is not retried (review fixes, D-7).
        return fail("RUN_EMPTY_ANSWER");
      }

      // The results could not be sent to the model, so the tools do not run (owner, 2026-11-12).
      refreshRunningTime();
      const limitBeforeTools = findReachedLimit(totals, limits);
      if (limitBeforeTools !== undefined) {
        return fail(limitBeforeTools);
      }

      const handledCalls = await handleToolCalls(stepNumber, toolCalls);
      const pendingActionIds = handledCalls.flatMap((handled) =>
        handled.pendingActionId === undefined ? [] : [handled.pendingActionId],
      );
      if (pendingActionIds.length > 0) {
        return finish({ status: "awaiting_approval", pendingActionIds });
      }
      messages.push({
        role: "tool",
        content: handledCalls.flatMap((handled) =>
          handled.result === undefined ? [] : [handled.result],
        ),
      });
    }
  }

  return { runAgent };
}

/** The agent loop, created once in a composition root. */
export type AgentLoop = ReturnType<typeof createAgentLoop>;
