# Khadim

**A personal AI assistant agent: chat grounded in your own memory, and career posts for LinkedIn and a Facebook Page, published only after you approve.**

Khadim is also a learning project for building production-quality AI agents with industry-standard practices: a hand-built tool-calling loop, retrieval, human-in-the-loop approvals, evals and full observability.

> **Status:** Phase 0 complete (docs foundation and monorepo scaffold). Application code starts in Phase 1.

## Structure

```text
khadim/
├── apps/
│   ├── web/            Next.js web app and BFF (Phase 1)
│   ├── api/            Express 5 API, SSE, webhooks (Phase 1)
│   └── worker/         BullMQ jobs and schedules (Phase 1)
├── packages/
│   ├── core/           business and agent logic, ports
│   ├── integrations/   Anthropic, embeddings, LinkedIn, Facebook adapters
│   ├── db/             Drizzle schema and migrations
│   ├── contracts/      shared Zod schemas, OpenAPI
│   └── config/         TypeScript, ESLint, Prettier, Vitest presets, ports
├── e2e/                Playwright specs
├── evals/              agent quality evaluations
├── infra/              docker compose: PostgreSQL 18 + pgvector, Redis
└── docs/               product, architecture, decisions, plans, development, operations
```

## Getting started

Prerequisites: Node.js 24 LTS, Git, Docker Desktop. Full steps: [setup](docs/development/setup.md).

```bash
git init
corepack enable
pnpm install
cp infra/.env.example infra/.env
pnpm infra:up
pnpm lint && pnpm typecheck && pnpm build
```

## Scripts

| Script | Does |
| --- | --- |
| `pnpm dev` | Run all apps in watch mode |
| `pnpm build` | Build everything |
| `pnpm lint` | ESLint with zero warnings allowed |
| `pnpm typecheck` | TypeScript checks |
| `pnpm test` · `test:unit` · `test:integration` | Tests |
| `pnpm format` · `format:check` | Prettier |
| `pnpm depcruise` | Architecture boundary checks |
| `pnpm infra:up` · `infra:down` | Local PostgreSQL and Redis |

Scripts for e2e, evals, OpenAPI and database migrations are added in the phase that introduces them.

## Local ports

| Service | Port |
| --- | --- |
| Web | 3100 |
| API | 4100 |
| PostgreSQL | 55432 |
| Redis | 56379 |

## Documentation

- [Docs map](docs/README.md)
- [Product requirements](docs/product/prd.md)
- [Architecture overview](docs/architecture/overview.md)
- [Engineering standard](docs/development/conventions.md)
- [Decisions](docs/decisions/README.md)
