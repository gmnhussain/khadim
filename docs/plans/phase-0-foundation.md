# Plan: Phase 0, docs foundation and monorepo scaffold

**A documented, tooled, empty monorepo that later phases fill in without restructuring.**

| | |
| --- | --- |
| Status | Done, awaiting owner review |
| Phase | 0 |

## Goal and scope

In scope: the docs skeleton (conventions §4.1), ADRs, `AGENTS.md`, workspace tooling, shared presets, boundary rules, CI, Dependabot and local infrastructure.

Not in scope: any feature code, routes, tables, stubs or app shells (conventions §2.3). Apps and feature packages are folders containing only `README.md`.

## Changes by layer

| Layer | Change |
| --- | --- |
| Root | `package.json`, `pnpm-workspace.yaml` (catalog), `turbo.json`, `.nvmrc`, `.editorconfig`, `.gitattributes`, `.gitignore`, `.prettierignore`, ESLint and Prettier configs, commitlint config, `.githooks/commit-msg`, `scripts/setup-git-hooks.mjs`, `.dependency-cruiser.cjs`, `.vscode/` recommendations |
| `packages/config` | TypeScript presets (base, node, library), ESLint presets (base, node), Prettier, Vitest options, port map |
| Apps and feature packages | `README.md` each, stating purpose and phase |
| `infra` | Docker Compose: PostgreSQL 18 + pgvector, Redis; `.env.example` |
| CI | GitHub Actions workflow, Dependabot, pull request template |
| Docs | PRD, glossary, business rules, architecture (overview, agent, data model, jobs), ADR-0001 to ADR-0008, setup, testing, security, operations |

## Decisions

| Id | Decision | Chosen | Owner answer |
| --- | --- | --- | --- |
| D-1 | Package scope | `@khadim/*` | |
| D-2 | Node.js version | 24 LTS (`.nvmrc`, `engines`) | |
| D-3 | Package manager | pnpm 10 via Corepack; versions in one catalog | |
| D-4 | Local ports | web 3100, api 4100, PostgreSQL 55432, Redis 56379 | |
| D-5 | Apps in Phase 0 | README only; first app code in Phase 1 | |
| D-6 | Mail catcher in local infra | Left out until email features exist | |
| D-7 | `vector` extension setup | Created by the first migration, not by Docker init scripts | |
| D-8 | Next.js ESLint preset and Tailwind Prettier plugin | Added with `apps/web` in Phase 1 | |
| D-9 | Authentication library | Proposed: Better Auth (ADR-0007) | Needed before Phase 1 |
| D-10 | Embedding provider | Proposed: Voyage AI (ADR-0008) | Needed before Phase 2 |
| D-11 | pnpm settings location | `pnpm-workspace.yaml` (`engineStrict`), no `.npmrc` | |

## Verification

Dependency versions in the catalog use caret ranges and must be confirmed by the first install. Run on the owner's machine:

```bash
git init
corepack enable
pnpm install          # creates pnpm-lock.yaml; commit it
pnpm format:check
pnpm lint
pnpm typecheck
pnpm depcruise
pnpm build
```

Expected: all pass. `typecheck`, `test` and `build` have no workspaces to run yet and succeed with nothing to do. Report any failure with its output; do not weaken a check to make it pass.

## Risks and pitfalls

| Id | Pitfall | Mitigation |
| --- | --- | --- |
| P-1 | A catalog version range does not resolve or a preset API changed | Fix the version or preset on first install; record the change |
| P-2 | Windows line endings break the commit-msg hook | `.gitattributes` forces LF; re-checkout after cloning on Windows if needed |
| P-3 | Docker data volume path changed in PostgreSQL 18 images | Compose mounts `/var/lib/postgresql`, the path the 18 images expect |
| P-4 | The `prepare` script runs before `git init` | The script skips quietly; run `pnpm install` again after `git init` |
