# ADR-0002: Right-sized modular monorepo

| | |
| --- | --- |
| Status | Accepted |
| Date | 2026-11-10 |

## Context

Khadim needs a web UI, an HTTP API with streaming and webhooks, and long-running background work (schedules, publishing, ingestion). The API and the worker both run the agent, and the web app and API share request and response types.

## Decision

A pnpm + Turborepo monorepo with exactly these workspaces:

- Apps: `web` (Next.js BFF), `api` (Express 5), `worker` (BullMQ; also registers repeatable schedules).
- Packages: `core` (all business and agent logic, ports), `integrations` (vendor adapters), `db` (Drizzle, migrations), `contracts` (Zod schemas, OpenAPI), `config` (tooling presets).

No other app or package is created until a second consumer needs it; it is proposed in a plan first. Boundaries are enforced by dependency-cruiser (conventions §5.3).

## Alternatives considered

- **Single backend service without a monorepo:** simpler, but sharing types with a separate Next.js app becomes manual and drifts.
- **Full SaaS layout** (separate scheduler app, `ui`, `queue`, `i18n`, `storage`, `utils` packages): rejected as premature.
- **Microservices:** rejected; no scaling or team need.

## Consequences

- Shared types and one toolchain across all code.
- `integrations` keeps vendor SDKs out of `core`, so core stays unit-testable with fakes.
- A separate scheduler app becomes necessary only when the worker runs as more than one instance.
