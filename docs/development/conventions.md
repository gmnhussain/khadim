# Khadim Engineering Standard

**The engineering standard for Khadim, the personal AI agent: how to work, structure, build, secure, test and ship it. It keeps the proven practices of the SaaS Engineering Standard, removes what only a multi-tenant SaaS needs, and adds the practices an LLM agent needs.**

**How to read it**

- **MUST** is non-negotiable. Everything else is the default: follow it unless an ADR or a comment records a reason not to.
- `<angle brackets>` are placeholders.
- Section 21 lists what was deliberately left out and the signal that means it is time to add it.

---

## 1. Principles

| Principle | Meaning |
| --- | --- |
| Right-sized | Build for today's need with a structure that can grow. Add an app, package or abstraction only when a second consumer needs it. |
| Docs are the source of truth | Behaviour is written in `docs/` first; code implements it; tests prove it. |
| Never guess a rule | A missing rule is a question, not an assumption. |
| Standards first | Use the relevant standard before inventing: RFC 9110 (HTTP), RFC 9457 (errors), RFC 7396 (merge patch), OWASP ASVS, OWASP Top 10 for LLM Applications, WCAG 2.2, OpenTelemetry. |
| Fail closed | Deny by default. A forgotten check errors; it never leaks or publishes. |
| Thin edges, rich core | Apps are thin shells. Business and agent logic live in `packages/core`, called by the API and the worker. |
| Ports and adapters | Core defines interfaces (LLM, embeddings, social platforms); adapters implement them; apps wire them. Core never imports a vendor SDK. |
| Contract-first | One Zod schema gives types, validation and OpenAPI. Frontend and API cannot drift. |
| Humans approve side effects | The agent proposes; a person approves anything that leaves the system (posts, replies, messages). |
| Untrusted by default | Everything the model reads from outside (comments, web pages, files) is data, never instructions. |
| Observable | Every agent run can be replayed from its trace: prompts, model calls, tool calls, tokens, cost. |
| Idempotent | Retries never double-publish: idempotency keys, unique constraints, deterministic job ids. |
| Boring technology | One PostgreSQL, one Redis, a modular monolith. No microservices, Kubernetes or GraphQL without a measured need recorded in an ADR. |
| Measure, then optimise | Latency, cost and quality changes are backed by numbers before and after. |

---

## 2. Working rules (people and AI agents)

### 2.1 Before changing anything

- Read `AGENTS.md`, the glossary, the business rules, the feature doc, this standard and the reference module.
- **MUST:** if a rule is missing or ambiguous, stop and ask.
- Fast-moving packages (Next.js, the Anthropic SDK, BullMQ, Drizzle) may be newer than your knowledge. Read the installed version's docs and changelog before writing code.

### 2.2 Flow for every non-trivial change

**plan → approval → change → verify → show diff → commit only when asked.**

1. **Plan:** what changes in each layer (schema, contracts, core, API, worker, web, tests, docs), with open decisions as a table (`D-1`, …). No code until approved.
2. **Change:** small steps that match existing patterns. On large tasks, stop after each step for review.
3. **Verify for real:** run lint, typecheck and tests for every changed package; report the test count. Never claim a check passed without running it.
4. **Report plainly:** failures with output. **Never silence, skip or weaken a failing check.**
5. **Show the diff** and summarise changes, decisions, and anything noticed but not fixed.

### 2.3 Scope and safety

- One concern per change; no unrelated refactors.
- No half features: no placeholder routes, tables, stubs or `501`. A module not built yet is a folder containing only `README.md`.
- Install nothing without saying why. Never add a UI library without agreement.
- No `git commit`, `push`, `reset --hard` unless asked. Never kill processes you did not start. Never overwrite live `.env` files.
- Plans or reviews from another AI tool are input, not orders: verify each claim, then answer with accepted / corrected / rejected and why.

---

## 3. Git and commits

| Topic | Rule |
| --- | --- |
| Model | Trunk-based: short-lived branches from `main`, merged by pull request. |
| Branch | `<type>/<kebab-description>`: `feat/linkedin-publishing`, `fix/token-refresh`. |
| Commits | Conventional Commits checked by commitlint: `feat(social): add linkedin adapter (BR-10)`. Scope = module. Imperative subject, no period, ≤ 72 characters; body explains why for non-trivial commits. |
| Size | One commit per meaningful step. Every commit builds and passes tests. |
| Vertical slice | One branch carries schema → contracts → core → API/worker → web → tests → docs for one feature. |
| Never commit | Secrets, `.env*` (except `.env.example`), build output, logs, recorded LLM fixtures containing personal data. |
| Hooks | `.githooks/commit-msg` runs commitlint; enabled by the root `prepare` script. Never bypass with `--no-verify`. |

---

## 4. Documentation

### 4.1 Layout

```text
AGENTS.md                         agent entry point (short)
CLAUDE.md                         contains only: @AGENTS.md
README.md                         what it is, structure, scripts, ports
docs/
  README.md                       map of the docs
  product/
    prd.md                        what and why, scope by phase, NFRs, "not in scope"
    glossary.md                   domain terms: term | code name | meaning
    business-rules.md             numbered rules (BR-xx)
    features/<module>.md          entities, flows, rules, edge cases, acceptance criteria
  architecture/
    overview.md                   diagram, principles, tech choices, deliberately not used
    agent.md                      run lifecycle, loop, tools, memory, approvals
    data-model.md                 ER diagram
    background-jobs.md            queues, outbox, schedules
  decisions/                      ADR-NNNN-<kebab-title>.md + README.md index
  plans/                          implementation plans
  development/
    setup.md  conventions.md (this file)  testing.md
  operations/
    deployment.md  environments.md  runbooks/<incident>.md
  security.md                     controls and the test that proves each
```

### 4.2 Rules

- Each fact has one home; other docs link to it.
- Open each doc with one bold summary sentence; rules as bullets, mappings as tables, flows as Mermaid.
- Unknowns: `> **Open question:** …`. Chosen-for-now answers: `> **Default:** …`.
- Ids: `BR-xx` business rule, `D-xx` plan decision, `P-xx` pitfall, `G-xx` golden or eval case, `ADR-NNNN` decision.
- Hard-to-reverse choices get an ADR (Status, Date, Context, Decision, Alternatives, Consequences). Never edit an accepted ADR except its status line; supersede or extend it with a new ADR.
- A behaviour change and its doc change ship in the same PR.
- Generated references (OpenAPI, changelog) are never hand-written.

---

## 5. Repository layout and boundaries

### 5.1 Monorepo

```text
khadim/
├── apps/
│   ├── web/                Next.js (App Router), BFF: chat, approvals, schedules, memory, connections
│   ├── api/                Express 5: HTTP only (routes, controllers, OpenAPI, SSE), composition root
│   └── worker/             BullMQ: agent runs, publishing, comment processing, outbox relay,
│                           repeatable schedules; composition root
├── packages/
│   ├── core/               all business and agent logic; defines ports; no vendor SDKs
│   ├── integrations/       adapters implementing core ports: LLM providers (Anthropic, OpenAI-compatible,
│   │                       OpenAI, Gemini), embeddings, LinkedIn, Facebook
│   ├── db/                 Drizzle schema, migrations, pgvector, seeds, test helpers
│   ├── contracts/          Zod schemas, API types, generated typed client
│   └── config/             tsconfig, ESLint, Prettier, Vitest presets; ports
├── e2e/                    Playwright specs
├── evals/                  agent quality evaluations (datasets, graders, reports)
├── infra/                  docker-compose (PostgreSQL 18 + pgvector, Redis)
└── docs/
```

### 5.2 Inside `packages/core`

```text
packages/core/src/
  agent/
    agent-run.service.ts        start, resume, cancel runs; owns the run state machine
    agent-loop.ts               the tool-calling loop
    context-builder.ts          system prompt + profile + retrieved memory + history
    agent-run.repository.ts     runs, steps, messages
    agent.rules.ts              pure rules: stop conditions, budget checks, history trimming
    agent.types.ts  agent.errors.ts  agent.rules.test.ts
    prompts/                    versioned prompt files (system.v1.md, post-writer.v2.md)
    index.ts
  llm/
    llm.port.ts                 LlmProvider interface + capabilities
    llm.types.ts                provider-neutral messages, content parts, tools, usage, stop reasons
    model-registry.ts           model catalog and task routes (from config), startup validation
    model-routing.rules.ts      pure rules: override → schedule → task route → fallbacks; capability checks
    usage.rules.ts              cost calculation in integer micro-USD
    testing/                    FakeLlmProvider
  tools/
    tool.types.ts               ToolDefinition: name, description, Zod input, handler, isWrite
    tool-registry.ts            registration, schema export, lookup, execution
    builtin/                    get_current_time, search_memory, …
  memory/
    embedder.port.ts
    profile.service.ts  documents.service.ts  retrieval.service.ts
    chunking.rules.ts           pure chunking rules
  social/
    social-platform.port.ts     SocialPlatform interface + Capabilities
    social.tools.ts             publish_post, list_new_comments, reply_to_comment
    posts.service.ts  comments.service.ts  *.repository.ts
  approvals/
    approval.service.ts  approval.policy.ts  pending-action.repository.ts
  schedules/
    schedule.service.ts  schedule.repository.ts
  connections/
    connection.service.ts       OAuth connections; token encryption and refresh
  shared/
    errors.ts  request-context.ts  outbox.ts  audit.ts  crypto.ts
```

Each module exposes its public API through `index.ts`; other modules import only that.

### 5.3 Dependency rules (enforced by dependency-cruiser in CI)

| Rule | Why |
| --- | --- |
| apps → packages, never the reverse; no app imports another app | Packages are shared; apps are deployables. |
| Only `api` and `worker` import `core`, `integrations`, `db` | The browser never gets server code. |
| `web` reaches the API only through `contracts` | One typed client. |
| `core` imports only `db`, `contracts` (schemas only) and its own modules | Core stays vendor-free and testable. |
| `integrations` imports `core` ports, never `core` services | Adapters implement interfaces; they hold no business rules. |
| Modules import each other only through `index.ts`; no cycles | Clear module boundaries. |

### 5.4 Packages

- Workspace packages ship TypeScript source with one `exports` subpath per file; no barrels that drag server code into a browser bundle.
- Next.js uses `transpilePackages`. Node apps run with `tsx watch` in development and are bundled with esbuild for production.

---

## 6. Tooling

| Tool | Setup |
| --- | --- |
| Runtime | Node.js LTS pinned in `.nvmrc` and `engines`; `packageManager` pinned. |
| Packages | pnpm workspaces; one version per dependency through `catalog:`; install scripts blocked by default; `pnpm install --frozen-lockfile` in CI; review the lockfile diff after every install. |
| Tasks | Turborepo with declared outputs and env inputs; `dev` persistent and uncached; integration and e2e tests uncached. |
| Lint | ESLint flat config, typescript-eslint `strictTypeChecked`, `import-x`, React Hooks, Next, `eslint-config-prettier` last; `--max-warnings 0`. Required rules: `no-floating-promises`, `no-misused-promises`, `switch-exhaustiveness-check`, `consistent-type-imports`, `no-explicit-any`, `no-non-null-assertion`, `import-x/no-cycle`, `eqeqeq`, `no-console`. |
| Format | Prettier: `printWidth: 100`, `trailingComma: "all"`, Tailwind plugin. Markdown not formatted. |
| TypeScript | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `noImplicitOverride`, `noUnusedLocals`, `noUnusedParameters`; Bundler resolution. Tests typechecked separately. |
| Editor | `.editorconfig` (UTF-8, LF, 2 spaces), `.gitattributes` (`* text=auto eol=lf`). |
| Boundaries | dependency-cruiser. |
| Updates | Dependabot weekly; `pnpm audit --prod` in CI. |

Root scripts: `dev`, `build`, `lint`, `typecheck`, `format`, `test`, `test:unit`, `test:integration`, `test:e2e`, `evals`, `depcruise`, `openapi:check`, and `db:generate | db:migrate | db:seed` on `@khadim/db`. Workspace packages use the `@khadim/*` scope. Scripts are added in the phase that introduces what they run.

---

## 7. TypeScript and code style

- No `any`; use `unknown` and narrow. Validate every untrusted shape at runtime with Zod: request bodies, env, job payloads, webhook bodies, **model tool inputs and structured model outputs**.
- `as const` tuples and objects instead of `enum`; derive types from the source of truth (`z.infer`, Drizzle `$inferSelect`).
- Factory functions with injected dependencies over classes (`createPostService(dependencies)`); classes only for errors.
- Inject time and randomness (`now`, `randomId`); pure rules never read the clock.
- Discriminated results for expected outcomes: `{ ok: true; value } | { ok: false; problem }`.
- `??` not `||`; early returns; never reassign parameters; no floating promises; never `!` to silence the compiler.
- No magic numbers or strings: named constants (`MAX_AGENT_ITERATIONS`, `DEFAULT_POST_HOUR`).
- One exported module or component per file. Barrels export only a module's public surface.
- Timestamps in UTC; business times in the configured time zone (`Asia/Dhaka`).

---

## 8. Naming

Full words, no abbreviations (allowed: `id`, `url`, `db`, `tx`, `ctx`, `req`, `res`, `err`).

| Thing | Convention | Example |
| --- | --- | --- |
| Files | kebab-case + role suffix | `agent-run.service.ts`, `chat-panel.tsx` |
| Functions, variables | camelCase | `startRun`, `retrievedChunks` |
| Types, components | PascalCase | `AgentRun`, `ApprovalCard` |
| Constants | UPPER_SNAKE_CASE | `MAX_AGENT_ITERATIONS` |
| Booleans | `is` / `has` / `can` / `should` | `isWrite`, `supportsComments` |
| Factories | `create<Thing><Layer>` | `createAgentRunService` |
| DB tables / columns | snake_case, plural tables | `agent_runs.input_tokens` |
| JSON fields | camelCase | `inputTokens` |
| Enum values | snake_case strings | `awaiting_approval` |
| API routes | kebab-case plural nouns under `/api/v1` | `/api/v1/pending-actions` |
| Problem codes | UPPER_SNAKE_CASE | `RUN_BUDGET_EXCEEDED` |
| **LLM tool names** | snake_case `verb_noun` | `publish_post`, `search_memory` |
| **Prompt files** | `<purpose>.v<n>.md`, optional `<purpose>.v<n>.<provider>.md` | `post-writer.v2.md`, `post-writer.v2.gemini.md` |
| Queues / jobs | `<domain>` / `<domain>.<verb>` | `social` / `social.publish-post` |
| Job ids | deterministic, `[A-Za-z0-9._-]` | `social.publish.<pendingActionId>` |
| Cache keys | colon-joined, versioned | `agent:profile:v1` |

Role suffixes: `.service.ts`, `.repository.ts`, `.rules.ts`, `.types.ts`, `.errors.ts`, `.port.ts`, `.adapter.ts`, `.tools.ts`, `.jobs.ts`, `.routes.ts`, `.controller.ts`, `.openapi.ts`, `.actions.ts`, `.test.ts`, `.int.test.ts`, `.spec.ts`, `.eval.ts`.

---

## 9. Comments

- No narrating comments. Comment the non-obvious **why** and cite ids: `// BR-12: never publish without an approved pending action.`
- One-line JSDoc on exported functions and types.
- No commented-out code. `TODO(<owner>): …` only, never anonymous.

---

## 10. Backend architecture

### 10.1 Layers

**routes → controllers → services → repositories**, with pure **rules** beside services.

| Layer | Lives in | Does | Never |
| --- | --- | --- | --- |
| Route | `apps/api/src/routes/<resource>/` | auth, `validate()` with contracts, idempotency | logic |
| Controller | same folder | call one service method; map view → response; status and headers | rules, SQL, try/catch |
| Service | `packages/core/src/<module>/` | use cases; transactions; calls rules, repositories, ports; audit and outbox in the same transaction | touch `req`/`res`; build SQL |
| Repository | same module | Drizzle queries only; receives `tx` | business rules, HTTP, Redis |
| Rules | `<module>.rules.ts` | pure functions with exhaustive tests | I/O, clock, randomness |
| Jobs | `<module>.jobs.ts` | thin handlers calling one service method | business rules |
| Adapters | `packages/integrations/src/<kind>/<vendor>/` | implement a core port; map vendor shapes and errors | business rules |

### 10.2 Patterns

- Composition roots (`apps/api/src/app.ts`, `apps/worker/src/main.ts`) create every service once with its adapters.
- Services return fresh views after writes; no-op updates write nothing.
- Uniqueness: a clear pre-check plus a unique index as the race-safe backstop.
- Optimistic concurrency on editable resources: `version` column, `ETag`, `If-Match`.
- Batch-load related rows; no N+1. Run independent queries with `Promise.all`.
- One `config/env.ts` per app parses `process.env` with Zod at startup and exits on invalid config. Never read `process.env` elsewhere.
- Express 5 forwards rejected promises; no `try/catch` in handlers.
- Graceful shutdown on `SIGTERM`/`SIGINT`: stop accepting work, finish in-flight runs or mark them interrupted, close DB and Redis.

---

## 11. API standards

| Topic | Standard |
| --- | --- |
| Style | REST, plural kebab-case nouns, `/api/v1`. State changes beyond CRUD: `POST /{resource}/{id}/{action}` (`/pending-actions/{id}/approve`). |
| Validation | Zod from `contracts`; bodies `.strict()`; string `max()` equals the column length. |
| Lists | `{ data, meta: { page, pageSize, total, totalPages } }`, or cursor pagination for append-only lists (messages, runs, events). Always bounded (`pageSize` ≤ 100). |
| Create / update | `201` with `Location` and `ETag`; `PATCH` uses merge-patch meaning; `If-Match` required on editable resources (`428` missing, `412` stale). |
| Idempotency | `Idempotency-Key` required on every POST that starts a run, publishes, replies or sends anything to a third party. Same key + same body → stored response replayed. |
| Streaming | Chat answers stream as **Server-Sent Events** (`text/event-stream`) with typed events (`run.started`, `text.delta`, `tool.called`, `approval.required`, `run.completed`, `run.failed`). The run is persisted, so a dropped stream can resume from `GET /runs/{id}` and `Last-Event-ID`. |
| Async work | Long or background work answers `202` with a run or job id the client can poll. |
| Webhooks | Verify the signature before anything else; store the raw payload; answer `200` fast; process in the worker. |
| Errors | RFC 9457 problem details (§12). |
| Dates | ISO 8601; timestamps UTC. |
| Health | `GET /health` (liveness), `GET /ready` (DB and Redis). |
| Request id | `X-Request-Id` on every response, log line and run. |
| Rate limits | Redis-backed limiter with standard `RateLimit` headers and `Retry-After` on `429`. |
| Docs | OpenAPI 3.1 generated from Zod, served at `/docs`; typed client generated and checked in CI. |

---

## 12. Errors

- Every error response is `application/problem+json` with `type`, `title`, `status`, `detail`, a stable UPPER_SNAKE `code`, `requestId`, and `errors[]` for field-level problems. Never internals on `5xx`.
- No try/catch in handlers: services throw typed domain errors; one central handler maps them.
- Shared errors: `NotFoundError`, `ForbiddenError`, `ValidationError`, `VersionConflictError`, `ConflictError`.
- Agent-specific codes: `RUN_BUDGET_EXCEEDED`, `RUN_ITERATION_LIMIT`, `LLM_UNAVAILABLE` (503), `LLM_RATE_LIMITED` (429 upstream, retried first), `TOOL_INPUT_INVALID`, `PLATFORM_NOT_CONNECTED`, `PLATFORM_CAPABILITY_UNSUPPORTED`, `APPROVAL_REQUIRED`.
- Pure rules return a problem code; services turn it into the error.

---

## 13. Database

PostgreSQL 18 with Drizzle ORM and the pgvector extension.

| Topic | Rule |
| --- | --- |
| Schema files | One file per table in `packages/db/src/schema/`; exported `$inferSelect` / `$inferInsert` types; JSDoc citing the rule. |
| Keys | `id uuid primary key default uuidv7()`. |
| Ownership | Owned rows carry `owner_user_id` (single user today; keeps a later multi-user change possible without RLS). |
| Timestamps | `created_at`, `updated_at` as `timestamptz` in UTC. |
| Concurrency | `version integer` on editable rows. |
| Status | Status columns, not booleans, for anything with a lifecycle; transitions enforced in rules and, for critical ones (`pending_actions`, `agent_runs`), by a trigger. |
| Append-only | `agent_steps`, `llm_calls`, `tool_calls`, `audit_logs`, `webhook_events`, `outbox` are inserted, never updated (except delivery markers). |
| Deletion | Business history (posts, runs, approvals) is never hard-deleted. Memory documents may be deleted by the owner (their chunks and embeddings go with them). |
| Money | LLM cost stored as `bigint` micro-USD, never floats. |
| Embeddings | `vector(<dimensions>)` column plus the embedding `provider`, `model` and `dimensions` on every chunk, so re-indexing with a new model is possible; HNSW index. |
| LLM usage | `agent_runs` and `llm_calls` record `provider` and `model`; `llm_calls` records whether it was a fallback. Conversation history is stored provider-neutral, never in a vendor's raw shape. |
| JSONB | Only for raw payloads, tool inputs and outputs, settings, audit snapshots. |
| Secrets | OAuth tokens encrypted at rest (AES-256-GCM, key from env); never returned by the API. |
| Constraints | CHECK constraints for invariants; partial unique indexes for "one active" rows; constraint names `uq_`, `chk_`, `fk_`, `idx_` prefixed and ≤ 63 characters. |
| Migrations | Generated by drizzle-kit, never hand-edited without a reason; additive changes; never rename together with other edits; fix forward. CI checks that generate produces no diff. |
| Roles | Migrations run as an owner role; apps connect as a non-superuser app role. |

---

## 14. Authentication and security baseline

Target **OWASP ASVS Level 2** for the web app and API, plus §15.11 for the agent.

- **Do not build auth from scratch.** Use a maintained library (choice recorded in an ADR) with: argon2id or the library's equivalent, httpOnly `Secure` `SameSite=Lax` cookies, server-side sessions, TOTP two-factor for the owner, rate-limited sign-in.
- Browsers never hold tokens in JavaScript (BFF, §18).
- Strict CSP with nonces; security headers (HSTS, `nosniff`, frame denial, referrer policy); CORS allowlist.
- Secrets only in env files and the host's secret store; never in the repo, prompts, logs or error messages.
- **Logs never contain** prompts, completions, chat text, comment text, tokens or personal data. They carry ids, counts, durations and error codes. Content lives in the database.
- Webhooks: signature verified, replay window checked, raw payload stored.
- Dependencies: lockfile committed, audit in CI, Dependabot.
- `docs/security.md` lists each control and the test that proves it.

---

## 15. AI agent standards

### 15.1 Run lifecycle

- Every trigger (chat message, schedule, webhook) creates an `agent_run` with `trigger_type`, `trigger_ref`, `task`, `model`, and `prompt_version`. The loop never knows who triggered it.
- States: `queued → running → (awaiting_approval →) succeeded | failed | cancelled`, enforced as a state machine. A run stuck past its timeout reads as failed.
- Interactive chat runs stream from the API (§11). Scheduled and webhook runs execute in the worker. Both call the same `runAgent()` in core.

### 15.2 LLM providers (ADR-0009)

- **Provider-neutral port:** `LlmProvider` in core with core-owned types (messages, content parts, tools, usage, stop reasons, errors) and declared `capabilities`. No vendor type enters core.
- **Adapters** in `integrations/src/llm/<provider>`: `anthropic`, `openai-compatible` (local models such as Ollama, LM Studio, vLLM, and compatible services by `baseUrl`), `openai`, `gemini`. Adding a provider = one adapter + config + a passing adapter contract suite; core, tools and approvals do not change.
- **Model catalog** in config: per model its provider, id, capabilities, context limit and prices (integer micro-USD per million tokens). Only providers with valid env config are enabled. Never hard-code provider or model ids in services.
- **Routing:** each task has a route `{ provider, model }`. Resolution: per-message override (allowlist) → schedule override → task route. Ordered fallbacks run only after retries are exhausted on `LLM_UNAVAILABLE` or `LLM_RATE_LIMITED`, and are recorded.
- **Capabilities gate routing:** routes and fallbacks are validated at startup against each task's needs (tools, context size, structured output); an invalid route stops the app.
- **Neutral history:** conversation history and run steps are stored provider-neutral so a conversation can continue on another model. Every run and LLM call records provider and model.
- Every call sets a maximum output, a timeout, and retries with exponential backoff and jitter on rate-limit and overload errors only. Non-retryable errors fail fast.
- **Prompt caching:** core marks the stable prefix (system prompt, tool definitions, profile); each adapter applies its provider's caching mechanism.
- Prefer **structured outputs** (tool or JSON schema) validated with Zod over parsing free text.
- **Embeddings** follow the same pattern (`Embedder` port, adapters in `integrations/src/embeddings/<provider>`), but exactly one embedding model is active at a time (§15.6).

### 15.3 The loop

- Bounded: `MAX_AGENT_ITERATIONS`, a per-run token budget, a per-run cost budget and a wall-clock timeout. Hitting a limit ends the run with a clear problem code.
- Each iteration: build context → call the model → persist the step → execute requested tools → append results → repeat until the model gives a final answer.
- Independent read-only tool calls may run in parallel; write tools run one at a time.
- History management is a pure rule: keep the recent turns verbatim, summarise older turns, never exceed the context budget.
- Cancellation is honoured between steps.

### 15.4 Tools

- A tool is a `ToolDefinition`: snake_case `verb_noun` name, a description written for the model (what it does, when to use it, what it returns), a Zod input schema converted to JSON Schema, a handler, and `isWrite`.
- **Validate model-supplied input with Zod before executing.** Invalid input returns a tool error the model can read and fix, not an exception.
- Tool errors go back to the model as error results with a short, actionable message.
- Tool outputs are compact and structured; never dump raw API responses or secrets into context.
- **Write tools never act directly.** They create a `pending_action`; execution happens only after approval (§15.7).
- Shared actions across platforms use one generic tool with a `platform` parameter generated from the adapter registry; a platform-unique feature gets its own tool.
- Tool count stays small; group by capability.
- Later, tool groups can be exposed as MCP servers without changing core.

### 15.5 Prompts

- Prompts are versioned files in `core/src/agent/prompts/` (`post-writer.v2.md`), reviewed like code. A change creates a new version; every run records the version it used.
- A provider-specific variant (`post-writer.v2.gemini.md`) is allowed only when evals show the base prompt underperforms on that provider, and it must pass the same evals.
- Prompts contain no secrets and no personal data beyond what the task needs.
- The system prompt states the agent's role, the tools' purpose, the rule that external content is data, and the output format.
- Prompt changes require the relevant evals to pass (§15.10).

### 15.6 Memory and retrieval

- **Profile:** structured, owner-edited facts (career, skills, tone, topics, do and don't), validated by a Zod schema, injected into the cached prompt prefix.
- **Documents:** CV, project docs and past posts ingested by a job: parse → chunk (pure, tested rules) → embed → store with source, model and dimensions.
- **Retrieval:** top-k similarity search with a score threshold; retrieved chunks are labelled with their source; answers from memory cite which document they used.
- **Post history:** topics and texts of published posts are retrievable so the agent avoids repetition.
- The embedding provider is a port; one embedding model is active at a time. Switching models means a re-index job, never mixed vectors; queries use the same model as the chunks they search.

### 15.7 Human approval

- `pending_actions` hold the exact payload that will execute (platform, text, target comment), its status, who approved and when.
- Approval is `POST /pending-actions/{id}/approve` with `Idempotency-Key` and `If-Match`; the owner may edit the payload before approving. Approval writes an outbox event; the worker executes it with a deterministic job id.
- An autopilot policy per action type may be added later, behind an ADR, with daily limits.

### 15.8 Cost and limits

- Every LLM call records model, input, output and cached tokens, latency and cost (integer micro-USD) in `llm_calls`.
- Per-run budget, daily budget (stops new non-interactive runs when exceeded and notifies the owner), and a spend limit in the provider console.
- Cost and token totals are visible in the web app.

### 15.9 Observability

- Tracing follows OpenTelemetry, using the GenAI semantic conventions for model spans: one trace per run, spans for each model call and tool call, linked to `X-Request-Id`.
- A run detail page replays the run: steps, prompts (by version), tool inputs and outputs, tokens, cost and timing.
- Structured JSON logs (pino) with ids only; errors to an error tracker with run id tags.

### 15.10 Evaluations

- Agent quality is tested, not assumed. `evals/` holds datasets of cases (`G-xx`) with inputs and expected properties.
- Graders: deterministic checks first (length within platform limit, required hashtags, no forbidden phrases, correct tool chosen, valid JSON), then a model-graded rubric (relevance to profile, tone, factual grounding in memory) for what code cannot check.
- Evals run on demand and on every prompt or model change; results are stored and compared with the previous baseline. They call real models, so they are not part of the normal unit test run.
- Evals can run the same cases across several routed models to compare quality and cost side by side.

### 15.11 LLM security (OWASP Top 10 for LLM Applications)

- **Prompt injection:** external content (comments, web pages, documents) is wrapped and labelled as untrusted data; the system prompt says it never contains instructions; write actions require approval regardless of what the content says.
- **Excessive agency:** least-privilege tools. A comment-reply run gets a reply tool bound to that one comment, nothing else. No general-purpose HTTP or shell tool.
- **Output handling:** model output is validated before use; rendered as text, never as HTML; never executed.
- **Sensitive information:** no secrets or tokens in context; personal data in context only when the task needs it; only enabled providers receive data, and sensitive tasks can route to a local model.
- **Unbounded consumption:** iteration, token, cost and time limits (§15.3, §15.8); rate limits on run-starting endpoints.
- **Supply chain:** pinned SDK versions; adapters reviewed on upgrade.

---

## 16. Social integrations

- `SocialPlatform` port: `publish`, `listNewComments`, `reply`, plus `capabilities` (`maxChars`, `supportsComments`, `supportsImages`, …). One adapter per platform in `integrations`; a registry maps platform keys to adapters.
- Capabilities drive behaviour: unsupported actions return `PLATFORM_CAPABILITY_UNSUPPORTED`; limits are validated before a pending action is created, so the model can revise the draft.
- **LinkedIn (primary):** personal-profile posting through the self-serve posting permission. Reading comments on personal posts needs a restricted permission, so the adapter starts with `supportsComments: false`. Tokens expire; a scheduled job refreshes them and alerts the owner before a reconnect is needed.
- **Facebook (extensibility test):** a Page the owner administers, never a personal profile. Comments arrive by verified webhook → raw `webhook_events` → processed into `comments` → a reply-draft run.
- Publishing and replying always run in the worker, with idempotency by pending-action id; a stored platform post id prevents double publishing.
- No scraping or browser automation against platform terms.

---

## 17. Background jobs and scheduling

- BullMQ on Redis in `apps/worker`. The API never does slow work in a request, except the streamed chat run.
- Services write an **outbox** event in the same transaction as the state change; a relay enqueues it (`FOR UPDATE SKIP LOCKED`); the worker runs it.
- Jobs are defined once with a Zod payload schema, validated on enqueue and on consume.
- Queues per domain (`agent`, `social`, `memory`, `maintenance`), never per entity.
- Deterministic job ids; "already exists" is success. Handlers are thin, idempotent and order-independent; every handler has a test that runs it twice.
- Retries with exponential backoff; invalid payloads fail once; exhausted jobs go to a dead-letter queue and mark the work failed.
- **Schedules** live in a `schedules` table (cron expression, time zone, task, enabled). The worker syncs them to BullMQ repeatable jobs on start and on change. "Daily at 9 PM" means 9 PM in the schedule's time zone.

---

## 18. Frontend

- Next.js App Router, React with the React Compiler, TypeScript, Tailwind CSS, shadcn/ui, React Hook Form + Zod, next-intl when the Bangla UI is added (English as the reference, a key-parity test across locales).
- **BFF: the browser never calls the API.** Server Components read; Server Actions mutate; Route Handlers only for the SSE chat stream proxy, uploads and auth.
- Every Server Action checks the session first and parses input with the same contract schema as the API.
- Tokens only in httpOnly cookies; no server data in client stores; Zustand only for UI preferences.
- Filters, sorting and paging live in the URL.
- Every page has loading, empty and error states; `error.tsx`, `not-found.tsx`, `global-error.tsx` exist.
- Chat UI: streams tokens as they arrive, shows tool activity, renders approval cards inline, and recovers a dropped stream from the persisted run.
- Model output is rendered as sanitised Markdown with raw HTML disabled.
- One component per file; Server Components by default; `"use client"` only where needed; shadcn components added with the CLI.
- Accessibility: WCAG 2.2 AA, keyboard support, labels, visible focus, reduced-motion respected.

---

## 19. Testing

| Level | Tool | What |
| --- | --- | --- |
| Unit | Vitest | `*.rules.ts` (100% coverage), loop logic with a **fake `LlmProvider`** that returns scripted responses, tool input validation, adapters' mapping functions |
| Integration | Vitest + Supertest + Testcontainers (PostgreSQL 18 + pgvector, Redis) | API routes, services, repositories, migrations, jobs, webhook verification |
| Contract | Vitest | constants vs DB enums, job payload schemas, OpenAPI up to date |
| Adapter | Vitest with recorded HTTP fixtures (nock or MSW) | LinkedIn and Facebook request/response mapping, error mapping, token refresh |
| Adapter contract | One shared Vitest suite run against every LLM and embedding adapter, with recorded fixtures | Message and tool mapping, streaming events, usage, error codes; required to add a provider |
| End-to-end | Playwright on production builds | chat, approve-and-publish (with a fake platform adapter), schedule creation |
| Evals | `evals/` runner | agent quality (§15.10) |

- **No real LLM or social API calls in unit, integration or e2e tests.** Real calls happen only in evals and in manual smoke tests against test accounts.
- Every API route: success, validation error, unauthenticated, not found, conflict, stale version.
- Factories instead of shared fixtures; deterministic ids and clocks where it matters.
- Test names are sentences that cite rules: `it("never publishes without an approved pending action (BR-12)")`.

---

## 20. Configuration, environments, CI and deployment

- 12-factor: all config from env, validated with Zod at startup; `.env.example` per app with comments; `TZ=UTC` in every process.
- Environments: `local` (seed data), `test` (containers in CI), `production`. Add `staging` when there is a second person or a risky migration.
- Local infrastructure with Docker Compose on non-default ports, bound to localhost: PostgreSQL 18 + pgvector and Redis. A mail catcher is added when email features arrive.
- **CI gates on every PR:** frozen install → typecheck → lint and format → unit tests with coverage → integration tests → migration check → depcruise → build → OpenAPI check → audit → commitlint → e2e.
- Deployment: one Docker image per app (multi-stage); only the reverse proxy is public; migrations run once before new containers start; daily database backups with a tested restore.

---

## 21. Deliberately left out (and when to add it)

| Left out | Add when |
| --- | --- |
| Multi-tenancy, RLS, plans, billing, operator console | The agent becomes a product for other users (ADR; `owner_user_id` already eases the move). |
| Separate `scheduler` app | The worker runs as more than one instance and schedule registration must be single-instance. |
| `ui`, `queue`, `i18n`, `storage`, `utils` packages | A second consumer needs the shared code. |
| Financial ledger, money package | Never for this product; LLM cost is a simple integer counter. |
| Public marketing site | The project gets a public landing page. |
| Microservices, Kubernetes, GraphQL, WebSockets | A measured need is recorded in an ADR (SSE covers streaming). |
| Autopilot publishing | Evals show stable quality and an ADR sets limits. |
| Mail catcher in local infra | Email features arrive. |

---

## 22. Gate checklist for every change

- [ ] Plan approved; decisions recorded.
- [ ] Typecheck, lint and format pass with zero warnings.
- [ ] Tests pass; new behaviour has tests; coverage thresholds hold; test count reported.
- [ ] Schema changes: migration generated, no drift, constraint names checked.
- [ ] Boundaries pass; no new cycles.
- [ ] OpenAPI and typed client regenerated.
- [ ] Prompt or model changes: new prompt version and evals compared with the baseline.
- [ ] Write actions go through pending actions and approval.
- [ ] No prompts, chat text or personal data in logs; no secrets anywhere.
- [ ] Docs updated in the same change.
- [ ] Report lists what ran, decisions made, and anything noticed but not fixed.
