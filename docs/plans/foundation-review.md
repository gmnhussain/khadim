# Plan: Apply the foundation review

**Adopt the review findings that Phase 1a needs or that tooling enforces today, before 1a code starts; write the rest into the phase plan that builds the code it governs, so nothing is lost, nothing is a stub, and the conventions do not grow with rules for code that does not exist.**

| | |
| --- | --- |
| Status | Done 2026-11-12. Approved by the owner, 2026-11-11 (revision 2); decisions as recommended, each now recorded in its home: D-1 in ADR-0016; D-2 in conventions §18 (unchanged); D-3 in background jobs; D-4 in conventions §10.3; D-5 in conventions §4.2; D-6, D-7 and D-8 in the PRD's Phase 2 and 3 rows and conventions §15.9; D-9 in `pnpm-workspace.yaml` and conventions §6; D-10 in the phase-1 plan (1d carry-over); D-12 in security and the phase-1 plan (1d); D-11 in conventions §3.1 |
| Phase | Between 0 and 1a, on branch `chore/apply-foundation-review` |
| Sources | The SaaS Engineering Standard and the building-saas repository (both the owner's own work), a review of this repository, and a second review of revision 1 of this plan |

## Goal and scope

In scope:

- The coding standard Phase 1a needs: TypeScript style, naming, comments, domain errors, unit test style and the reference module for core code.
- Tooling that enforces it: ESLint, tsconfig, the Vitest coverage gate, `minimumReleaseAge`.
- No AI attribution in git history.
- Repository hygiene, working rules and documentation rules.
- Scheduling every other finding into the phase plan that builds its code.

Not in scope:

- Application code (conventions §2.3: no half features).
- Rules for layers 1a does not touch: repositories, API, app bootstrap, caching, database, frontend. They are written into the 1b plan, from 1a's real code, and approved before 1b code starts ([Scheduled items](#scheduled-items)).
- Multi-tenancy, plans, billing, the operator console, the money package and marketing-site rules (conventions §21).

## Slices

One commit per slice, in this order, each passing every check under [Verification](#verification). Work stops after each slice for review. Slices 1–3 come before 1a code; slices 4–5 may follow it if time is short; slice 6 is the last step before 1a starts.

### 1. No AI attribution in git history

| File | Change |
| --- | --- |
| `AGENTS.md` | New "Git authorship" section: commits use the configured `user.name` and `user.email`; never change git config, `--author` or the committer; **no AI attribution** (no `Co-Authored-By` trailers for AI tools, no "Generated with/by" lines, no robot emoji) in commits, branches, tags, PR titles and descriptions, or code comments; naming a tool as the subject of a change is fine ("add Anthropic adapter"); never `--no-verify` |
| `docs/development/conventions.md` | §3.1 Authorship (the rules above, MUST); §22 checklist item "No AI attribution anywhere" |
| `.githooks/commit-msg` | Reject attribution forms before commitlint runs: AI `Co-Authored-By` trailers, "generated with/by" followed by an AI tool, the Anthropic noreply address, the robot emoji. A bare tool name passes (P-4) |
| `.github/workflows/ci.yml` | On pull requests, run the same pattern over every commit message in the range and fail on a match |
| `.github/pull_request_template.md` | Checklist item "No AI attribution in commits, title or description" |
| `.claude/settings.json` | Project setting that turns off Claude Code's commit and PR attribution (D-11). The exact key is confirmed in the installed version's docs before it is written |

### 2. Tooling

| File | Change |
| --- | --- |
| `pnpm-workspace.yaml` | `minimumReleaseAge` of two weeks. Commented exclusions, each with the date it can be removed, for the approved versions still inside the window on 2026-11-11: `eslint` 10.14.0 (released 2026-10-30), `typescript-eslint` 8.72.2 (2026-11-09), `eslint-plugin-import-x` 4.18.1 (2026-11-09), `dependency-cruiser` 18.7.2 (2026-11-02), `globals` 17.14.0 (2026-11-01); and for 1a's additions `vitest` 5.1.0 (2026-11-02) and `msw` 3.0.4 (2026-11-06). Every pinned or held-back version carries a comment saying why |
| `pnpm-workspace.yaml`, `packages/config/package.json` | Add `eslint-plugin-turbo` to the catalog (D-9; 2.11.10, released 2026-10-20, accepts ESLint 10) |
| `packages/config/tsconfig/base.json` | Add `noUncheckedSideEffectImports` and `"types": []` (Node types come from `node.json`) |
| `packages/config/tsconfig/test.json` | New preset for test files, typechecked separately (conventions §6) |
| `packages/config/eslint/base.mjs` | Add `restrict-template-expressions` (`allowNumber`), `no-unused-vars` with `^_` patterns, `import-x/no-duplicates`, `no-else-return`, `prefer-object-has-own`, `turbo/no-undeclared-env-vars` |
| `packages/config/vitest/index.mjs` | `unit` and `integration` projects in one config; per-file 100% coverage threshold on `src/**/*.rules.ts`. `passWithNoTests` only until 1a's first tests exist; the 1a plan removes it |
| `.github/workflows/ci.yml` | `TURBO_TELEMETRY_DISABLED` and `NEXT_TELEMETRY_DISABLED` |
| `docs/development/conventions.md` | §6 rows updated to match; lockfile rule: when an install moves unrelated versions, restore the lockfile and re-add only your lines |

> **Implementation note (2026-11-11):** pnpm 10.34.9 applies `minimumReleaseAge` to new resolutions only, so the versions already locked (`eslint`, `typescript-eslint`, `eslint-plugin-import-x`, `dependency-cruiser`, `globals`) need no exclusion. Probing `pnpm add` showed what does: the `unrs-resolver` 1.13.0 platform binaries and `conventional-commits-parser` 7.1.4 (re-resolved by any add), the Vitest 5.1.0 and MSW 3.0.4 families for 1a, and `@typescript-eslint/utils` 8.72.2. Each is an exact `name@version` with its removal date in `pnpm-workspace.yaml`.

### 3. Coding standard for core

All in `docs/development/conventions.md`. These are the rules 1a code follows.

- **§7 TypeScript:**
  - `satisfies` to check a literal while keeping its narrow type.
  - `Record<Union, X>` lookups, so a new union member fails to compile.
  - `readonly T[]` parameters.
  - `Object.hasOwn` before indexing an object with request or model-supplied keys.
  - Conditional spreads instead of `undefined` for `exactOptionalPropertyTypes`.
  - `catch` errors are `unknown` and narrowed before use.
  - Numeric separators in long literals (`5_000`).
  - Impossible states throw a plain `Error` with a clear message.
  - Function declarations for exported factories, rules, components and handlers; `const` arrows for local helpers.
- **§8 naming:**
  - `xById` maps and `xSet` sets.
  - `assertX` throws; `resolveX` returns a result.
  - `<Component>Props` for props types.
  - A leading underscore for unused parameters.
  - Constant objects used as enums: PascalCase object, UPPER_SNAKE keys.
  - `ReturnType<typeof create…>` for factory types.
- **§9 comments:** pinned versions and config files say why; workarounds are explained where they happen.
- **§12 domain errors** (1a writes `agent.errors.ts` and the LLM error mapping):
  - A module's error carries a problem from a closed union, with a message map and, where it applies, a field map.
  - Pure rules return a problem; the service turns it into the error.
  - Adapters map vendor errors to core problem codes and never leak vendor types.
- **§19 unit tests:**
  - Pure rules are tested at exact boundaries (0, the limit, the limit + 1, the price-tier boundary).
  - Schema tests use `safeParse` and assert the specific issue code.
  - Services are tested with injected fakes, never `vi.mock` on own modules.
  - Test names cite rules (already in §19).
- **§2.1 and §10 reference module:** `packages/core/src/tools` is the reference for core code (D-4). Built first in 1a to every rule above, then copied for `llm` and `agent`. Full-stack templates (table, repository, controller, routes) come from the first database-backed module in 1b.

### 4. Repository hygiene and agent context

| File | Change |
| --- | --- |
| `.gitignore`, `.ignore`, `.cursorindexingignore` | Hide `reference/` (local copies of other repositories) |
| `AGENTS.md` | "Parked: `reference/`": never read, search or follow it unless the prompt names it; not a source of truth |
| `.claude/settings.json` | Deny agent reads of `.env*` (except `.env.example`), `*.pem`, `*.key` and credential files |
| `docs/development/conventions.md` | §4.8 agent instruction files: `AGENTS.md` is canonical; `CLAUDE.md` imports it; nested `AGENTS.md` only for app-specific or framework-generated blocks, which are committed; scoped rule files in `.claude/rules/` are added with the code they govern (first with 1b), point to conventions sections by path and never copy them; parked code; secrets blocked from AI tools |

### 5. Working rules, documentation rules and settled decisions

All in `docs/development/conventions.md` unless named.

- **§2.1:**
  - An open question that has an industry, legal or regional standard answer is decided by that standard, stated in the plan as a decision and recorded; product choices go to the owner.
  - Read the docs bundled with fast-moving packages before writing code.
  - `AGENTS.md` "Never guess a rule" becomes "Never guess a product rule: ask the owner. A question with a standard answer is decided by that standard and recorded".
- **§2.3:** never change existing behaviour as a side effect; when shared code changes, prove its existing consumers are unchanged.
- **§2.4:** use a git worktree for another branch; check a port before starting a server and free it afterwards.
- **§2.5:** report conflicts between a proposal and the code or docs; when both options are standard, keep the current one.
- **§4.2:**
  - Precedence: shared docs govern shared concerns, and feature docs never contradict them. Section numbers are stable. Change the doc before the code.
  - Env variable hygiene: a new variable goes into the env schema, `.env.example` with a comment, `operations/environments.md` and the secret store in the same change.
  - Plans: increments, each with scope, files to copy from, tests and its own gate; marked "Done <date>"; kept decisions move to an ADR or spec.
- **`docs/decisions/README.md`:**
  - ADR template for **new** ADRs: Status, Date, Context, Decision (numbered rules), Alternatives considered (table with "Why not"), Consequences, Related. Accepted ADRs are not reformatted.
  - Amendment policy (D-5): a small clarification is a dated amendment section at the end; a changed decision is a new ADR.
- **New `docs/development/pitfalls.md`**, linked from conventions and `AGENTS.md`. The known pitfalls that apply to Khadim:
  - drizzle-kit rename prompts
  - 63-character identifiers
  - raw SQL with bare table names
  - Turbopack and source-shipped packages
  - importing a contracts barrel into the browser
  - lockfile drift
  - orphaned ports
  - prototype keys
  - mixed line endings
  - content in logs
  - extending registered OpenAPI schemas
  - BullMQ job-id characters
  - `exactOptionalPropertyTypes`
  - pg returning counts as strings
- **One line now:** "No caching by default; a cache needs a measured need and an approved plan". The full caching rules come with the 1b plan.
- **§15.9:** error tracking is added when production exists (D-8); until then, logs only.
- **ADR-0016 accepted (D-1):** status lines in ADR-0015, ADR-0016 and the index; ADR-0016's consequences applied to `deployment.md` and `security.md`.
- **Sign-in protection settled now (D-12),** because `security.md` already plans lockout tests:
  - per-address throttling plus TOTP;
  - no hard lockout of the owner's account;
  - the sign-in limiter fails closed when Redis is down.
  - The `security.md` rows change to match; the full controls go into ADR-0017 with the 1d plan.
- **`docs/architecture/background-jobs.md`:** job definitions live in `core/src/shared/jobs` (D-3).

### 6. Phase plans

| File | Change |
| --- | --- |
| `docs/plans/phase-1-agent-core.md` | Add the [scheduled items](#scheduled-items) to 1a, 1b and 1d. This changes an approved plan, so the owner re-approves it before 1a starts |
| `docs/product/prd.md` | Phase 3 row: release pipeline and production operations |
| `docs/plans/README.md` | This plan's status |

## Scheduled items

Written into the named plan, approved with it, and built with the code that needs them, never as stubs.

| Item | Plan |
| --- | --- |
| Reference module `core/src/tools` built to every slice 3 rule; remove `passWithNoTests` | 1a |
| Open decision for the 1a plan: who retries a model call, the provider SDK or the adapter, never both. Official SDKs retry by default, and conventions §15.2 also requires retries with backoff, so both together would double the retries | 1a |
| Each package's `test:unit` script runs `vitest run --project unit --coverage`, so the 100% gate on `*.rules.ts` fires in every `pnpm test` and in CI; `test:integration` runs `vitest run --project integration` | 1a |
| Backend standard written from 1a's code: service and repository patterns, app bootstrap and env secret strength, logging with `requestId` and `runId`, process lifecycle, API details (idempotency semantics, status codes and check order, sorting, search, static routes, one-time secrets, shared Zod field helpers, OpenAPI with Scalar and `openapi:check`), the shared problem-code catalogue and central error handler | 1b |
| Database standard: write-once and immutable columns, grants (no `DELETE` except owner-deletable memory), custom security migrations, pool sizing, data-move rehearsal, `purpose` lookups, key-value settings | 1b |
| Caching and performance rules | 1b |
| Frontend standard: `server-only`, no `NEXT_PUBLIC_*` in the BFF, cheap `proxy.ts`, `FormFailure` and `useFormAction`, out-of-order guards, `*.client.ts` storage helpers, `docs/design/` | 1b |
| Code templates (contract, table, repository, service, controller, routes, tests) and an implementer prompt, from the first database-backed module | 1b |
| Scoped rule files `.claude/rules/api`, `database`, `ui` | 1b |
| How the web app reads the socket peer address in the installed Next.js version, before the `loopback` and `tailscale` gates are built; an alternative if it cannot be read reliably (ADR-0016) | 1b |
| Job definitions (`defineJob` with Zod payloads and tests) in `core/src/shared/jobs` | 1b |
| API HTTP helpers: problem, domain problem, idempotent response, versioned response, `Location`, page response, client details, CSRF origin middleware | 1b |
| Test-database helpers: Testcontainers with the real roles script, migrations apply cleanly and are idempotent, upgrade tests against a database with rows; integration tests refuse a database whose name lacks `test` | 1b |
| CI split into parallel jobs (checks, integration, migrations, audit, commits; e2e later); coverage gate; migration drift check; caches for `.turbo` and `.next/cache` | 1b |
| Web patterns: form failure mapping, a tested `proxy.ts`, `instrumentation.ts`, `server-env.ts` | 1b |
| ADR-0017, owner account protection, written against the Better Auth version installed then: recovery codes, session list and revoke, sign-in protection per D-12 (confirm the installed Better Auth can count wrong TOTP codes toward the throttle, or propose an alternative; throttle by the trusted client address, never by the proxy's), step-up per D-10, CSRF `Origin` check and Server Actions `allowedOrigins`, secret rotation, `trust proxy` CIDRs, Permissions-Policy, COOP and CORP, upload checks by magic bytes and size, redirect and OAuth callback allowlist, rate limiters (sign-in fails closed; others fail open) | 1d |
| e2e: own servers, user and client address per test, failure on CSP violations and console errors, locating by role and label; specs for security headers, session renewal, two tabs | 1d |
| Hybrid search (full-text and vector) for memory retrieval (D-7) | 2 |
| Release pipeline: images built once and tagged with the commit, SBOM, provenance, vulnerability scan, staging then production behind approval, health check after deploy | 3 |
| Production operations: one multi-target Dockerfile, strict `.dockerignore`, reverse proxy, server hardening, backups with point-in-time recovery, restore test and its frequency (D-6), heartbeats, disk check, error tracking with a scrubber (D-8), `operations/monitoring.md`, runbook template (Signals · Triage · Safe to retry? · Afterwards) | 3 |

## Decisions

| Id | Decision | Options | Recommendation | Owner answer |
| --- | --- | --- | --- | --- |
| D-1 | ADR-0016 (`loopback` gate only without a proxy) | Accept / reject | Accept: a same-host proxy always arrives from `127.0.0.1` | Accepted, 2026-11-11 |
| D-2 | When i18n (next-intl) starts | From the first page / when the Bangla UI is added (current conventions §18) | Keep the current rule unless a Bangla UI is planned soon | Accepted, 2026-11-11 |
| D-3 | Home of job definitions | `core/src/shared/jobs` / a new package | `core/src/shared/jobs` | Accepted, 2026-11-11 |
| D-4 | Reference module | `core/src/tools` for core code; full-stack templates from 1b's first database module | As stated | Accepted, 2026-11-11 |
| D-5 | Changing an accepted ADR | Supersede only / dated amendment for clarifications, new ADR for changed decisions | Dated amendments for clarifications | Accepted, 2026-11-11 |
| D-6 | Backup restore test frequency | Decide now / in the Phase 3 plan | Phase 3: nothing to restore before production | Accepted, 2026-11-11 |
| D-7 | Memory retrieval | Vector only / hybrid | Decide in the Phase 2 plan with ADR-0008; hybrid recommended | Accepted, 2026-11-11 |
| D-8 | Error tracker | Now / when production exists | When production exists; logs only until then | Accepted, 2026-11-11 |
| D-9 | `eslint-plugin-turbo` (new dev dependency) | Add / skip | Add: catches env variables missing from Turbo inputs | Accepted, 2026-11-11 |
| D-10 | Step-up (fresh TOTP) | Every approval / connection changes, plus a time window for approvals / none | Connection changes always; approvals within a time window. Built in 1d | Accepted, 2026-11-11 |
| D-11 | Turning off Claude Code attribution | Project `.claude/settings.json` / owner's user settings | Project settings; other tools need their own settings | Accepted, 2026-11-11 |
| D-12 | Sign-in protection | Hard lockout / per-address throttling plus TOTP | Per-address throttling plus TOTP; the sign-in limiter fails closed | Accepted, 2026-11-11 |

## Verification

After every slice: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (report the test count), `pnpm depcruise`, `pnpm build`, `pnpm audit --prod`.

- **Slice 1:** a message with an AI `Co-Authored-By` trailer is rejected; "feat(llm): add anthropic adapter" passes.
- **Slice 2:**
  - `pnpm install --frozen-lockfile` passes with `minimumReleaseAge` on.
  - A rules file below 100% coverage fails the test run (shown with a throwaway file that is then deleted).

## Risks and pitfalls

| Id | Pitfall | Mitigation |
| --- | --- | --- |
| P-1 | Conventions grow too long for agents to read every session | Only rules 1a needs land now; pitfalls go in their own file; later rules come with the plan that needs them |
| P-2 | New ESLint rules or tsconfig flags fail on existing files | Fix the files in the same slice; never weaken a rule to pass |
| P-3 | `minimumReleaseAge` blocks a needed security patch, or an exclusion is forgotten | Every exclusion has a removal date in its comment; a security patch gets a commented exclusion until it passes the window |
| P-4 | The hook rejects a legitimate message that names a tool | The pattern matches attribution forms only, never a bare tool name; slice 1 proves both cases |
| P-5 | Rules from a multi-tenant standard bring in tenancy concepts | Each rule is checked against conventions §21 before it lands |
| P-6 | Deferred items are forgotten | Slice 6 writes each into its phase plan, which is approved before that phase's code |
