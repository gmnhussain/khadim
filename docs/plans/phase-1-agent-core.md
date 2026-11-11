# Plan: Phase 1, agent core (split into 1a to 1d)

**Phase 1 becomes four shippable slices. Each ends with something the owner can run and every check passing, so the agent is useful before the platform work is finished.**

| | |
| --- | --- |
| Status | Approved by the owner, 2026-11-10. Amended 2026-11-12 by the [foundation review](foundation-review.md) (slice 1a details, decision D-9, carry-over for 1b and 1d) and re-approved by the owner, 2026-11-12, with D-9 answered (retry in core, with the Retry-After, mid-stream, attempts, jitter and cancellation rules) |
| Phase | 1 (1a, 1b, 1c, 1d) |

## Why split

The original Phase 1 bundled sign-in with TOTP, the run lifecycle, tool registry, loop, streaming UI, run inspection, cost tracking, two LLM adapters, routing, the outbox relay and idempotency. That is several weeks with nothing runnable until the end. ADR-0007 now allows development in `private` access mode, so sign-in can come last, as long as it lands before any public exposure.

## The split

| Slice | Outcome the owner can see | Main rules and requirements | Depends on |
| --- | --- | --- | --- |
| **1a. Loop in core** | `pnpm test` proves the loop: scripted model replies drive tools, budgets stop runs, policies hold. A recorded-fixture contract suite proves the Anthropic adapter. No apps. | BR-21 (limits), BR-23 (recorded in memory), BR-25; ADR-0005, ADR-0009, ADR-0011, ADR-0012 | Tooling upgrades below |
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

### Goal and scope

In scope: `packages/core` modules `llm`, `tools`, `agent` (loop, rules, prompts) and `shared` (errors, ids, clock); the Anthropic adapter and the shared adapter contract suite in `packages/integrations`; workspace setup for both packages.

Not in scope: database, Redis, apps, web UI, OpenAI-compatible adapter (1c), memory tools (Phase 2), tracing wrappers (1b, where the worker exists). The loop persists through an injected run store typed from the future repository (ADR-0012), with an in-memory fake in tests.

### Changes by layer

| Layer | Change |
| --- | --- |
| config | Use the existing presets; add `vitest`, `@vitest/coverage-v8` and `msw` to the catalog at the versions above. Each package: `test:unit` runs `vitest run --project unit --coverage` (so the 100% gate on `*.rules.ts` fires in every `pnpm test` and in CI), `test:integration` runs `vitest run --project integration`, and a `tsconfig.test.json` extends `@khadim/config/tsconfig/test.json`. Remove `passWithNoTests` from the Vitest preset once the first tests exist |
| core: `llm` | `llm.port.ts` (generate, stream, capabilities), `llm.types.ts` (messages, content parts, tool calls, usage, stop reasons including refusal, errors; `LLM_RATE_LIMITED` carries an optional `retryAfterMs`), `retry.rules.ts` (D-9: retry only `LLM_RATE_LIMITED` and `LLM_UNAVAILABLE`, only when the call has emitted no text or tool-call content, and only while attempts remain under the route's `maxAttempts`; delay is the backoff with jitter or `retryAfterMs`, whichever is longer, with the jitter's random value passed in; fail without waiting when that delay exceeds the run's remaining running-time budget), `model-registry.ts` (catalog validated with Zod, including tiered prices, per-task effort and per-route `maxAttempts`, default 3), `model-routing.rules.ts` (task route only in 1a), `usage.rules.ts` (integer micro-USD, price tier chosen by prompt size), `testing/FakeLlmProvider` |
| core: `tools` | **The reference module for core code, built first** (conventions §10.3); `llm` and `agent` copy its shape. `tool.types.ts` (effect tier), `tool.errors.ts` (closed problem-code union, conventions §12.1), `tool-policy.rules.ts` (tier floor, limits), `tool-registry.ts` (Zod input → JSON Schema, validation errors returned to the model), `builtin/get-current-time.tools.ts`, `testing/` fake, `index.ts` |
| core: `agent` | `agent.rules.ts` (stop conditions, budgets, history trimming), `agent-loop.ts` (applies `retry.rules`; tracks whether the current call has emitted text or a tool call, so a failure after the first emission fails the step instead of retrying; waits through an injected sleep that a cancel interrupts at once, D-9), `context-builder.ts`, `prompts/system.v1.md`, `agent.errors.ts` |
| integrations | `llm/anthropic` adapter (official SDK with its retries off, `maxRetries: 0`; streaming; prompt caching on the marked prefix; error mapping to `LLM_RATE_LIMITED` with the provider's retry delay as `retryAfterMs`, `LLM_UNAVAILABLE` and `LLM_REFUSED`); `testing/contract` shared suite; recorded fixtures |
| boundaries | Core production code imports only `zod` and `drizzle-orm`. `core-allowed-packages-only` excludes test files (`\.(test|int\.test|spec)\.ts$`, matching `not-to-dev-dependencies`) and `vitest.config.ts`, so tests can import `vitest` and Testcontainers. The Anthropic SDK is imported only in `integrations/src/llm/anthropic` |
| tests | Unit tests per conventions §19.1; 100% coverage on `*.rules.ts`; loop scenarios with `FakeLlmProvider` (final answer, tool call, invalid tool input, iteration limit, cost limit, cancellation between steps, `approve` policy pausing the run, refusal ending the run; a stream that fails before emitting anything is retried; a stream that fails after only metadata (start, ping, usage) is retried; a stream that fails after emitting text, and one that fails after emitting a tool call, each fail the step without a retry; a cancel during a retry wait ends the run as cancelled without finishing the wait); price-tier boundary cases in `usage.rules`; `retry.rules` cases (`retryAfterMs` longer than the backoff is waited in full; `retryAfterMs` longer than the remaining running-time budget fails the run without waiting; non-retryable errors are not retried; no retry once `maxAttempts` is reached; a fixed random value gives the exact jittered delay); contract suite against the Anthropic fixtures, including `retryAfterMs` mapped from a rate-limit response and the SDK's retries being off |
| docs | `docs/product/features/agent.md`, which also defines the agent, tool and LLM problem codes (conventions §12.1); agent design §7 updated for D-9: retries in core instead of at the adapter (diagram and text), the Retry-After rule, the mid-stream rule (what counts as emitted), `maxAttempts` and cancellation during a wait; ADR-0008 untouched (embeddings are Phase 2) |

### Decisions

| Id | Decision | Owner answer |
| --- | --- | --- |
| D-1 | Default model and effort per task | `chat` → Claude Haiku 5.5 (`claude-haiku-5-5`), effort `low`. `draft_post`, `draft_reply` → Claude Sonnet 5.5 (`claude-sonnet-5-5`), effort `medium`. `eval_grader` → Claude Opus 5.5 (`claude-opus-5-5`), effort `high`. Effort is set explicitly per task because the defaults differ by model (`medium` on Haiku 5.5 and Opus 5.5, `high` on Sonnet 5.5). Prices in the catalog are tiered where the provider tiers them: Haiku 5.5 is USD 0.10 / 0.50 per million input / output tokens up to 100K prompt tokens and USD 0.50 / 2.50 above; Sonnet 5.5 is 2 / 10; Opus 5.5 is 4 / 20; cache prices included. Ids, limits and prices are confirmed against Anthropic's docs when the catalog is written. Effort levels are defaults, retuned after the first evals. |
| D-2 | HTTP fixture tool for adapter tests | MSW: it intercepts `fetch`, which the official SDK uses |
| D-3 | Zod → JSON Schema for tool inputs | Zod 4 built-in `toJSONSchema` with strict objects (`additionalProperties: false`), so tools can be sent with `strict: true`. No extra package |
| D-4 | Where the model catalog and tool policies live | One validated config file, read by the worker's composition root (the only process that runs agents, ADR-0010) |
| D-5 | Budget defaults | Keep BR-21: 10 iterations, 2 minutes running time, USD 0.50 per run, computed with the tiered prices from D-1 |
| D-6 | Recording fixtures | The owner records once with a low-limit test key and synthetic prompts; fixtures are reviewed for personal data before commit |
| D-7 | Tracing without OpenTelemetry in core | The worker's composition root wraps the LLM provider and the tool executor in tracing wrappers, inside one span per run. Core has no tracing code and the allowlist is unchanged. A tracer port in core is added only if loop-step spans are needed later. Lands in 1b |
| D-8 | Model refusals | The adapter maps a `refusal` stop reason to `LLM_REFUSED`, and the run ends with that error. No provider server-side fallback in 1a (Haiku 5.5 has none, and Sonnet 5.5's works only on the Claude API); fallbacks come from the catalog's `chat` fallbacks in 1c |
| D-9 | Who retries a model call: the provider SDK or Khadim, never both (official SDKs retry by default, and conventions §15.2 requires retries with backoff) | **Retry in core** (owner, 2026-11-12). The SDK's own retries are off (`maxRetries: 0`); the adapter only maps errors; one retry policy in core (exponential backoff with jitter on `LLM_RATE_LIMITED` and `LLM_UNAVAILABLE` only) runs before 1c's fallbacks, so each retry is counted once and can be recorded on the run. This changes [agent design §7](../architecture/agent.md#7-providers-and-model-routing-adr-0009), which today draws retries at the adapter; 1a updates its diagram and text to match. Further rules:<br>1. **Retry-After.** The adapter puts the provider's retry delay on the `LLM_RATE_LIMITED` error (`retryAfterMs`). The core retry policy waits at least that long, capped by the run's remaining running-time budget (BR-21). If the delay exceeds the remaining budget, the run fails without waiting.<br>2. **Mid-stream failures.** A model call is retried only if nothing from that call has been emitted yet. If the stream fails after any text or tool call was emitted, the step fails with the mapped error and is not retried. Only text or tool-call content counts as emitted; provider metadata (stream start, pings, usage) does not.<br>3. **Attempts.** Each route in the model catalog has `maxAttempts`, counting the first try. **Default:** 3 (owner, 2026-11-12). When the attempts run out, the mapped error ends the call.<br>4. **Jitter.** The jitter comes from an injected random source, so `retry.rules` stays pure (conventions §7).<br>5. **Cancellation.** A cancel during a retry wait interrupts the wait at once, and the run ends as cancelled.<br>Rejected alternative: the adapter keeps the SDK's retries, configured from the catalog; retries would not be visible on the run and every provider SDK would need the same configuration |

### Verification

`pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (report the test count), `pnpm depcruise`, `pnpm build`, `pnpm audit --prod`. No real model calls in any test.

### Risks and pitfalls

| Id | Pitfall | Mitigation |
| --- | --- | --- |
| P-1 | The SDK's streaming event shapes change between versions | Contract suite on recorded fixtures; pin the SDK version |
| P-2 | Provider-neutral types end up mirroring Anthropic's shapes | Write `llm.types.ts` from the port's needs, then check them against the OpenAI-compatible format before 1c |
| P-3 | Fixtures leak personal data or keys | Record with synthetic prompts; gitleaks in CI; review before commit |
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

### Carried into the 1c plan

| Item | Notes |
| --- | --- |
| Retry-After longer than the remaining budget, once fallbacks exist | **Open question:** D-9 rule 1 fails the run without waiting when the provider's retry delay exceeds the remaining running-time budget. That is right for 1a, which has no fallbacks. From 1c, BR-26 and ADR-0009 try the next fallback once retries are exhausted on `LLM_RATE_LIMITED`; should a too-long delay go to the fallback at once instead of failing the run? The 1c plan decides, and updates D-9 rule 1 and agent design §7 to match |

### Carried into the 1d plan

| Item | Notes |
| --- | --- |
| ADR-0017, owner account protection | Written against the Better Auth version installed then: recovery codes; session list and revoke; sign-in throttled by the trusted client address, never the proxy's, with no hard lockout, and confirmation that Better Auth can count wrong TOTP codes (or an alternative); step-up (fresh TOTP) for connection changes and a time window for approvals; CSRF `Origin` check and Server Actions `allowedOrigins`; secret rotation; `trust proxy` CIDRs; Permissions-Policy, COOP and CORP; upload checks by magic bytes and size; redirect and OAuth callback allowlist; rate limiters (sign-in fails closed, others fail open). Matches the [security](../security.md) rows |
| End-to-end tests | Own servers; a user and a client address per test; failure on CSP violations and console errors; locating by role and label; specs for security headers, session renewal and two tabs |
