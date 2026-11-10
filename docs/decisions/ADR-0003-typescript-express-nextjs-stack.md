# ADR-0003: TypeScript with Express and Next.js

| | |
| --- | --- |
| Status | Accepted |
| Date | 2026-11-10 |

## Context

Python with FastAPI is common for AI work. The owner's existing standard and experience are in TypeScript with Express and Next.js, and the project needs a web frontend.

## Decision

TypeScript (strict) for all code: Next.js App Router for the web app, Express 5 for the API, BullMQ for jobs, Drizzle for the database, Zod for contracts, and the official Anthropic TypeScript SDK inside the LLM adapter.

## Alternatives considered

- **Python (FastAPI) backend + Next.js frontend:** strong AI ecosystem, but two languages, duplicated types and no reuse of the owner's standard.
- **Next.js only (Route Handlers as the API):** fewer apps, but long-running work and webhooks fit poorly, and it mixes BFF and API concerns.

## Consequences

- One language and one toolchain; contracts shared between web and API.
- Some AI libraries are Python-first; anything needed from that ecosystem is reached through an HTTP service behind a port, decided by a future ADR.
