# Plan: Phase 1a review fixes

**Fix what the four high-effort reviews of slice 1a found and the three gaps the owner found, before the 1b plan builds on this code. Findings that belong to 1b, 1c or Phase 3 go into those plans' carry-over tables; the rest are fixed here, each proved by a test that fails before the fix and passes after it.**

| | |
| --- | --- |
| Status | Done 2026-11-12: all six slices, with fix 6.4 partly reverted. Approved by the owner, 2026-11-12: D-1 to D-10 as their Defaults, with D-10 as changed by this plan and the edge case D-6 changes in `features/agent.md`; the names `RUN_EMPTY_ANSWER`, `TOOL_CALL_DEFERRED` and `TOOL_OUTPUT_TOO_LARGE` and `MAX_TOOL_OUTPUT_CHARS` = 16,000 |
| Phase | 1a, on branch `feat/agent-loop-core`, before the 1b plan |
| Sources | `/code-review high` of `chore/apply-foundation-review...feat/agent-loop-core` for `core/src/shared` and `core/src/tools` (#1–#17), `core/src/llm` (L1–L18), `core/src/agent` (A1–A15) and `packages/integrations` (I1–I17), all run without a verify pass; and the owner's own review (R1–R3), each confirmed in the code |

## Goal and scope

In scope: all 70 findings, each with exactly one outcome.

| Outcome | Count | Where |
| --- | --- | --- |
| Fix now | 56 findings, in 41 fixes | [Slices](#slices) 1–6 |
| Carry to a later plan | 7: L8, I5, A4, #2, A12, I11, I16 | [Carried to later plans](#carried-to-later-plans) |
| No change | 7: #8, #9, #10, #11, I13, L15, I7 | [No change](#no-change) |

I4 has a core half (fix 1.5) and an adapter half (fix 4.4), and is counted once.

Not in scope: any 1b work (database, worker, apps, event sink), new tools, and the decisions the 1b plan owns (history trimming, which process builds the provider registry).

Findings that share a root cause are one fix. Ids in **bold** in a slice's tables are the fix's lead id. Every slice is one commit, passes the full gate under [Verification](#verification), and stops for review.

## Slices

### 1. Loop safety

- Scope: core (`agent`, `tools`, `llm/testing`) · tests · docs (`features/agent.md`, agent design §1 and §2)
- Copy from: `agent/agent-loop.ts`, `agent/agent.rules.ts`, `tools/tool-registry.ts`
- Gate: as in [Verification](#verification)

| Fix | Findings | Change | Test that fails before and passes after |
| --- | --- | --- | --- |
| 1.1 Cancel seen when a model call returns | **A3** | After `callModel` returns `completed` with tool calls, the loop records the step, then ends the run `cancelled` if `cancelSignal` is aborted: no tool runs and no pending action is requested. The call's cost is recorded as now. A final answer is kept, as a budget never discards one: nothing is left to stop. | `agent-loop.test.ts` "a cancel during a model call ends the run cancelled before any tool runs": a fake provider whose stream aborts the controller while it runs, then answers `[save_note (auto), publish_note (approve)]`; expects outcome `cancelled`, no tool call record and no pending-action request |
| 1.2 No calls after an `approve` call in the same step | **A8** | D-6. `handleToolCalls` stops executing at the first resolved `approve` call: calls before it run as now, the `approve` call becomes a pending action, and each call after it is recorded as refused with the new `TOOL_CALL_DEFERRED`, with a message the model can act on. | `agent-loop.test.ts` "calls after an approve call wait for the owner's decision": `[publish_note (approve), save_note (auto)]`; expects `save_note`'s handler not called, its record refused with `TOOL_CALL_DEFERRED`, outcome `awaiting_approval` |
| 1.3 Run limits checked around every attempt | **A5**, A6, A7 | After a failed attempt that would otherwise wait for a retry, and again after a retry wait, the loop refreshes running time and calls `findReachedLimit`. A reached limit ends the run with that limit's code; the call's own problem stays on its LLM call record. A non-retryable problem (such as `LLM_REFUSED`) keeps its own code. This keeps the owner's answer that a retry delay not shorter than the remaining time fails with `LLM_RATE_LIMITED`: that case still has time left, so `decideRetry` refuses it as before. A call is never sent with a timeout of 0. | `agent-loop.test.ts`: (A5) "a call cut off by the run's remaining time fails the run with RUN_TIME_LIMIT"; (A6) "a retry wait that ends at the time limit sends no further call"; (A7) "a failed attempt whose usage reaches the cost budget is not retried", and the same for the token limit |
| 1.4 A finished answer is kept when the stream fails after it | **L6**, A10 | `callModel` returns the completed response when one arrived, whatever the stream does after it; a later error is not retried and its call is recorded once. The `EMITS_CONTENT` comment in `retry.rules.ts` is corrected. | `agent-loop.test.ts` "an error after the completed event keeps the answer and does not retry": a fake step that yields `completed` and then throws `LLM_UNAVAILABLE`; expects outcome `succeeded`, one LLM call record, no second request |
| 1.5 A blank answer fails the run | **A11**, I4 (core half) | D-7. A final answer whose text is empty or only whitespace, with no tool calls, ends the run `failed` with the new `RUN_EMPTY_ANSWER`; it is not retried. I4's adapter half is fix 4.4. | `agent-loop.test.ts` "a reply with no text and no tool call fails with RUN_EMPTY_ANSWER": reasoning only, and `""`, and `"  "` |
| 1.6 A resumed run keeps its per-run tool counts | **A1** | D-5. `AgentRunInput` gains `priorToolCallCounts` (tool name to calls accepted earlier in the run), beside `priorTotals`; the loop starts its counts from it. | `agent-loop.test.ts` "a resumed run keeps its per-run tool limit": `maxCallsPerRun: 2`, prior count 2; expects `TOOL_LIMIT_REACHED` on the first call after resume |
| 1.7 The per-day limit counts this step's accepted calls | **#1**, A2, A15 | D-1. The registry gains `resolveToolCalls(task, calls, callsThisRunByTool)`, which replaces the loop's one-at-a-time checks: it validates every call, reads today's count once per tool name that has a per-day limit (all reads at the same time), then applies the limits in the model's order, counting calls accepted earlier in the step. Earlier steps are already recorded, so `CountToolCallsToday` counts them as its contract says. `resolveToolCall` is removed, since nothing in production calls it any more, and its tests move to `resolveToolCalls` (owner, 2026-11-12). | `tool-registry.test.ts` "three calls in one step against maxCallsPerDay 1 accept only the first"; "today's count is read once per tool for a step" (asserts `requestedToolNames`); `agent-loop.test.ts` "the per-day limit holds within one step" |
| 1.8 A failed handler's error reaches the run store | **R2** | `ToolCallResultRecord`'s refused case gains an optional `cause`, for logs only. `performToolCall` keeps `execution.cause`. The tool result the model sees is built from `problem` and `message` only, as now (conventions §14). | `agent-loop.test.ts` "a failing handler's error is recorded and never shown to the model": a handler that throws `new Error("secret detail")`; expects the record's `cause` to be that error and the tool result's output to equal the `TOOL_EXECUTION_FAILED` message |
| 1.9 A maximum tool output size | **R3** | D-9. `executeToolCall` serialises the output and checks its length; an output over `MAX_TOOL_OUTPUT_CHARS` (16,000) becomes the new `TOOL_OUTPUT_TOO_LARGE`. The loop stops calling `JSON.stringify` itself. | `tool-registry.test.ts` "an output over the limit is refused with TOOL_OUTPUT_TOO_LARGE", at exactly 16,000 and 16,001 characters; `agent-loop.test.ts` "a too-large output goes back to the model as an error result" |

Docs in this slice: `features/agent.md` gets the codes `RUN_EMPTY_ANSWER`, `TOOL_CALL_DEFERRED` and `TOOL_OUTPUT_TOO_LARGE`; the "cancelled" outcome row (also seen when a model call returns); and the edge case "A step with both an `auto` and an `approve` call", which D-6 changes. Agent design §1 and §2 are updated to match. Conventions §12 links the new codes.

### 2. Tools and schemas

- Scope: core (`tools`, `shared`, `llm`) · integrations (`llm/anthropic/request-mapper.ts`) · tests · docs (KP-19, new pitfalls)
- Copy from: `tools/tool-definition.ts`, `tools/tool.types.ts`
- Gate: as in [Verification](#verification)

| Fix | Findings | Change | Test that fails before and passes after |
| --- | --- | --- | --- |
| 2.1 Strict all the way down, and never optional at the root | **#5**, R1 | `defineTool` walks the input JSON Schema: every object node (root, `properties`, `items`, `anyOf`) must have `additionalProperties: false`. A root schema that accepts `undefined` or `null` (checked with `safeParse`) is refused. | `tool-definition.test.ts` "a nested object that is not strict is refused" (`z.strictObject({ a: z.object({ b: z.string() }) })`); "a strict object made optional at the root is refused" |
| 2.2 Every subschema has a type | I2 (core half) | D-8. `defineTool` refuses an input schema with an untyped subschema (`z.unknown()`, `z.any()`, a bare `const`), so the tool fails at startup instead of on every model call. | `tool-definition.test.ts` "an untyped field is refused" for `z.unknown()` and `z.any()` |
| 2.3 The adapter owns its strict-schema transform | **I14**, I2, I3 | D-8. `request-mapper.ts` drops `@anthropic-ai/sdk/lib/transform-json-schema` for its own transform, which keeps `enum` and `const`, keeps what Anthropic's strict mode supports and moves the rest into the description, as now. The kept-keyword list comes from Anthropic's structured-outputs docs, read first (KP-19). The transform never changes its input. | `request-mapper.test.ts` "enum and const stay in the strict schema"; "a nested unsupported keyword moves to the description"; "the tool's schema object is not changed" (frozen input) |
| 2.4 The time-zone check stops after a failed length check | **#6** | `.max(MAX_TIME_ZONE_LENGTH, { abort: true })`, so the refine runs only on a string within the limit (probed on Zod 4.6.7, 2026-11-12). | `get-current-time.tools.test.ts` "a time zone over 64 characters reports only too_big" (one issue, and the resolver is not called) |
| 2.5 Honest name for the resolved zone | **#12** | JSDoc of `resolveTimeZone`: it returns the name `Intl` resolves to, which may be a legacy link such as `Asia/Calcutta`. No behaviour change. | `get-current-time.tools.test.ts` "a legacy link name is returned as Intl resolves it", which pins the behaviour the JSDoc now describes. It passes before the fix too: only the JSDoc was wrong |
| 2.6 The model is told how many issues were left out | **#13** | `describeIssues` adds "and N more" when issues were cut at `MAX_REPORTED_ISSUES`. | `tool-registry.test.ts` "eight issues report five and say three more" |
| 2.7 `__proto__` keys refused in config | **#7**, L18 | D-10. A shared helper `namedRecordSchema(namePattern, valueSchema)` checks the raw object's own keys against the name pattern before `z.record` parses it. Used for `policies` (tool names), `tasks` and `routes` (task names). | `tool.types.test.ts` "a __proto__ task key is refused" (JSON-parsed input); `model-registry.test.ts` "a __proto__ route key is refused" |

Docs in this slice: KP-19 is amended (the adapter's own transform replaces the SDK's), and the new pitfalls KP-21 to KP-23 are added ([Risks and pitfalls](#risks-and-pitfalls)).

### 3. Startup checks

- Scope: core (`llm`, `agent`) · tests · docs (`features/agent.md` `LLM_ROUTE_INVALID` row)
- Copy from: `llm/model-registry.ts`, `llm/model-routing.rules.ts`
- Gate: as in [Verification](#verification)

| Fix | Findings | Change | Test that fails before and passes after |
| --- | --- | --- | --- |
| 3.1 One startup check over routes, adapters and tools | **L1**, L3, L10 | D-4. `createAgentLoop` checks once, when it is created, that every routed provider has an adapter in `providers`, every routed model supports streaming, and every task with tools in the tool registry routes to a model that supports tools. A failure throws `LlmError` (`LLM_ROUTE_INVALID`) with its reason. | `agent-loop.test.ts` "creating the loop fails when a routed provider has no adapter"; "… when a routed model cannot stream"; "… when a task with tools routes to a model without tool support" |
| 3.2 A task with needs but no route stops startup | **L2** | `createModelRegistry` throws when a task listed in its task requirements has no route. | `model-registry.test.ts` "a task with requirements and no route is refused" |
| 3.3 Context size and maximum output checked | **L4**, L5 | D-3. Each catalog model gains `maxOutputTokens`. Each task's requirements gain `minContextTokens`. At startup a route is refused when its `maxOutputTokens` is over the model's maximum or not below its `maxContextTokens`, or when the model's context is smaller than the task needs. | `model-registry.test.ts` "a route asking more output than the model allows is refused"; "a model with a smaller context than the task needs is refused"; boundary at equal values |
| 3.4 Errors say what is wrong | **L11**, L12, L17 | `findRouteProblem` returns the missing need, and the model when found, so the duplicate "unknown model" branch goes. `LlmError.reason` becomes a closed union (`LlmErrorReason`), and the error gains an optional `need`. `resolveRoute` returns the task and the reason `no_route`. | `model-routing.rules.test.ts` "a missing capability names the need"; `model-registry.test.ts` "an unknown task resolves with reason no_route"; the union is checked by typecheck |

### 4. Adapter errors

- Scope: integrations (`llm/anthropic`) · tests · docs (KP-20)
- Copy from: `error-mapper.ts`, `response-mapper.ts`
- Gate: as in [Verification](#verification); before 4.4 and 4.5 change any mapping, Anthropic's error and Messages docs for the pinned SDK are read, and the wording used is cited in the code (KP-20)

| Fix | Findings | Change | Test that fails before and passes after |
| --- | --- | --- | --- |
| 4.1 Every SDK error is mapped | **I1** | `mapError` maps any `Anthropic.AnthropicError` that is not an `APIError` (a stream cut off mid-body, a malformed event, a stream without a final message) to `LLM_UNAVAILABLE`. | `error-mapper.test.ts` "a plain AnthropicError maps to LLM_UNAVAILABLE"; `anthropic.contract.test.ts` "a stream cut off mid-body fails with LLM_UNAVAILABLE" (MSW body that ends early) |
| 4.2 A failed call that used tokens keeps them | **I6** | The "unexpected content block" error carries `usage`. | `response-mapper.test.ts` "an unexpected content block keeps the call's usage" |
| 4.3 Text in a block's start event is streamed | **I8** | `mapStreamEvent` returns a `text_delta` for non-empty text in `content_block_start`. | `response-mapper.test.ts` "text in content_block_start becomes a delta"; the contract invariant `deltaTextOf(events) === textOf(response)` on a fixture with such a start event |
| 4.4 Never send an empty text block | I4 (adapter half) | `mapMessage` drops text parts that are empty or only whitespace, and leaves out an assistant message with no blocks left. Confirmed 2026-11-12 in the Messages API reference (platform.claude.com/docs/en/api/messages, `messages`): "Consecutive `user` or `assistant` turns in your request will be combined into a single turn." | `request-mapper.test.ts` "an empty text block is never sent"; "an assistant message with no content is left out" |
| 4.5 Both documented context errors map to LLM_CONTEXT_EXCEEDED | **I9** | Map a 413 `request_too_large` to `LLM_CONTEXT_EXCEEDED`, by status as well as type (the owner's remedy is the same: a smaller conversation). Wording checked first (KP-20), 2026-11-12: Anthropic documents "prompt is too long" (context-windows page) and the 413 (errors page), but not "input length and `max_tokens` exceed context limit". On Claude 4.5 models and newer, input plus `max_tokens` over the window is accepted and stops with `model_context_window_exceeded`, which the adapter already maps, so that wording is not matched. | `error-mapper.test.ts` "maps a 413 request_too_large to LLM_CONTEXT_EXCEEDED" and "maps a 413 by its status alone" |
| 4.6 `retry-after` read from any headers object | **I10** | Read headers through any object with a `get` function, not only the global `Headers`. | `error-mapper.test.ts` "retry-after is read from a headers object that is not the global Headers" |
| 4.7 Dead fallback and duplicate setting | **I15** | Narrow once on `STOP_REASON_PROBLEMS[stopReason]`; set `maxRetries` on the client only. | No new test: behaviour does not change. The contract case "the SDK's retries are off" keeps passing |

Docs in this slice: KP-20 lists both matched messages and the 413.

### 5. Shared and context

- Scope: core (`shared`, `llm`, `tools`, `agent`) · tests · docs (conventions §12.1 if the base class changes the error shape)
- Copy from: `shared/ids.ts`, `shared/errors.ts`
- Gate: as in [Verification](#verification)

| Fix | Findings | Change | Test that fails before and passes after |
| --- | --- | --- | --- |
| 5.1 Ids in order within a millisecond | **#3** | D-2. RFC 9562 §6.2 Method 2 ("monotonic random"): an id in the same millisecond as the last one, or with a clock that went back, reuses the last timestamp and increments the last id's 74 random bits by a random step; on overflow the timestamp moves forward 1 ms. The JSDoc says ids are in order within one generator, as PostgreSQL's are within one session. | `ids.test.ts` "ids made in the same millisecond sort in creation order"; "a clock that goes back does not break the order"; "overflow of the random bits moves the timestamp forward" |
| 5.2 The fixed clock takes only ISO 8601 with a zone | **#4** | `createFixedClock` checks the string against an ISO 8601 pattern that requires `Z` or an offset. | `fixed-clock.test.ts` "a timestamp without a zone is refused"; "a non-ISO date is refused" |
| 5.3 One error base with an optional cause | **#15**, L13 | `shared/errors.ts` gains `ProblemError`, which takes the problem, its message and an optional `cause` and adds `cause` only when it is defined (KP-07). The shared errors, `LlmError` and `ToolRefusedError` extend it. | `errors.test.ts` "a shared error keeps the cause it was given"; `llm.errors.test.ts` "an error without a cause has no cause property" (`"cause" in error` is false) |
| 5.4 The untrusted tag cannot be closed by a variant | **A9** | `wrapUntrustedContent` defuses the tag name in any spelling: any letter case, with spaces, `_` or `-` between the words, and inside HTML entities. | `context-builder.test.ts` one case each for `</ untrusted_content>`, `&lt;/untrusted_content&gt;` and `</UNTRUSTED-CONTENT>` |

### 6. Conventions and cleanup

- Scope: core (all 1a modules) · integrations · tests · config
- Copy from: conventions §7
- Gate: as in [Verification](#verification). For the refactors marked "no new test", every existing test passes unchanged; that is the proof

| Fix | Findings | Change | Test that fails before and passes after |
| --- | --- | --- | --- |
| 6.1 Local helpers are `const` arrows | **#16**, L14 | Every module-level helper that is not exported, in every 1a module and in integrations, becomes a `const` arrow (conventions §7). Functions inside a factory stay as they are. There is no lint rule: ESLint's `func-style` cannot tell the two apart. | No new test (refactor) |
| 6.2 Named constants | **#17** | The `DataView` offsets in `ids.ts` and the `"en-US"` locale in `get-current-time.tools.ts` become named constants. The `ids.ts` offsets were named in fix 5.1, which rewrote that file, so only the locale is left. | No new test (refactor) |
| 6.3 One prompt-token sum | **A13** | `countCallTokens` uses `countPromptTokens(usage) + usage.outputTokens`. | No new test: `agent.rules.test.ts` already pins the sum |
| 6.4 One recording loop for tool calls (partly reverted) | **A14** | Built as one loop after the calls ran, then partly reverted by the owner, 2026-11-12. A step that runs in order (any step that is not all reads, so `local_write` and `external` calls) records each call right after it runs, before the next one starts, as it did before: a crash part-way through a step then loses nothing that already happened. A14 was a cleanup and did not justify losing that. A step of reads, which change nothing, still runs in parallel and is recorded after all its calls finish. | `agent-loop.test.ts` "records each call of an in-order step before the next one runs": the second call's handler sees the first call already recorded. It fails on the one-loop version and passes now |
| 6.5 No duplicate tool maps | **#14** | The classified-by-task maps are built in one pass from `toolByName`, which the config rule also uses; the unreachable "lost a tool" throw goes. | No new test (refactor) |
| 6.6 Fixtures reuse the shape helpers | **I12** | `synthetic-fixture.ts` uses `sseEvent` and `buildMessage` from `testing/anthropic-shapes.ts`. | No new test: the contract suite passes unchanged |
| 6.7 Coverage counts production code only | **I17** | The integrations Vitest config excludes `src/testing/**`, `**/fixtures/**` and `**/*.record.ts` from coverage. | The coverage report no longer lists those files (checked with `pnpm --filter @khadim/integrations test:unit --coverage`) |
| 6.8 Retry inputs checked | **L7** | `decideRetry` ignores a `retryAfterMs` that is not finite or is negative, and throws on a `randomValue` outside [0, 1): an injected source that breaks its contract is a bug (conventions §7). | `retry.rules.test.ts` "a NaN retryAfterMs falls back to the backoff"; "a randomValue of 1 throws" |
| 6.9 An empty delta is not emitted content | **L9** | `isEmittedContent` is false for a `text_delta` with empty text. The Anthropic adapter already drops these; the rule now holds for every adapter. | `retry.rules.test.ts` "an empty text delta is not emitted content" |
| 6.10 The fake provider fails only when read | **L16** | The fake's `stream()` is an async generator: it takes its step and can throw only once it is iterated, like a real adapter. | `testing.test.ts` (llm) "creating a stream without reading it uses no step" |

## Carried to later plans

The rows for findings, the reservation and the 1c note are already in the carry-over tables of [phase-1-agent-core.md](phase-1-agent-core.md#slices-1b-to-1d), written with this plan. The two rows that depend on a decision (D-3, D-6) are added in the slice that implements it, once the decision is approved.

| Findings | Plan | Row |
| --- | --- | --- |
| L8, I5 | 1b | Extends "Cancelling a model call in flight": pass the run's signal (L8), and have the adapter report an abort from that signal as a cancel, not as `LLM_UNAVAILABLE`, so it is neither recorded as an outage nor retried (I5) |
| A4, #2 | 1b | New row "Run store and call-count failures": what happens when the run store, the pending-action request or `countCallsToday` fails mid-run (A4, #2), with the worker's job retry (ADR-0010). In 1a, fixes 4.1 and 2.3 already stop vendor errors reaching the loop |
| Per-day limit across concurrent runs | 1b | New row: a store-side reservation for `maxCallsPerDay`, so two runs at the same time cannot both pass the check (D-1 covers one run) |
| A12 | 1b | Already the row "Prompt files in the worker bundle"; the row now cites A12 |
| I11, I16 | 1b | Added to the row "Recording the Anthropic fixtures": the script imports its prompts and tool from `contract-requests.ts` (I11), and each recording case builds its own input instead of reading another case's result (I16) |
| Task context needs and model maximum output (D-3) | 1b | Added to the row "Model catalog and tool policy file": the real file sets each task's `minContextTokens` and each model's `maxOutputTokens` |
| Deferred calls on resume (D-6) | Phase 3 | Added to the row "Pending actions": resuming a run sends a tool result for every call of the paused step, including the `TOOL_CALL_DEFERRED` ones |
| Note from #10 (no change) | 1c | New row: every new adapter strips the `$schema` key that core's tool schemas carry, as the Anthropic adapter does |

## No change

| Finding | Reason |
| --- | --- |
| #8 | The input is mutable only in theory: nothing changes it between resolve and execute, and 1b's repository serialises it |
| #9 | Only if the adapter's own transform does not change its input. Fix 2.3 replaces the SDK's cloning transform, and its test "the tool's schema object is not changed" holds this |
| #10 | The Anthropic adapter already drops `$schema` (`request-mapper.ts`, `mapTool`); carried to 1c for new adapters |
| #11 | Three `Intl.DateTimeFormat` objects per call cost little next to a model call |
| I13 | The schema transform costs little next to a model call |
| L15 | A retry decision is not a success or a failure, so the `ok` result shape does not fit it |
| I7 | By design the timeout bounds the whole call, consumer time included (owner, 2026-11-12) |

## Decisions

| Id | Decision | Options | Recommendation | Owner answer |
| --- | --- | --- | --- | --- |
| D-1 | Per-day limit within a run (#1, A2, A15) | Count accepted calls in the step · reserve in the store | **Default:** in 1a, calls accepted earlier in the run and in the step count toward the per-day limit (fix 1.7); the reservation across runs is a 1b row | Approved as the Default (owner, 2026-11-12) |
| D-2 | Id order within a millisecond (#3) | Monotonic ids · correct the JSDoc only | **Default:** monotonic within a millisecond, by RFC 9562 §6.2 Method 2 (a question with a standard answer; fix 5.1) | Approved as the Default (owner, 2026-11-12) |
| D-3 | Context size and output limits (L4, L5) | Add both to the catalog · drop `maxContextTokens` | **Default:** a `minContextTokens` per task and a `maxOutputTokens` per model, both checked at startup; §15.2 requires the context check (fix 3.3) | Approved as the Default (owner, 2026-11-12) |
| D-4 | Separate inputs for providers and tools (L1, L3, L10) | One startup check over them · derive one from the other | **Default:** keep them separate; `createAgentLoop` runs one startup check over the routes, the providers map and the tool registry (fix 3.1) | Approved as the Default (owner, 2026-11-12) |
| D-5 | Per-run counts of a resumed run (A1) | In the run input · read from the run store | **Default:** `priorToolCallCounts` in the run input, beside `priorTotals`; 1b's worker fills both from the database (fix 1.6) | Approved as the Default (owner, 2026-11-12) |
| D-6 | Calls after an `approve` call in one step (A8) | Not executed · refused · run as now | **Default:** not executed. The model is told, through `TOOL_CALL_DEFERRED`, that they wait for the owner's decision and can be asked for again; calls before it run as now (fix 1.2). This changes the edge case `features/agent.md` records today ("every call is handled first") | Approved as the Default (owner, 2026-11-12) |
| D-7 | A blank answer (A11, I4) | Fail · retry | **Default:** the run fails with **`RUN_EMPTY_ANSWER`** (an agent problem: the loop decides it, not the provider), message "The model returned no answer.", not retried. The request mapper never sends an empty text block (fixes 1.5, 4.4) | Approved as the Default (owner, 2026-11-12) |
| D-8 | Who owns the strict-schema transform (I14) | The adapter · core emits strict-ready schemas | **Default:** the Anthropic adapter owns it and keeps `enum` and `const`; `defineTool` refuses an input schema with an untyped subschema, so such a tool fails at startup (fixes 2.2, 2.3) | Approved as the Default (owner, 2026-11-12) |
| D-9 | Maximum tool output (R3) | A default limit · per-tool limits | **Default:** **`MAX_TOOL_OUTPUT_CHARS` = 16,000** characters of serialised JSON (about 4,000 tokens) for every tool; a per-tool limit only when a tool needs one. A larger output is refused with **`TOOL_OUTPUT_TOO_LARGE`**, message "The tool ran, but its result is too large to return. Ask for less, for example a narrower range." The message says the tool ran, because a `local_write` tool's change has happened (fix 1.9) | Approved as the Default (owner, 2026-11-12) |
| D-10 | Config record keys (#7, L18) | Key patterns · a raw-key check before parsing | **Default, changed from the owner's draft:** keys use the same name patterns as tool and task names, **checked on the raw object before `z.record` parses it**. A key pattern alone does not work: Zod 4.6.7 drops a `__proto__` key before the key schema runs (probed 2026-11-12, KP-21). Task names get their own pattern, snake_case with one word or more (`chat`, `draft_post`), because the tool pattern requires `verb_noun` (fix 2.7) | Approved as the Default (owner, 2026-11-12) |

## Verification

After each slice: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (report the count before and after the slice), `pnpm depcruise`, `pnpm build`, `pnpm audit --prod`. No real model calls in any test. Slice 6 adds the integrations coverage check of fix 6.7.

## Risks and pitfalls

| Id | Pitfall | Mitigation |
| --- | --- | --- |
| P-1 | D-6 changes an edge case the owner approved on 2026-11-12 | The docs change lands in the same commit as the code (slice 1); the decision is the owner's before any code |
| P-2 | The adapter's own strict-schema transform drifts from what Anthropic accepts | The kept-keyword list is taken from Anthropic's docs and cited in the code; contract tests on Zod-generated schemas; KP-19 says to re-check on every SDK upgrade |
| P-3 | Fixes 4.4 and 4.5 depend on Anthropic's documented wording and behaviour | Read the docs before the change and cite them (KP-20); the hand-built fixtures still prove only our reading until the recording (1b row) |
| P-4 | Monotonic ids can run ahead of the clock under a burst | The timestamp moves at most 1 ms per overflow of 74 random bits, which a single process cannot reach |

Proposed new pitfalls for [pitfalls.md](../development/pitfalls.md), added in slice 2:

| Id | Pitfall | What to do |
| --- | --- | --- |
| KP-21 | Zod 4 `z.record` silently drops a `__proto__` key from JSON-parsed input, before the key schema runs, so neither the parse nor a key pattern reports it (Zod 4.6.7, probed 2026-11-12) | Check the raw object's own keys before `z.record` parses it (`namedRecordSchema`) |
| KP-22 | Zod 4 keeps running a schema's checks after one fails, so a `.refine` runs on a string that already failed `.max()` | `{ abort: true }` on the check that must stop the rest |
| KP-23 | Anthropic SDK's `transformJSONSchema` (1.3.0) moves `enum` and `const` into the description and throws a plain `Error` on a subschema without `type` | The adapter's own transform (D-8); `defineTool` refuses untyped subschemas |

KP-19 is amended in slice 2: the adapter uses its own transform, not the SDK's.
