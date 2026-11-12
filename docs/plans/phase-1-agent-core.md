# Plan: Phase 1, agent core (split into 1a to 1d)

**Phase 1 becomes four shippable slices. Each ends with something the owner can run and every check passing, so the agent is useful before the platform work is finished.**

| | |
| --- | --- |
| Status | Approved by the owner, 2026-11-10. Amended 2026-11-12 by the [foundation review](foundation-review.md) (slice 1a details, decision D-9, carry-over for 1b and 1d) and re-approved by the owner, 2026-11-12, with D-9 answered (retry in core, with the Retry-After, mid-stream, attempts, jitter and cancellation rules). **Slice 1a done 2026-11-12**; the 1b plan is next |
| Phase | 1 (1a, 1b, 1c, 1d) |

## Why split

The original Phase 1 bundled sign-in with TOTP, the run lifecycle, tool registry, loop, streaming UI, run inspection, cost tracking, two LLM adapters, routing, the outbox relay and idempotency. That is several weeks with nothing runnable until the end. ADR-0007 now allows development in `private` access mode, so sign-in can come last, as long as it lands before any public exposure.

## The split

| Slice | Outcome the owner can see | Main rules and requirements | Depends on |
| --- | --- | --- | --- |
| **1a. Loop in core** | `pnpm test` proves the loop: scripted model replies drive tools, budgets stop runs, policies hold. A contract suite proves the Anthropic adapter against hand-built fixtures that follow Anthropic's documented shapes; recording against the live API is deferred (D-6). No apps. | BR-21 (limits), BR-23 (recorded in memory), BR-25; ADR-0005, ADR-0009, ADR-0011, ADR-0012 | Tooling upgrades below |
| **1b. Chat end to end** | Chat with Khadim in the browser on localhost or Tailscale: streamed answers, conversations kept, refresh-safe. | FR-2, FR-3; BR-20, BR-23, BR-24; ADR-0010 (worker runs, Redis Streams, SSE relay), ADR-0007 (service token, `private` mode) | 1a |
| **1c. Inspect, cost, route** | Run detail page; daily and monthly cost per provider and model; budgets enforced with in-app notifications; OpenAI-compatible adapter (local Ollama) with per-task routes and `chat` fallbacks. | FR-4, FR-15, FR-17; BR-21, BR-22, BR-26, BR-27 | 1b |
| **1d. Ready for public** | Better Auth sign-in with TOTP, `public` mode, security headers and CSP, rate limits. | FR-1; BR-01; security.md application controls | 1b; required before any public exposure, at the latest before Phase 3 needs public callbacks |

PRD §5 lists this split.

## Prerequisite: tooling upgrades

One commit per row, each passing every check. Done before 1a starts.

| Item | From | To | Note |
| --- | --- | --- | --- |
| Node.js | 24 | Stays 24 | Maintained until April 2028. Node 26 (LTS since 2026-10-28) is a later, separate change; Node 25+ does not bundle Corepack, which changes pnpm setup. |
| `@types/node` | 24 | Latest 24.x | Matches the runtime |
| pnpm | 10.15.0 | 10.34.9 | Same major; pnpm 11 and 12 are evaluated separately |
| TypeScript | 5.9 | 6.0.3 | TypeScript 7 waits for typescript-eslint support (currently below 6.1); check TypeScript 6 deprecations against the base tsconfig |
| ESLint, `@eslint/js` | 9 | 10 | typescript-eslint and import-x support ESLint 10 |
| commitlint | 19 | 21 | |
| dependency-cruiser | 17 | 18 | |
| globals | 16 | 17 | |
| GitHub Actions | checkout v5, setup-node v5, pnpm/action-setup v4 | v7, v7, v6 | Still pinned to full commit SHAs |
| Vitest, MSW | — | 5.1.0, 3.0.4 | Added to the catalog with 1a. Both are inside the two-week release window; their exact-version exclusions are already in `pnpm-workspace.yaml` (remove after 2026-11-16 and 2026-11-20) |

## Slice 1a in detail

**Done 2026-11-12.** Increments 1 to 7 are built. The recording of the Anthropic fixtures is deferred and carried into 1b (D-6).

### Goal and scope

In scope: `packages/core` modules `llm`, `tools`, `agent` (loop, rules, prompts) and `shared` (errors, ids, clock); the Anthropic adapter and the shared adapter contract suite in `packages/integrations`; workspace setup for both packages.

Not in scope: database, Redis, apps, web UI, OpenAI-compatible adapter (1c), memory tools (Phase 2), tracing wrappers (1b, where the worker exists). The loop persists through an injected run store typed from the future repository (ADR-0012), with an in-memory fake in tests.

### Changes by layer

| Layer | Change |
| --- | --- |
| config | Use the existing presets; add `vitest`, `@vitest/coverage-v8` and `msw` to the catalog at the versions above. Each package: `test:unit` runs `vitest run --project unit --coverage` (so the 100% gate on `*.rules.ts` fires in every `pnpm test` and in CI), `test:integration` runs `vitest run --project integration`, and a `tsconfig.test.json` extends `@khadim/config/tsconfig/test.json`. Remove `passWithNoTests` from the Vitest preset once the first tests exist |
| core: `llm` | `llm.port.ts` (generate, stream, capabilities), `llm.types.ts` (messages, content parts, tool calls, usage, stop reasons including refusal, errors; `LLM_RATE_LIMITED` carries an optional `retryAfterMs`), `retry.rules.ts` (D-9: retry only `LLM_RATE_LIMITED` and `LLM_UNAVAILABLE`, only when the call has emitted no text or tool-call content, and only while attempts remain under the route's `maxAttempts`; delay is the backoff with jitter or `retryAfterMs`, whichever is longer, with the jitter's random value passed in; fail without waiting when that delay is equal to or longer than the run's remaining running time), `model-registry.ts` (catalog validated with Zod, including tiered prices, per-task effort and per-route `maxAttempts`, default 3), `model-routing.rules.ts` (task route only in 1a), `usage.rules.ts` (integer micro-USD, price tier chosen by prompt size), `testing/FakeLlmProvider` |
| core: `tools` | **The reference module for core code, built first** (conventions §10.3); `llm` and `agent` copy its shape. `tool.types.ts` (effect tier), `tool.errors.ts` (closed problem-code union, conventions §12.1), `tool-policy.rules.ts` (tier floor, limits), `tool-registry.ts` (Zod input → JSON Schema, validation errors returned to the model), `builtin/get-current-time.tools.ts`, `testing/` fake, `index.ts` |
| core: `agent` | `agent.rules.ts` (stop conditions, budgets, history trimming), `agent-loop.ts` (applies `retry.rules`; tracks whether the current call has emitted text or a tool call, so a failure after the first emission fails the step instead of retrying; waits through an injected sleep that a cancel interrupts at once, D-9), `context-builder.ts`, `prompts/system.v1.md`, `agent.errors.ts` |
| integrations | `llm/anthropic` adapter (official SDK with its retries off, `maxRetries: 0`; streaming; prompt caching on the marked prefix; error mapping to `LLM_RATE_LIMITED` with the provider's retry delay as `retryAfterMs`, `LLM_UNAVAILABLE` and `LLM_REFUSED`); `testing/contract` shared suite; hand-built fixtures, with the recording script ready for later (D-6) |
| boundaries | Core production code imports only `zod` and `drizzle-orm`. `core-allowed-packages-only` excludes test files (`\.(test|int\.test|spec)\.ts$`, matching `not-to-dev-dependencies`) and `vitest.config.ts`, so tests can import `vitest` and Testcontainers. The Anthropic SDK is imported only in `integrations/src/llm/anthropic` |
| tests | Unit tests per conventions §19.1; 100% coverage on `*.rules.ts`; loop scenarios with `FakeLlmProvider` (final answer, tool call, invalid tool input, iteration limit, cost limit, cancellation between steps, `approve` policy pausing the run, refusal ending the run; a stream that fails before emitting anything is retried; a stream that fails after only metadata (start, ping, usage) is retried; a stream that fails after emitting text, and one that fails after emitting a tool call, each fail the step without a retry; a cancel during a retry wait ends the run as cancelled without finishing the wait); price-tier boundary cases in `usage.rules`; `retry.rules` cases (`retryAfterMs` longer than the backoff is waited in full; `retryAfterMs` equal to or longer than the remaining running time fails the run without waiting; non-retryable errors are not retried; no retry once `maxAttempts` is reached; a fixed random value gives the exact jittered delay); contract suite against the Anthropic fixtures, including `retryAfterMs` mapped from a rate-limit response and the SDK's retries being off |
| docs | `docs/product/features/agent.md`, which also defines the agent, tool and LLM problem codes (conventions §12.1); agent design §7 updated for D-9: retries in core instead of at the adapter (diagram and text), the Retry-After rule, the mid-stream rule (what counts as emitted), `maxAttempts` and cancellation during a wait; ADR-0008 untouched (embeddings are Phase 2) |

### Increments

Drafted 2026-11-12; the owner answered the open questions marked below on 2026-11-12 and started increments 1 and 2. One commit per increment when the owner asks for it, except that increments 1 and 2 are one commit: a package with no source cannot pass the checks, and every commit builds and passes (conventions §3). Work stops after each gate for review; increments 1 and 2 share one gate, at the end of 2.

**Gate, the same for every increment:** `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (test count reported), `pnpm depcruise`, `pnpm build` and `pnpm audit --prod` all pass, with no check silenced or weakened and no real model call. The lockfile diff is read after every install (KP-04).

Package APIs were checked against the published packages before this section was written: `@anthropic-ai/sdk` 1.3.0, `zod` 4.6.7, `vitest` 5.1.0 and `msw` 3.0.4. Neither the SDK nor Zod is installed in the repository yet.

#### 1. Workspace setup

- Scope: config · core.
  - Catalog: add `@vitest/coverage-v8` 5.1.0, `msw` 3.0.4 and `vite` (`vitest` 5.1.0 is already there).
  - `packages/core`: `package.json` (`@khadim/*` name, `exports` subpaths per conventions §5.4, scripts `lint`, `typecheck`, `test:unit`), `tsconfig.json` (node preset, test files excluded), `tsconfig.test.json` (test preset), `eslint.config.mjs`, `vitest.config.ts` (merges `vitestBaseConfig`).
  - `.dependency-cruiser.cjs`: `core-allowed-packages-only` excludes test files and `vitest.config.ts` (changes by layer, boundaries row).
  - The core README loses its "not built yet" line.
- Copy from: `packages/config/README.md` (tsconfig and ESLint examples), `packages/config/eslint.config.mjs`, `packages/config/package.json` (catalog and devDependency style).
- Tests: none of its own. Proof is the gate, plus `eslint --print-config` on one source and one test path (KP-01) and a lockfile diff that shows only the added packages (KP-03, KP-04).
- Gate: shared with increment 2 (owner, 2026-11-12).

> **Open question:** A package with no source cannot pass the gate: `tsc` fails on an empty `include`, and Vitest fails with no test files once `passWithNoTests` is removed. Core gets its first files in increment 2, integrations only in increment 6. Recommendation: review increments 1 and 2 together (one gate at the end of 2), and create the `packages/integrations` workspace files in increment 6.

> **Owner answer (2026-11-12):** Agreed. Increments 1 and 2 are reviewed together, with one gate at the end of 2, and land as one commit, because every commit builds and passes (conventions §3); the owner corrected an earlier "two commits" the same day. The `packages/integrations` workspace files are created in increment 6.

> **Open question:** Vitest 5 has `vite` as a required peer dependency (`^6.4.0 || ^7.0.0 || ^8.0.0`); the plan names only `vitest`, `@vitest/coverage-v8` and `msw`. Add `vite` to the catalog as an explicit devDependency (recommended, so its version is chosen here and commented), or let pnpm resolve the peer? Either way its version must clear `minimumReleaseAge`.

> **Owner answer (2026-11-12):** Add `vite` to the catalog as an explicit devDependency, with a comment saying why: the newest version that Vitest 5.1.0 accepts and that clears `minimumReleaseAge`. If the install needs new release-age exclusions (KP-03), they are exact `name@version` lines with removal dates, and the lockfile diff is shown to the owner.

> **Default:** `vite` 8.3.7. The newest release outside the window was 8.3.5, but GHSA-p4f5-76q4-ffq7 (critical, published 2026-11-10) affects 8.3.0 to 8.3.6 and is fixed in 8.3.7. The owner asked for the patched release (2026-11-12); `vite` 8.3.7 and the Rolldown 1.2.18 it requires carry security-patch exclusions that are removed after 2026-11-23 (conventions §6).

> **Open question:** The changes-by-layer table gives every package a `test:integration` script, and removes `passWithNoTests` once tests exist. 1a has no integration tests, so that script would fail with "no test files". Conventions §6 says a script is added in the phase that introduces what it runs. Recommendation: no `test:integration` script in 1a; 1b adds it with the first integration test.

> **Owner answer (2026-11-12):** Agreed. No `test:integration` script in 1a; 1b adds it with the first integration test.

#### 2. `core/src/shared`

- Scope: core · tests.
  - `errors.ts` (shared errors of conventions §12: `NotFoundError`, `ForbiddenError`, `ValidationError`, `VersionConflictError`, `ConflictError`, each with a problem code and no HTTP status).
  - `ids.ts` (`IdGenerator` type and a generator with injected clock and randomness).
  - `clock.ts` (`Clock` type, system clock).
  - `testing/` (fixed clock, sequential id generator), `index.ts`.
  - Remove `passWithNoTests` from the Vitest preset.
- Copy from: nothing; first code in the repository. Written to conventions §7, §8, §9 and §12.1.
- Tests: each shared error carries its `name` and code; the fixed clock and sequential ids are deterministic; generated ids are unique and well-formed at the boundaries the format defines.
- Gate: as above.

> **Open question:** Which id format does `ids.ts` produce? Recommendation: UUIDv7 per RFC 9562, the same format conventions §13 gives database keys, so ids made by the in-memory run store in 1a look like the ones PostgreSQL makes in 1b. Node 24 has no built-in UUIDv7, so it is a few lines over `node:crypto`.

> **Owner answer (2026-11-12):** UUIDv7 per RFC 9562.

> **Default:** The shared errors carry the codes `NOT_FOUND`, `FORBIDDEN`, `VALIDATION_FAILED`, `VERSION_CONFLICT` and `CONFLICT`. No doc names them yet; the shared problem-code catalogue is a 1b item and may rename them, and no 1a module throws them.

#### 3. `core/src/tools`, the reference module

- Scope: core · tests · config (add `zod` 4.6.7 to the catalog; it is on the core allowlist).
  - `tool.types.ts` (`ToolDefinition`, effect tiers and policies as `as const` tuples), `tool.errors.ts` (`ToolProblem` union with a message map, `ToolRefusedError`), `tool-policy.rules.ts` (allowed policies per tier, tier floor, policy resolution, limits; returns problems, never throws), `tool-registry.ts` (`createToolRegistry`: registration, `Object.hasOwn` lookup, Zod 4 `toJSONSchema` export from strict objects, input validation, execution that returns error results), `builtin/get-current-time.tools.ts`, `testing/` (fake tools for each tier and policy), `index.ts`.
  - `.dependency-cruiser.cjs`: `core-module-boundaries` also allows a test file to import another module's `testing/index.ts`.
- Copy from: nothing; this becomes the reference (conventions §10.3). Error shape from the example in conventions §12.1.
- Tests (conventions §19.1): `tool-policy.rules` at 100% coverage with every tier and policy pair, allowed and refused, and limits at 0, the limit and the limit + 1; schema tests with `safeParse` asserting issue code and path (`unrecognized_keys`, `too_big`); JSON Schema output has `additionalProperties: false` (D-3); the registry rejects a tool without a tier and policy (ADR-0014), returns `TOOL_INPUT_INVALID` without calling the handler, returns `TOOL_NOT_FOUND` for `constructor` and `__proto__` (KP-08), and never executes an `approve` tool; `get_current_time` with a fixed clock.
- Gate: as above, plus the per-file 100% threshold on `tool-policy.rules.ts` shown failing the run once, with a temporary untested branch that is then removed.

> **Open question:** Conventions §5.2 and agent design §4 place `tool-source.port.ts` in this module; the changes-by-layer table does not list it, and its second implementer (MCP) is Phase 6. Recommendation: follow the plan and leave the port out of 1a (conventions §1, right-sized); the registry takes built-in definitions directly.

> **Owner answer (2026-11-12):** Approved: no `tool-source.port.ts` in 1a. The second dependency-cruiser change in this increment's scope is approved too.

> **Owner answer (2026-11-12):** Increment 3 is approved, and these choices, made while writing it, are confirmed:
> - One file more than the list above: `tool-definition.ts` holds `defineTool`, which ties a handler's input type to its Zod schema and makes the handler reachable only after validation.
> - The registry splits a call in two: `resolveToolCall` (offered to the task, valid input, within limits) and `executeToolCall`. An `approve` call resolves but can never execute; the loop turns it into a pending action (increment 5).
> - Configuration shape: `policies` by tool name (policy, `maxCallsPerRun`, `maxCallsPerDay`) and `tasks` listing tool names. A limit is a whole number of at least 1.
> - A task that lists a tool no source provides stops startup with `TOOL_UNCLASSIFIED`, like a tool without a policy: it has no tier.
> - Arguments bound by the run (conventions §15.4) are not built: their first user is `reply_to_comment` in Phase 5.
> - The boundary change is two rules: `core-module-boundaries` allows another module's `testing/index.ts`, and a new `testing-only-in-tests` rule keeps every `testing/` folder out of production code.
> - JSON Schema is exported in Zod's `input` mode. In the default output mode a non-strict `z.object` also reports `additionalProperties: false`, which would have hidden a schema that lets unknown keys through.

#### 4. `core/src/llm`

- Scope: core · tests.
  - `llm.port.ts` (`LlmProvider`: `generate`, `stream`, `capabilities`), `llm.types.ts` (messages, content parts, tool calls, usage, stop reasons including refusal, stream events), `llm.errors.ts` (`LlmProblem` union, `LlmError` with optional `retryAfterMs` and `cause`).
  - `retry.rules.ts`, all five D-9 rules: retry only `LLM_RATE_LIMITED` and `LLM_UNAVAILABLE`; only when nothing was emitted; only under the route's `maxAttempts`; delay is the longer of backoff-with-jitter and `retryAfterMs`, with the random value passed in; refuse when the delay is equal to or longer than the remaining running time. Cancellation (rule 5) is the loop's part, in increment 5.
  - `model-registry.ts` (catalog and routes validated with Zod: tiered prices, per-task effort, `maxAttempts` default 3), `model-routing.rules.ts` (task route only; capability check), `usage.rules.ts` (integer micro-USD, tier by prompt size), `testing/` (`FakeLlmProvider` with scripted replies, scripted failures and partial streams), `index.ts`.
- Copy from: `tools/tool.errors.ts`, `tools/tool-policy.rules.ts` and its test, `tools/tool-registry.ts` (factory shape), `tools/testing/`, `tools/index.ts`.
- Tests: `retry.rules` at 100% (each D-9 case in the tests row of changes by layer, plus attempts at 1, `maxAttempts` − 1 and `maxAttempts`, and a remaining budget equal to the delay); `usage.rules` at 100% on both sides of the 100K boundary and with zero tokens; `model-routing.rules` at 100% (route found, unknown task, missing capability); catalog schema with `safeParse` (unknown key, missing price tier, `maxAttempts` 0); `FakeLlmProvider` replays its script exactly.
- Gate: as above.

> **Open question:** The changes-by-layer table puts LLM errors in `llm.types.ts`; conventions §12.1 puts a module's errors in `<module>.errors.ts`, and dependency-cruiser lets adapters import `.errors.ts`. Recommendation: `llm.errors.ts`.

> **Owner answer (2026-11-12):** Approved: `llm.errors.ts`.

> **Open question:** Reasoning blocks. Every model in D-1 thinks by default, returns reasoning blocks that must be sent back unchanged with tool results, and binds each block to the conversation before it. A request that replays a block after earlier turns were edited or summarised is rejected with a 400 on accounts created on or after 2026-08-31 (Anthropic's documented behaviour). Proposed decision by that standard (conventions §2.1): `llm.types` has an opaque reasoning content part that only the adapter reads; within a run the system prompt, the tool list and earlier messages never change; and the history-trimming rule removes reasoning parts from the turns it keeps whenever it drops or summarises older ones, never in the middle of a tool round. This narrows conventions §15.3 ("keep the recent turns verbatim") and needs the owner's agreement.

> **Owner answer (2026-11-12):** The opaque reasoning content part in `llm.types`, read only by the adapter, is accepted. In 1a the history inside a run is append-only: no trimming and no summarising of turns, so reasoning blocks are always replayed exactly as received. Conventions §15.3 is not narrowed now. If a run's context would exceed the model's limit, the run fails; the feature doc proposes the code as an open question. History trimming and summarising, and how they interact with reasoning blocks, are decided in the 1b plan, when conversations exist. Before the adapter is written, Anthropic's current docs on preserved thinking and the history-editing check are read, and a contract test proves that a replayed reasoning part is sent back unchanged (increment 6).

> **Open question:** D-4 puts the catalog in a config file read by the worker, which arrives in 1b. Recommendation: 1a ships the schema and validation only, with a sample catalog holding D-1's values in `llm/testing`; the real file, confirmed against Anthropic's docs, lands with the worker.

> **Owner answer (2026-11-12):** Approved: schema and validation only in 1a, with D-1's values as a test sample.

> **Owner answer (2026-11-12):** Increment 4 is approved, and these choices, made while writing it, are confirmed:
> - Messages have three roles: `user`, `assistant` and `tool`. Tool results are their own message, so the shape mirrors neither Anthropic's nor the Chat Completions format (P-2); each adapter maps it.
> - Stop reasons are `end_turn`, `tool_calls`, `max_output`, `refusal` and `context_exceeded`. A completed response carries only the first two. For the other three the adapter throws the `LlmError` that one map in core (`STOP_REASON_PROBLEMS`) names, so D-8 holds and every adapter agrees.
> - An `LlmError` can carry the tokens the failed call used, so a refused or cut-off call still has its cost recorded (BR-23).
> - Stream events are `started`, `reasoning`, `text_delta`, `tool_call_started` and `completed`. Only `text_delta` and `tool_call_started` count as emitted (D-9 rule 2).
> - Backoff: 1 second before the second attempt, doubling, capped at 30 seconds, with equal jitter (half fixed, half random). The time-budget check applies to the final delay, whether it came from the backoff or from `retryAfterMs`. A call is retried only when that delay is strictly shorter than the remaining running time: a delay equal to it is refused, because the retry would meet `RUN_TIME_LIMIT` the moment the wait ended (owner's review fix, 2026-11-12).
> - Catalog shape: `models` (provider, id, capabilities, price tiers) and `routes` by task (provider, model, optional effort, `maxAttempts`, `maxOutputTokens`, `timeoutMs`). Effort levels are `low`, `medium` and `high`.
> - A tier applies up to and including its `maxPromptTokens`; prompt size is fresh input plus cache writes and cache reads; the whole call is billed at the tier its prompt selects.
> - What each task needs from its model is passed to the registry by the composition root, not written in the catalog. Needs are capability flags only; a context-size need is not built.
> - A malformed catalog and a model listed twice also stop startup with `LLM_ROUTE_INVALID`.
> - The timeout cap by the run's remaining running time is applied by the loop, in increment 5.

#### 5. `core/src/agent`

- Scope: core · tests.
  - `agent.types.ts` (run, step, outcome, run store), `agent.errors.ts` (`AgentProblem` union), `agent.rules.ts` (stop conditions, budget checks on running time only; no history trimming in 1a, owner 2026-11-12), `context-builder.ts` (stable prefix first, marked for caching; untrusted content wrapped and labelled; the history of a run is append-only), `agent-loop.ts` (`runAgent`: applies `retry.rules`, tracks emission, waits through an injected sleep that a cancel interrupts, runs read-only steps in parallel and others in order, records every step, call and tool call), `prompts/system.v1.md` (role, tools' purpose, external content is data, output format; conventions §15.5), `testing/` (in-memory run store), `index.ts`.
- Copy from: the `tools` module for errors, rules, factory, testing and index; `llm/testing` for scripted providers.
- Tests: `agent.rules` at 100% (each limit at 0, the limit and the limit + 1; running time that excludes paused time); the messages sent on each model call start with exactly the messages of the previous call, reasoning parts included; every loop scenario in the tests row of changes by layer, asserting what the run store received and what it did not (no write after a refusal before a step; no tool execution for `approve`); the prompt file states the untrusted-content rule.
- Gate: as above.

> **Open question:** ADR-0012 types the injected store as `ReturnType<typeof createAgentRunRepository>`, but that repository needs the database and arrives in 1b. Recommendation: 1a declares the store's type in `agent.types.ts`, sized to what the loop calls; 1b's repository must satisfy it, and the type then moves to the repository as ADR-0012 says. This is a temporary stand-in for the repository type, not a persistence port.

> **Owner answer (2026-11-12):** Approved: the stand-in type lives in `agent.types.ts`, is temporary, and moves to the repository in 1b.

> **Owner answer (2026-11-12):** Increment 5 is approved, and these choices, made while writing it, are confirmed. `prompts/system.v1.md` is approved as written; wording changes come later as a new version, after evals.
> - A limit reached by a call that asks for tools stops the run before those tools execute, for every limit, not only iterations: the results could never be sent to the model, and an `approve` tool would create a pending action on a failed run. A final answer is never discarded.
> - Limits are reached when a total equals them. Tokens count fresh and cached input and output. Tokens and cost of failed attempts count too (BR-23).
> - Cancel arrives as an `AbortSignal`. It is honoured before each model call and during a retry wait; a model call already in flight is not aborted (conventions §15.3).
> - A stream that ends without a completed response is treated as `LLM_UNAVAILABLE`. An error from an adapter that is not an `LlmError` is a bug and is not caught.
> - A step runs in parallel only when every call that will execute is a `read`; otherwise the whole step runs in order. Either way, calls are recorded and answered in the order the model asked.
> - A tool's output goes to the model as JSON text; a refusal goes as its message, flagged as an error.
> - When a step pauses for approval, the results of its other calls are recorded but not yet sent; resuming from them is 1b's (ADR-0010).
> - The run store stand-in has four writes: model call, step, tool call, outcome. A run can start from earlier totals, which is what resume needs.
> - Text deltas are read to track emission but go nowhere yet: the event stream to the browser is 1b's.
> - Two files beyond the list above: `cancellable-sleep.ts`, the real sleep behind the injected one, and `prompts/prompt-loader.ts`, which reads a versioned prompt file once at startup.
> - `agent.errors.ts` holds the problem union and messages only: the loop returns outcomes and never throws them; 1b's run service adds the error class when something throws it.
> - The Vitest preset's coverage now includes only `.ts` and `.tsx` under `src/`, so the prompt Markdown is not parsed as code.

#### 6. `integrations/src/llm/anthropic` and the contract suite

- Scope: integrations · tests · config (add `@anthropic-ai/sdk` to the catalog, pinned exactly at 1.3.0; `msw` is already there).
  - Before any adapter code: read Anthropic's current docs on preserved thinking and the history-editing check (owner, 2026-11-12).
  - `packages/integrations` workspace files, moved here from increment 1: `package.json`, `tsconfig.json`, `tsconfig.test.json`, `eslint.config.mjs`, `vitest.config.ts`; its README loses its "not built yet" line.
  - `llm/anthropic/anthropic.adapter.ts` (`createAnthropicProvider`: client with `maxRetries: 0`, per-call timeout and maximum output, streaming, effort from the route, cache markers on the marked prefix, `tool_choice` always `auto`, strict tools), mapping files for requests, responses and stream events, and for errors (429 → `LLM_RATE_LIMITED` with `retryAfterMs` from `retry-after-ms` or `retry-after`; 5xx, 529, connection and timeout errors → `LLM_UNAVAILABLE`; refusal stop reason → `LLM_REFUSED`; other 4xx → `LLM_REQUEST_REJECTED`; the vendor error only in `cause`).
  - `testing/contract/` (the shared suite: one function that takes a provider factory and fixtures, so 1c's adapter runs the same cases), `llm/anthropic/fixtures/` for recordings (empty until the deferred recording, D-6) and `llm/anthropic/fixtures/synthetic/` for hand-built fixtures: the eight success cases, the errors and the refusal, each typed against the SDK's own `Message` and raw stream event types.
  - A recording script the owner runs by hand with a low-limit test key (D-6). It stores response status, the headers the adapter reads, and bodies; never the key or account headers. It is complete but has not been run: recording is deferred (D-6).
- Copy from: the `tools` module for error and test style; `llm.types.ts` and `llm.errors.ts` are the contract. Adapter layout per conventions §10.1.
- Tests: the contract suite over the fixtures with MSW (`msw/node`, `msw/http`): request mapping for text, tools and tool results; a reasoning part received from the provider is sent back unchanged, byte for byte, on the next request; response and stream-event mapping; usage including cache write and read tokens; every mapped error code; `retryAfterMs`; one request per call on a 429 and on a 529 (SDK retries off); the request never contains `temperature`, `top_p`, `top_k`, forced `tool_choice`, assistant prefill or the other fields of P-5.
- Gate: as above. The review of recorded fixtures for personal data and keys (P-3) moves to the deferred recording.

Order inside the increment: adapter, mapping tests on hand-built shapes and the recording script first; then `msw`, the hand-built fixtures and the contract suite on them. The stop for the owner to record is deferred (D-6).

> **Owner answer (2026-11-12):** Recording is deferred: there is no API key or credits yet. The contract suite runs on hand-built fixtures in `fixtures/synthetic/`, the eight success cases as well as the errors and the refusal, each taken from Anthropic's documentation for the pinned SDK 1.3.0 and type-checked against the SDK's own types. The suite is built so recordings can replace the hand-built fixtures without changing it. The recording script stays as it is: complete, only not yet run. Recording is a carry-over item, due before Khadim's first real model call.

Synthetic prompts, used by the hand-built fixtures now and by the recording later, all on `claude-haiku-5-5` at effort `low`, with the `get_current_time` tool where named:

| Fixture | Call | Prompt |
| --- | --- | --- |
| `text-generate` | generate | "Reply with exactly the word: pong" |
| `text-stream` | stream | "Count from one to five in words, separated by commas." |
| `tool-call-stream` | stream, with the tool | "What time is it right now in UTC? Use the tool." |
| `tool-result-stream` | stream; the previous turn replayed with a fixed tool result (`2026-01-01T00:00:00Z`) | (continuation of the previous fixture) |
| `parallel-tools-stream` | stream, with the tool | "Give me the current time in UTC and in Asia/Dhaka. Call the tool once for each zone." |
| `cache-write`, `cache-read` | generate, twice, with a synthetic system prompt long enough to cache | "Reply with exactly the word: cached" |
| `max-output-stream` | stream, small maximum output | "Write three paragraphs about rivers." |

> **Open question:** `@anthropic-ai/sdk` latest is 1.8.0 (2026-11-10). `minimumReleaseAge` allows 1.3.0 (2026-10-23) today; 1.4.0 clears on 2026-11-16. Recommendation: pin 1.3.0 exactly (P-1, conventions §15.11) with no exclusion; it already sends API version `2026-10-21` and has no sampling parameters in its types. The SDK brings `@opentelemetry/api`, `standardwebhooks` and `json-schema-to-ts` into the production audit of integrations.

> **Owner answer (2026-11-12):** Approved: `@anthropic-ai/sdk` pinned exactly at 1.3.0.

> **Open question:** Error responses (429 with a retry delay, 529, 500, 400, 401) and a refusal cannot be recorded on demand, and a refusal should not be provoked. Recommendation: build those fixtures by hand from Anthropic's documented shapes, in a `synthetic/` folder so they are never mistaken for recordings. D-6 speaks only of recorded fixtures.

> **Owner answer (2026-11-12):** Approved: hand-built error and refusal fixtures in a `synthetic/` folder, clearly separated from recordings.

> **Owner answer (2026-11-12):** The first half is approved so far, reasoning signatures are committed with the fixtures (the prompts are synthetic and a signature is not a credential), and `.claude/settings.json` denies reads of `.env.recording`. The strict-tool limits and the message match behind `LLM_CONTEXT_EXCEEDED` are pitfalls KP-19 and KP-20.
>
> **Default:** First half built (adapter, mapping tests, recording script; 2026-11-12), with these choices for the owner to confirm. The contract suite, `msw` and the hand-built fixtures follow in the second half; the recording is deferred (owner answer above).
> - Anthropic's docs on preserved thinking and the history-editing check were read first. What they require is what the adapter does: every reasoning block goes back as the very object received, in its place, empty text included; the system prompt, tools and earlier messages of a run never change; moving a cache marker is safe.
> - **Strict tools and D-3.** Strict schemas reject `maxLength`, `minimum`, `maximum` and similar keywords with a 400, and Zod emits them. The adapter runs the SDK's own `transformJSONSchema`, which moves such keywords into the field's description, and drops `$schema`. Core's tool registry still enforces them with Zod. Strict mode also allows at most 20 strict tools and 24 optional parameters per request; nothing checks that yet.
> - Errors are mapped by the API's error type, then by HTTP status, because the API returns types the SDK's list lacks (`request_too_large`, `conflict_error`) and a mid-stream error has no status. An oversized prompt is a plain 400 with no code, so `LLM_CONTEXT_EXCEEDED` is recognised by its documented message, "prompt is too long"; no recording proves that wording.
> - The whole call is bounded by `timeoutMs` through an abort signal, because the SDK's own timeout only covers connecting. A timed-out, aborted or dropped call is `LLM_UNAVAILABLE`.
> - `retry-after` is read in seconds and `retry-after-ms` in milliseconds; the HTTP-date form is not read.
> - Reasoning parts from another provider are left out of a request, since Anthropic cannot read them.
> - The adapter declares no image or structured-output support, because it maps neither yet, and leaves tool-input streaming at the API's buffered default.
> - The SDK's logging is off, so it can never log a request or a response.
> - The recorder is a Vitest project named `record`, outside every test script. It runs the real adapter with a `fetch` that keeps the request body and the response's status, body and three headers. It reads the key from `packages/integrations/.env.recording`, which git ignores, and refuses to write a fixture that contains the key.
> - Boundaries: `not-to-dev-dependencies` now also exempts `testing/` folders, which `testing-only-in-tests` keeps out of production code. Core exports `llm.port`, `llm.types` and `llm.errors` for adapters (conventions §5.4). Fixture folders are in `.prettierignore`, so recordings stay byte for byte.
>
> **Default:** Second half built on hand-built fixtures (2026-11-12), with these choices for the owner to confirm.
> - The suite takes fixtures in the exact shape the recording script writes (`name`, `model`, `request.body`, `response.status`, `headers`, `body`). Each case pairs a fixture with a provider-neutral request and what the adapter must make of it. Every case checks that the adapter sends exactly the fixture's request body, once.
> - Hand-built fixtures are TypeScript, not JSON: request bodies are typed as the SDK's `MessageCreateParams`, responses as `Message`, stream events as `RawMessageStreamEvent` and errors as `ErrorResponse`, then serialised into the recorded shape. The SDK has no type for the `ping` and mid-stream `error` events, so those two are typed by hand from the docs.
> - The request bodies are written out by hand from the docs, not produced by the adapter, so the suite compares the adapter with an independent statement of the request.
> - Replacing fixtures with recordings changes the adapter's contract test (which fixtures it imports and the exact text and token counts expected), never the suite. Exact values are optional in a case; the stop reason, valid token counts and stream order are always checked.
> - The reasoning case needs at least one reasoning block in the tool-call fixture. If the recorded tool call has none, the hand-built fixture stays for that case.
> - The contract requests repeat the recording script's prompts in `testing/contract/contract-requests.ts`, because the script stays untouched and cannot be imported (it reads the key file when loaded). Recommendation for the recording carry-over: make the script import them, so the two cannot drift.
> - Beyond the eight success cases: 429 with a retry delay (generate and stream), 529 (generate and stream), 500, 400, 401, the oversized-prompt 400 (KP-20), a refusal (generate and stream), and a stream that fails before and after text.
> - MSW 3.0.4 names its option `onUnhandledFrame`; with `error`, a request to any URL but the adapter's endpoint fails the test, so no case can reach a real provider.
> - Boundaries: `testing-only-in-tests` now also covers `fixtures/` folders and the package-level `src/testing/` folder, so production code can import neither. `.prettierignore` skips only JSON fixtures; the TypeScript ones are formatted.

#### 7. Docs and verification

- Scope: docs.
  - Agent design §7: retries move from the adapter to core in the diagram and text; the Retry-After rule, the mid-stream rule and what counts as emitted, `maxAttempts`, cancellation during a wait (D-9). §2's error bullet points to it.
  - Conventions §5.2: the files 1a added that the layout does not show (`shared/ids.ts`, `shared/clock.ts`, `llm/retry.rules.ts`, `llm/llm.errors.ts`, `tools/tool.errors.ts`). §12: the new problem codes link to `features/agent.md`.
  - `features/agent.md`: open questions replaced by the owner's answers; status line updated.
  - Package READMEs and `docs/plans/README.md` status. This plan's 1a section is marked done with its date; ADR-0008 stays untouched.
- Copy from: the existing sections' style; ADR amendment rule in conventions §4.2 if any accepted ADR needs a clarification.
- Tests: the full verification below on a clean install (`pnpm install --frozen-lockfile`), with the final test count.
- Gate: as above, and every link added resolves.

### Decisions

| Id | Decision | Owner answer |
| --- | --- | --- |
| D-1 | Default model and effort per task | `chat` → Claude Haiku 5.5 (`claude-haiku-5-5`), effort `low`. `draft_post`, `draft_reply` → Claude Sonnet 5.5 (`claude-sonnet-5-5`), effort `medium`. `eval_grader` → Claude Opus 5.5 (`claude-opus-5-5`), effort `high`. Effort is set explicitly per task because the defaults differ by model (`medium` on Haiku 5.5 and Opus 5.5, `high` on Sonnet 5.5). Prices in the catalog are tiered where the provider tiers them: Haiku 5.5 is USD 0.10 / 0.50 per million input / output tokens up to 100K prompt tokens and USD 0.50 / 2.50 above; Sonnet 5.5 is 2 / 10; Opus 5.5 is 4 / 20; cache prices included. Ids, limits and prices are confirmed against Anthropic's docs when the catalog is written. Effort levels are defaults, retuned after the first evals. |
| D-2 | HTTP fixture tool for adapter tests | MSW: it intercepts `fetch`, which the official SDK uses |
| D-3 | Zod → JSON Schema for tool inputs | Zod 4 built-in `toJSONSchema` with strict objects (`additionalProperties: false`), so tools can be sent with `strict: true`. No extra package |
| D-4 | Where the model catalog and tool policies live | One validated config file, read by the worker's composition root (the only process that runs agents, ADR-0010) |
| D-5 | Budget defaults | Keep BR-21: 10 iterations, 2 minutes running time, USD 0.50 per run, computed with the tiered prices from D-1 |
| D-6 | Recording fixtures | The owner records once with a low-limit test key and synthetic prompts; fixtures are reviewed for personal data before commit. **Deferred** (owner, 2026-11-12): no API key or credits yet. 1a's contract suite runs on hand-built fixtures that follow Anthropic's documented shapes for the pinned SDK; the recording script is complete and not yet run. Recording, and replacing the hand-built success fixtures with the recordings, is carried over: it happens before Khadim's first real model call |
| D-7 | Tracing without OpenTelemetry in core | The worker's composition root wraps the LLM provider and the tool executor in tracing wrappers, inside one span per run. Core has no tracing code and the allowlist is unchanged. A tracer port in core is added only if loop-step spans are needed later. Lands in 1b |
| D-8 | Model refusals | The adapter maps a `refusal` stop reason to `LLM_REFUSED`, and the run ends with that error. No provider server-side fallback in 1a (Haiku 5.5 has none, and Sonnet 5.5's works only on the Claude API); fallbacks come from the catalog's `chat` fallbacks in 1c |
| D-9 | Who retries a model call: the provider SDK or Khadim, never both (official SDKs retry by default, and conventions §15.2 requires retries with backoff) | **Retry in core** (owner, 2026-11-12). The SDK's own retries are off (`maxRetries: 0`); the adapter only maps errors; one retry policy in core (exponential backoff with jitter on `LLM_RATE_LIMITED` and `LLM_UNAVAILABLE` only) runs before 1c's fallbacks, so each retry is counted once and can be recorded on the run. This changed [agent design §7](../architecture/agent.md#7-providers-and-model-routing-adr-0009), which drew retries at the adapter; 1a updated its diagram and text to match. Further rules:<br>1. **Retry-After.** The adapter puts the provider's retry delay on the `LLM_RATE_LIMITED` error (`retryAfterMs`). The core retry policy waits at least that long. A call is retried only when its delay is strictly shorter than the run's remaining running time (BR-21): if the delay is equal to or longer than the remaining running time, the run fails without waiting.<br>2. **Mid-stream failures.** A model call is retried only if nothing from that call has been emitted yet. If the stream fails after any text or tool call was emitted, the step fails with the mapped error and is not retried. Only text or tool-call content counts as emitted; provider metadata (stream start, pings, usage) does not.<br>3. **Attempts.** Each route in the model catalog has `maxAttempts`, counting the first try. **Default:** 3 (owner, 2026-11-12). When the attempts run out, the mapped error ends the call.<br>4. **Jitter.** The jitter comes from an injected random source, so `retry.rules` stays pure (conventions §7).<br>5. **Cancellation.** A cancel during a retry wait interrupts the wait at once, and the run ends as cancelled.<br>Rejected alternative: the adapter keeps the SDK's retries, configured from the catalog; retries would not be visible on the run and every provider SDK would need the same configuration |

### Verification

`pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (report the test count), `pnpm depcruise`, `pnpm build`, `pnpm audit --prod`. No real model calls in any test.

### Risks and pitfalls

| Id | Pitfall | Mitigation |
| --- | --- | --- |
| P-1 | The SDK's streaming event shapes change between versions | Contract suite on fixtures typed against the SDK's own types, so a changed shape fails typecheck; recorded fixtures once the deferred recording is done (D-6); pin the SDK version |
| P-2 | Provider-neutral types end up mirroring Anthropic's shapes | Write `llm.types.ts` from the port's needs, then check them against the OpenAI-compatible format before 1c |
| P-3 | Fixtures leak personal data or keys | Record with synthetic prompts; gitleaks in CI; review before commit. Hand-built fixtures hold only synthetic values |
| P-4 | Loop code depends on persistence details | Inject the run store (ADR-0012); 1b replaces the fake with the Drizzle repository without touching the loop |
| P-5 | Request shapes the current models or API version reject | API version `2026-10-21` (sent by current SDKs) rejects `temperature`, `top_p` and `top_k` on every model, a `document` block in an assistant message and a cited `text` block in a user message; the adapter never sends them. Sonnet 5.5 and Opus 5.5 reject forced `tool_choice` (`any`, `tool`): use `auto`. No model accepts assistant prefill. Thinking: Opus 5.5 cannot disable it, Sonnet 5.5 turns it off only with `between_tools`, Haiku 5.5 allows `disabled` at effort `high` or below; the catalog controls depth with effort. Contract tests assert none of the rejected fields are sent |
| P-6 | Cost tracking assumes flat prices | Price tiers in the catalog schema; `usage.rules` tests at the 100K boundary |

Also known pitfalls KP-01 (overriding a preset rule's options), KP-03 (release-age exclusions on `pnpm add`), KP-07 (`exactOptionalPropertyTypes`) and KP-08 (keys from the model) in [pitfalls.md](../development/pitfalls.md).

## Slices 1b to 1d

Each gets its own detailed plan, written and approved when the previous slice is done. Each plan must include the items below, carried from the [foundation review](foundation-review.md#scheduled-items), and is not approved without them.

### Carried into the 1b plan

| Item | Notes |
| --- | --- |
| Backend standard, written from 1a's code | Service and repository patterns; app bootstrap and env secret strength; logging with `requestId` and `runId`; process lifecycle; API details (idempotency semantics, status codes and check order, sorting, search, static routes, one-time secrets, shared Zod field helpers, OpenAPI with Scalar and `openapi:check`); the shared problem-code catalogue and central error handler |
| Database standard | Write-once and immutable columns, grants (no `DELETE` except owner-deletable memory), custom security migrations, pool sizing, data-move rehearsal, `purpose` lookups, key-value settings |
| Caching and performance rules | Conventions §10.2 says only "no caching by default" until then |
| Frontend standard | `server-only`, no `NEXT_PUBLIC_*` in the BFF, a cheap `proxy.ts`, `FormFailure` and `useFormAction`, out-of-order guards, `*.client.ts` storage helpers, `docs/design/` |
| Full-stack reference module and templates | Contract, table, repository, service, controller, routes and tests, plus an implementer prompt, taken from the first database-backed module (conventions §10.3) |
| Scoped rule files | `.claude/rules/api`, `database`, `ui` (conventions §4.3) |
| Socket peer address in the installed Next.js | Confirm before the `loopback` and `tailscale` gates are built; propose an alternative if it cannot be read reliably (ADR-0016) |
| Job definitions | `defineJob` with Zod payloads and tests in `core/src/shared/jobs` |
| API HTTP helpers | Problem, domain problem, idempotent response, versioned response, `Location`, page response, client details, CSRF origin middleware |
| Test-database helpers | Testcontainers with the real roles script; migrations apply cleanly and are idempotent; upgrade tests against a database with rows; integration tests refuse a database whose name lacks `test` |
| CI | Parallel jobs (checks, integration, migrations, audit, commits; e2e later); coverage gate; migration drift check; caches for `.turbo` and `.next/cache` |
| Web patterns | Form failure mapping, a tested `proxy.ts`, `instrumentation.ts`, `server-env.ts` |
| History trimming and summarising, with reasoning blocks | 1a keeps a run's history append-only and fails a run whose context exceeds the model's limit (owner, 2026-11-12). The 1b plan decides trimming and summarising of conversation history (conventions §15.3) and how they treat reasoning blocks, which current Claude models bind to the conversation before them: a block replayed after earlier turns were edited or summarised is rejected |
| ADR-0009 §3 against D-4 | ADR-0009 has both composition roots (`apps/api`, `apps/worker`) build the provider registry; D-4 and ADR-0010 make the worker the only process that runs agents. The 1b plan settles which process builds it and amends ADR-0009 if needed |
| Run store type | 1a's stand-in type in `agent.types.ts` moves to the repository (`ReturnType<typeof createAgentRunRepository>`, ADR-0012) |
| Model catalog and tool policy file | 1a ships schema and validation only; the real file, with D-1's values confirmed against Anthropic's docs, lands with the worker (D-4) |
| `test:integration` scripts | Added to each package with its first integration test |
| Prompt files in the worker bundle | `prompts/prompt-loader.ts` reads `<purpose>.v<n>.md` next to its own source file. The worker's esbuild bundle must ship those files at the same relative path, or embed them; prove it with a start of the built worker |
| Run events | The loop reads text deltas only to track emission (D-9 rule 2). 1b adds the event sink that writes `text.delta`, `tool.called` and the other events to the run's Redis Stream (ADR-0010) |
| Recording the Anthropic fixtures (D-6, deferred from 1a) | Before Khadim's first real model call, in 1b or 1c, whichever calls the API first: the owner records with the existing script (`pnpm --filter @khadim/integrations record:anthropic`, steps in the integrations README), reviews the fixtures for keys and personal data, and the hand-built success fixtures are replaced by the recordings. Before recording, the script is changed to import its prompts from `src/testing/contract/contract-requests.ts`, so the script and the contract cases cannot drift. The contract suite itself does not change; only the fixture set and the values expected from it do. Until then the success fixtures prove only our reading of Anthropic's docs, not the live API (KP-20) |
| Cancelling a model call in flight | In 1a a cancel waits for the current model call, which can take up to the 120-second timeout. 1b's chat UI needs a cancel that aborts the call in flight: the run's `AbortSignal` passed to the provider (`LlmRequest.signal` exists for it), with the call's tokens still recorded when the provider reports them |

### Carried into the Phase 3 plan (approvals)

| Item | Notes |
| --- | --- |
| `APPROVAL_REQUIRED` | Conventions §12 lists the code without a meaning. 1a does not use it: a pause for approval is an outcome of the run, not an error. The approvals feature doc defines it (owner, 2026-11-12) |
| Pending actions | 1a's loop asks for a pending action through an injected dependency, with a fake in tests and no production implementation. The approvals module provides the real one |

### Carried into the Phase 6 plan (MCP and more tools)

| Item | Notes |
| --- | --- |
| Strict-tool limits | Anthropic allows at most 20 strict tools, 24 optional parameters and 16 union-typed parameters per request (KP-19). 1a has one tool and no check. The plan that first adds more tools builds a startup check, so a configuration over a limit stops the app instead of failing every model call (owner, 2026-11-12) |

### Carried into the 1c plan

| Item | Notes |
| --- | --- |
| Retry-After not shorter than the remaining running time, once fallbacks exist | **Open question:** D-9 rule 1 fails the run without waiting when the provider's retry delay is equal to or longer than the remaining running time. That is right for 1a, which has no fallbacks. From 1c, BR-26 and ADR-0009 try the next fallback once retries are exhausted on `LLM_RATE_LIMITED`; should a too-long delay go to the fallback at once instead of failing the run? The 1c plan decides, and updates D-9 rule 1 and agent design §7 to match |

### Carried into the 1d plan

| Item | Notes |
| --- | --- |
| ADR-0017, owner account protection | Written against the Better Auth version installed then: recovery codes; session list and revoke; sign-in throttled by the trusted client address, never the proxy's, with no hard lockout, and confirmation that Better Auth can count wrong TOTP codes (or an alternative); step-up (fresh TOTP) for connection changes and a time window for approvals; CSRF `Origin` check and Server Actions `allowedOrigins`; secret rotation; `trust proxy` CIDRs; Permissions-Policy, COOP and CORP; upload checks by magic bytes and size; redirect and OAuth callback allowlist; rate limiters (sign-in fails closed, others fail open). Matches the [security](../security.md) rows |
| End-to-end tests | Own servers; a user and a client address per test; failure on CSP violations and console errors; locating by role and label; specs for security headers, session renewal and two tabs |
