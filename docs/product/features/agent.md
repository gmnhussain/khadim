# Agent

**Runs the owner's tasks: a bounded loop that calls a language model, executes the tools it asks for under each tool's policy, and stops with an answer, a pause for approval, a cancellation or a clear problem code.**

| | |
| --- | --- |
| Status | Built in slice 1a, done 2026-11-12. The owner approved the new problem codes and answered every open question on 2026-11-12; the answers are at the end. Covers slice 1a (loop, tools and LLM port in core, no database or apps). The 1b plan adds conversations, persistence, streaming to the browser and the API surface |
| Design | [Agent design](../../architecture/agent.md); conventions §15; ADR-0005, ADR-0009, ADR-0010, ADR-0011, ADR-0012, ADR-0014 |
| Plan | [Phase 1, slice 1a](../../plans/phase-1-agent-core.md#slice-1a-in-detail) |

Terms are in the [glossary](../glossary.md); this doc never redefines them.

## Entities

Slice 1a has no tables. The loop reads and writes through an injected run store (ADR-0012) with an in-memory fake in tests; 1b gives each entity its table.

| Entity | Code name | In 1a | Notes |
| --- | --- | --- | --- |
| Agent run | `AgentRun` | In memory | Task, model route, prompt version, status, totals (iterations, tokens, cost in micro-USD, running time) |
| Run step | `AgentStep` | In memory | One model call and the tool calls it requested |
| LLM call | `LlmCall` | In memory | Provider, model, attempt number, tokens (input, output, cache write, cache read), cost, latency, stop reason, mapped problem if it failed (BR-23, BR-24) |
| Tool call | `ToolCall` | In memory | Tool name, validated input, result or error result, policy applied, timing (BR-23) |
| Tool | `ToolDefinition` | Code | Name, description, Zod input schema, handler, effect tier |
| Tool policy | `ToolPolicy` | Validated configuration object | `auto`, `propose` or `approve`, with per-run and per-day call limits, by tool name; each task lists its tools (ADR-0011). Arguments bound by the run arrive with their first tool, in Phase 5 |
| Model catalog and routes | `modelCatalog`, `ModelRoute` | Validated configuration object | Per model: provider, id, capabilities, context limit, tiered prices. Per task: route, effort, `maxAttempts` (plan D-1, D-9) |
| Message and content parts | `llm.types` | Code | Provider-neutral: text, tool call, tool result, and an opaque reasoning part the adapter returns to the same provider unchanged |
| Pending action | `PendingAction` | Not built | 1a only signals that a step created one, through an injected dependency; the entity arrives with approvals (Phase 3) |

### Run outcomes in 1a

`runAgent()` returns a discriminated result (conventions §7). The status names match the state machine in [agent design §1](../../architecture/agent.md#1-run-lifecycle).

| Outcome | When |
| --- | --- |
| `succeeded` | The model gave a final answer |
| `awaiting_approval` | A step created at least one pending action, after the step's calls were handled; the calls after its first `approve` call are deferred (review fixes, D-6) |
| `cancelled` | A cancel was seen between steps, during a retry wait, or when a model call returned asking for tools, which then do not run |
| `failed` with a problem code | A limit was reached or a model call failed for good |

## Flows

The full loop, tool policy and routing diagrams are in agent design §2, §4 and §7. This is one iteration with the retry policy of plan decision D-9.

```mermaid
flowchart TD
  start[Start of iteration] --> cancel{Cancel requested?}
  cancel -->|yes| cancelled[Run cancelled]
  cancel -->|no| limits{Iteration, cost, token<br/>or time limit reached?}
  limits -->|yes| failed[Run failed with the limit's code]
  limits -->|no| call[Call the model through LlmProvider]
  call --> result{Result}
  result -->|refusal| refused[Run failed: LLM_REFUSED]
  result -->|error| retry{Retryable, nothing emitted,<br/>attempts left, no run limit reached,<br/>delay shorter than the running time left?}
  retry -->|no| failedcall[Run failed with the mapped code]
  retry -->|yes| wait[Wait: backoff with jitter<br/>or retryAfterMs, whichever is longer]
  wait -->|cancel during wait| cancelled
  wait --> call
  result -->|final answer| record1[Record step and LLM call] --> done[Run succeeded]
  result -->|tool calls| record2[Record step and LLM call] --> tools[Validate input, apply policy,<br/>execute; errors go back to the model]
  tools --> paused{Step created<br/>pending actions?}
  paused -->|yes| awaiting[Run awaiting approval]
  paused -->|no| start
```

## Rules

Business rules, by id only:

| Rule | Where 1a applies it |
| --- | --- |
| BR-02 | The tier floor: an `external` tool is always `approve`, and an `approve` tool never executes inside the loop |
| BR-21 | Stop conditions and budgets in `agent.rules` |
| BR-23, BR-24 | Every model call and tool call is recorded through the run store, with provider and model |
| BR-25 | Catalog and route validation in `model-registry` and `model-routing.rules` |
| BR-27 | Only providers present in the validated configuration can be routed to |

Not in 1a: BR-20 (triggers, 1b), BR-22 (daily budget, 1c), BR-26 (fallbacks, 1c).

Design rules this module implements, by reference: conventions §15.1 to §15.5 and §15.11; plan decisions D-1, D-3, D-5, D-8 and D-9; ADR-0011 (tiers and policies) and ADR-0014 (unclassified tools are never offered).

### Problem codes

The closed unions of conventions §12.1. "Documented" codes come from conventions §12; "new" codes are defined here and were approved by the owner on 2026-11-12. Codes never carry an HTTP status; the API's handler maps them in 1b.

**Tool problems** (`ToolProblem`, `tool.errors.ts`)

| Code | Status | Meaning | Effect |
| --- | --- | --- | --- |
| `TOOL_INPUT_INVALID` | Documented | The model's input does not match the tool's schema | Error result to the model, which can fix it (§15.4) |
| `TOOL_NOT_FOUND` | New | The model asked for a tool that is not offered to this run | Error result to the model |
| `TOOL_LIMIT_REACHED` | New (illustrative in §12.1) | The tool reached its per-run or per-day call limit | Error result to the model |
| `TOOL_EXECUTION_FAILED` | New | The tool's handler failed | Error result to the model, with a short message and no internals; the original error goes to the run store for logs only |
| `TOOL_OUTPUT_TOO_LARGE` | New (owner, 2026-11-12) | The tool's output is over `MAX_TOOL_OUTPUT_CHARS` (16,000 characters of JSON). The handler has run | Error result to the model, which can ask for less |
| `TOOL_CALL_DEFERRED` | New (owner, 2026-11-12) | An earlier call in the same step waits for the owner's decision, so this call was not run | Error result to the model, which can ask for the call again after the decision |
| `TOOL_UNCLASSIFIED` | New (illustrative in §12.1) | The tool has no owner-assigned tier and policy (ADR-0014) | Never offered to the model. A task that lists such a tool is rejected as configuration; the app does not start (fail closed, conventions §15.4) |
| `TOOL_POLICY_INVALID` | New | A policy breaks the tier's allowed policies, for example `external` with `auto` (ADR-0011) | Configuration is rejected; the app does not start |

**LLM problems** (`LlmProblem`, `llm.errors.ts`)

| Code | Status | Meaning | Retried (D-9) | Effect when final |
| --- | --- | --- | --- | --- |
| `LLM_RATE_LIMITED` | Documented | The provider rate-limited the call; carries an optional `retryAfterMs` | Yes | Run fails |
| `LLM_UNAVAILABLE` | Documented | The provider is overloaded, failing, unreachable or timed out | Yes | Run fails |
| `LLM_REFUSED` | Documented | The model refused (plan D-8) | No | Run fails |
| `LLM_REQUEST_REJECTED` | New | The provider rejected the request as invalid: a bug in Khadim | No | Run fails |
| `LLM_NOT_AUTHORIZED` | New (owner, 2026-11-12) | The key is invalid, a permission is missing, or credit or billing is exhausted: the owner fixes it | No | Run fails |
| `LLM_OUTPUT_TRUNCATED` | New (owner, 2026-11-12) | The call stopped at its maximum output. Cut-off text is never an answer and a cut-off tool call never executes | No | Run fails |
| `LLM_CONTEXT_EXCEEDED` | New (owner, 2026-11-12) | The context is larger than the model's limit | No | Run fails |
| `LLM_ROUTE_INVALID` | New | The model catalog is malformed, or a route names an unknown model, a provider that is not enabled, or a model without a capability the task needs (BR-25) | — | Configuration is rejected; the app does not start |

**Agent problems** (`AgentProblem`, `agent.errors.ts`)

| Code | Status | Meaning | Effect |
| --- | --- | --- | --- |
| `RUN_ITERATION_LIMIT` | Documented | The run reached its iteration limit (BR-21) | Run fails |
| `RUN_BUDGET_EXCEEDED` | Documented | The run reached its cost budget (BR-21) | Run fails |
| `RUN_TOKEN_LIMIT` | New (owner, 2026-11-12) | The run reached its token limit, counting input and output across all calls (BR-21) | Run fails |
| `RUN_TIME_LIMIT` | New (owner, 2026-11-12) | The run reached its running-time limit (BR-21) | Run fails |
| `RUN_EMPTY_ANSWER` | New (owner, 2026-11-12) | The model's final answer has no text, or only whitespace, and no tool call | Run fails; not retried |

A failed run carries exactly one problem: an agent problem, or the LLM problem that ended its last model call. Tool problems never fail a run by themselves; a model that keeps failing a tool runs into the iteration limit.

## Edge cases

- **Invalid tool input, twice in a row:** each attempt returns `TOOL_INPUT_INVALID` to the model; nothing but the iteration limit bounds the attempts.
- **Unknown tool name from the model:** `TOOL_NOT_FOUND` goes back as an error result. The name is checked with `Object.hasOwn` before any lookup (KP-08).
- **Several tool calls in one step:** when every call is a `read` tool they run in parallel; otherwise the step's calls run one at a time in the order the model asked (§15.3, ADR-0011).
- **A step with both an `auto` and an `approve` call:** the calls before the first `approve` call run; the `approve` call becomes a pending action; each call after it is not run and the model receives `TOOL_CALL_DEFERRED`, so it can ask again after the owner's decision. The run then pauses (agent design §1; owner, 2026-11-12, which replaced "every call is handled first").
- **Several calls of a tool with a per-day limit in one step:** each accepted call counts toward the next, so the step cannot pass the limit. Two runs at the same time can, until 1b's reservation.
- **A run resumed after a pause:** it is given the calls of each tool it accepted before the pause, so per-run limits hold across the pause.
- **A tool output over 16,000 characters of JSON:** the model receives `TOOL_OUTPUT_TOO_LARGE`, which says the tool ran.
- **Stream fails before any text or tool call:** retried under D-9. Provider metadata (start, ping, usage) does not count as emitted.
- **Stream fails after text or a tool call was emitted:** the step fails with the mapped code; no retry (D-9 rule 2).
- **Retry delay not shorter than the remaining running time:** the run fails without waiting, with `LLM_RATE_LIMITED` or `LLM_UNAVAILABLE`, whichever the call returned. A call is retried only when its delay, from the backoff or from `retryAfterMs`, is strictly shorter than the running time left; a wait that ends exactly at the limit leaves no time for the call (D-9 rule 1; owner, 2026-11-12).
- **Cancel during a retry wait:** the wait ends at once and the run ends as `cancelled` (D-9 rule 5).
- **Cancel during a model call:** the call finishes and is recorded. If it asked for tools, none runs, no pending action is requested and the run ends `cancelled`. A final answer with text is kept and the run succeeds, because nothing is left to stop; a blank answer ends the run `cancelled`, not `RUN_EMPTY_ANSWER` (owner, 2026-11-12).
- **A run limit reached during a call or a retry wait:** a call that would otherwise be retried is not, and the run fails with the limit's code; a call cut off by the remaining running time fails with `RUN_TIME_LIMIT`. A non-retryable problem, such as `LLM_REFUSED`, keeps its own code.
- **An error after the completed response:** the response is kept, and the call is neither retried nor paid for twice.
- **A final answer with no text:** empty, only whitespace or only reasoning; the run fails with `RUN_EMPTY_ANSWER` and is not retried.
- **History inside a run:** append-only in 1a. Nothing is trimmed or summarised, and reasoning parts go back to the provider exactly as received; trimming and summarising are decided in the 1b plan (owner, 2026-11-12).
- **Context larger than the model's limit:** the run fails with `LLM_CONTEXT_EXCEEDED` (owner, 2026-11-12).
- **Call stopped at its maximum output:** the run fails with `LLM_OUTPUT_TRUNCATED`; the cut-off text is not returned and a cut-off tool call is not executed (owner, 2026-11-12).
- **Stream fails after only reasoning content:** nothing counts as emitted, so the call is retried (owner, 2026-11-12).
- **Cost of one call:** rounded up to a whole micro-USD; a run's total is the sum of its rounded calls (owner, 2026-11-12).
- **Prompt at the price-tier boundary:** cost uses the tier chosen by prompt size, tested on both sides of the boundary (plan P-6).
- **A configuration key that is not a name, such as `__proto__`:** the tool configuration is rejected with `TOOL_POLICY_INVALID`, and the model catalog with `LLM_ROUTE_INVALID`; the key is never silently dropped (KP-21; ADR-0014).
- **A tool whose input schema is not strict all the way down, has an untyped field, or accepts no input at its root:** `defineTool` throws and the app does not start (review fixes, D-8).
- **Tool description or result containing instructions:** treated as data; it cannot change policy, limits or which tools are offered (§15.11).

## Acceptance criteria

All are proved by unit tests with `FakeLlmProvider`, an in-memory run store, a fixed clock and a fixed random source. No test calls a real model.

- **Final answer.** Given a scripted reply with text only, when the run executes, then it ends `succeeded` with one step, one LLM call and its cost recorded (BR-21, BR-23).
- **Tool call.** Given a reply that calls `get_current_time` and then a final answer, when the run executes, then the tool result is appended, both steps are recorded and the run ends `succeeded`.
- **Invalid tool input.** Given a tool call whose input fails the schema, when the step executes, then the handler is not called, the model receives a `TOOL_INPUT_INVALID` error result, and the run continues.
- **Iteration limit.** Given replies that always call a tool, when the limit of BR-21 is reached, then the run ends `failed` with `RUN_ITERATION_LIMIT`, and the tools asked for on the last allowed iteration are not executed.
- **Cost budget.** Given usage whose cost reaches the per-run budget, when budgets are checked, then the run ends `failed` with `RUN_BUDGET_EXCEEDED` and no further model call is made.
- **Token limit.** Given usage that reaches the per-run token limit, then the run ends `failed` with `RUN_TOKEN_LIMIT` and no further model call is made.
- **Time limit.** Given running time that reaches the limit, then the run ends `failed` with `RUN_TIME_LIMIT` and no further model call is made.
- **Final answer over budget.** Given a final answer from the call that crosses the cost or token budget, then the run ends `succeeded`: a budget stops the next call and never discards a finished answer.
- **Cancellation between steps.** Given a cancel requested while a step runs, when the step finishes, then the run ends `cancelled` before the next model call.
- **Cancellation during a model call.** Given a cancel while the model answers with tool calls, then no tool runs, no pending action is requested and the run ends `cancelled`.
- **Calls after an approve call.** Given a step with an `approve` call followed by an `auto` call, then the `auto` call does not run and the model receives `TOOL_CALL_DEFERRED`.
- **Blank answer.** Given a final answer with no text, then the run ends `failed` with `RUN_EMPTY_ANSWER` and is not retried.
- **Approve policy.** Given a tool whose policy is `approve`, when the model calls it, then its handler does not execute, a pending action is requested and the run ends `awaiting_approval` (BR-02).
- **Tier floor.** Given a policy that sets an `external` tool to `auto`, when the configuration is validated, then it is rejected with `TOOL_POLICY_INVALID` (BR-02, ADR-0011).
- **Unclassified tool.** Given a task that lists a tool without a tier and policy, when the configuration is validated, then it is rejected with `TOOL_UNCLASSIFIED`; the tool is never offered to the model and never silently left out (ADR-0014).
- **Per-day limit.** Given a tool whose per-day limit is already reached by the injected day count, when the model calls it, then the handler does not run and the model receives `TOOL_LIMIT_REACHED`.
- **Current time.** Given a fixed clock, when `get_current_time` is called with no input, then it returns the UTC timestamp, the configured zone and the local date and time; given an unknown zone, then the model receives `TOOL_INPUT_INVALID`.
- **Refusal.** Given a reply with the refusal stop reason, when the run executes, then it ends `failed` with `LLM_REFUSED` and is not retried (plan D-8).
- **Truncated output.** Given a reply that stops at its maximum output, when the run executes, then it ends `failed` with `LLM_OUTPUT_TRUNCATED`, no text is returned as the answer, no tool call from that reply executes, and the call is not retried.
- **Context exceeded.** Given a call the provider reports as over the model's context limit, then the run ends `failed` with `LLM_CONTEXT_EXCEEDED` and the call is not retried.
- **Not authorised.** Given a call rejected for an invalid key, a missing permission or exhausted credit, then the run ends `failed` with `LLM_NOT_AUTHORIZED` and the call is not retried.
- **Retry before output.** Given a stream that fails with `LLM_UNAVAILABLE` before emitting text or a tool call, when attempts remain, then the call is retried after the computed delay (D-9).
- **No retry after output.** Given a stream that fails after emitting text, or after emitting a tool call, then the step fails with the mapped code and is not retried (D-9 rule 2).
- **Retry-After.** Given `LLM_RATE_LIMITED` with `retryAfterMs` longer than the backoff, then the wait is the full `retryAfterMs`; given `retryAfterMs` equal to or longer than the remaining running time, then the run fails without waiting (D-9 rule 1).
- **Attempts.** Given a route with `maxAttempts` 3 and three retryable failures, then the third failure ends the call with its mapped code (D-9 rule 3).
- **Cancel during a wait.** Given a cancel during a retry wait, then the wait ends at once and the run ends `cancelled` (D-9 rule 5).
- **Invalid route.** Given a task that needs tools routed to a model without tool support, when the catalog is validated, then it is rejected with `LLM_ROUTE_INVALID` (BR-25).
- **Adapter contract.** Given Anthropic fixtures hand-built from the provider's documented shapes (recorded fixtures replace them after the deferred recording, phase-1 plan, D-6), when the shared contract suite runs, then messages, tool calls, streaming events, usage and every mapped error code match, `retryAfterMs` comes from the rate-limit response, the SDK's retries are off, and no rejected field is sent (plan P-5).

## Owner decisions

Every open question of slice 1a is answered. The answers below are the owner's, as recorded in the [plan](../../plans/phase-1-agent-core.md#increments); nothing is open.

**Limits and outcomes**

> **Owner answer (2026-11-12):** **Default:** the per-run token limit is 500,000 tokens, counting input and output across all calls, retuned after the first evals. It stops runaway loops on cheap models, where the cost budget alone would allow millions of tokens.

> **Owner answer (2026-11-12):** The token limit has its own code, `RUN_TOKEN_LIMIT`; `RUN_BUDGET_EXCEEDED` stays for cost only. `RUN_TIME_LIMIT` is the name for the running-time limit.

> **Owner answer (2026-11-12):** When the call that returns the final answer also crosses the cost or token budget, the run succeeds: a budget stops the next call and never discards a finished answer.

> **Owner answer (2026-11-12):** Tools the model asks for on the last allowed iteration are not executed; the run fails with `RUN_ITERATION_LIMIT`.

**Model calls**

> **Owner answer (2026-11-12):** A call that stops at its maximum output fails the run with `LLM_OUTPUT_TRUNCATED`, and is not retried. Cut-off text is never returned as an answer, and a cut-off tool call is never executed.

> **Owner answer (2026-11-12):** A run's history is append-only in 1a, and a run whose context is over the model's limit fails with `LLM_CONTEXT_EXCEEDED`. It is not retried.

> **Owner answer (2026-11-12):** The maximum output and the timeout of a call both live on the route in the catalog. **Default:** 16,000 output tokens and a 120-second timeout per call, with the timeout capped by the run's remaining running time. Both are retuned after the first evals.

> **Owner answer (2026-11-12):** A stream that fails after only reasoning content counts as nothing emitted under D-9 rule 2, and is retried.

> **Owner answer (2026-11-12):** Under D-9 rule 1, when a provider's retry delay is equal to or longer than the remaining running time, the run fails with `LLM_RATE_LIMITED`, not with `RUN_TIME_LIMIT`.

> **Owner answer (2026-11-12):** Non-retryable provider errors have two codes. `LLM_REQUEST_REJECTED` is an invalid request, a bug in Khadim. `LLM_NOT_AUTHORIZED` is an invalid key, a missing permission, or exhausted credit or billing, which the owner fixes. Neither is retried.

> **Owner answer (2026-11-12):** Cost is rounded up to a whole micro-USD per call; run totals are the sum of the rounded calls.

**Tools and approvals**

> **Owner answer (2026-11-12):** For the loop, `propose` is the same as `auto`: the handler runs now and the run continues. The difference lives in the tool's own module (ADR-0011).

> **Owner answer (2026-11-12):** 1a proves the approve pause with an injected "request pending action" dependency and a fake approve tool. The real implementation comes with approvals in Phase 3; no production placeholder is added.

> **Owner answer (2026-11-12):** The per-day tool limit is a pure rule in 1a, fed the day's call count by an injected source. Tests use an in-memory count; real counts come from the database in 1b.

> **Owner answer (2026-11-12):** `get_current_time` takes an optional IANA `timeZone`, defaulting to the configured zone (Asia/Dhaka). It returns the UTC timestamp, the zone, and the local date and time. An unknown zone is `TOOL_INPUT_INVALID`.

> **Owner answer (2026-11-12):** A task that lists a tool with no policy entry stops the app at startup (fail closed, conventions §15.4), with `TOOL_UNCLASSIFIED`. A tool is never silently left out.

> **Owner answer (2026-11-12):** `APPROVAL_REQUIRED` is not used in 1a, because a pause is an outcome, not an error. It is defined by the approvals feature doc in Phase 3.
