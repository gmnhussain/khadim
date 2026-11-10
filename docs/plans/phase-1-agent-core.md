# Plan: Phase 1, agent core (split into 1a to 1d)

**Phase 1 becomes four shippable slices. Each ends with something the owner can run and every check passing, so the agent is useful before the platform work is finished.**

| | |
| --- | --- |
| Status | Approved by the owner, 2026-11-10 |
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
| Vitest, MSW | — | 5.1.0, 3.0.4 | Added to the catalog with 1a |

## Slice 1a in detail

### Goal and scope

In scope: `packages/core` modules `llm`, `tools`, `agent` (loop, rules, prompts) and `shared` (errors, ids, clock); the Anthropic adapter and the shared adapter contract suite in `packages/integrations`; workspace setup for both packages.

Not in scope: database, Redis, apps, web UI, OpenAI-compatible adapter (1c), memory tools (Phase 2), tracing wrappers (1b, where the worker exists). The loop persists through an injected run store typed from the future repository (ADR-0012), with an in-memory fake in tests.

### Changes by layer

| Layer | Change |
| --- | --- |
| config | Use the existing presets; add `vitest` and `msw` to the catalog at the versions above |
| core: `llm` | `llm.port.ts` (generate, stream, capabilities), `llm.types.ts` (messages, content parts, tool calls, usage, stop reasons including refusal, errors), `model-registry.ts` (catalog validated with Zod, including tiered prices and per-task effort), `model-routing.rules.ts` (task route only in 1a), `usage.rules.ts` (integer micro-USD, price tier chosen by prompt size), `testing/FakeLlmProvider` |
| core: `tools` | `tool.types.ts` (effect tier), `tool-policy.rules.ts` (tier floor, limits), `tool-registry.ts` (Zod input → JSON Schema, validation errors returned to the model), `builtin/get-current-time.tools.ts` |
| core: `agent` | `agent.rules.ts` (stop conditions, budgets, history trimming), `agent-loop.ts`, `context-builder.ts`, `prompts/system.v1.md`, `agent.errors.ts` |
| integrations | `llm/anthropic` adapter (official SDK, streaming, prompt caching on the marked prefix, error mapping to `LLM_RATE_LIMITED`, `LLM_UNAVAILABLE` and `LLM_REFUSED`); `testing/contract` shared suite; recorded fixtures |
| boundaries | Core production code imports only `zod` and `drizzle-orm`. `core-allowed-packages-only` excludes test files (`\.(test|int\.test|spec)\.ts$`, matching `not-to-dev-dependencies`) and `vitest.config.ts`, so tests can import `vitest` and Testcontainers. The Anthropic SDK is imported only in `integrations/src/llm/anthropic` |
| tests | 100% coverage on `*.rules.ts`; loop scenarios with `FakeLlmProvider` (final answer, tool call, invalid tool input, iteration limit, cost limit, cancellation between steps, `approve` policy pausing the run, refusal ending the run); price-tier boundary cases in `usage.rules`; contract suite against the Anthropic fixtures |
| docs | `docs/product/features/agent.md`; ADR-0008 untouched (embeddings are Phase 2) |

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

## Slices 1b to 1d

Each gets its own detailed plan, written and approved when the previous slice is done.
