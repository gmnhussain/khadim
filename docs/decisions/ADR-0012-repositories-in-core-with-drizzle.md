# ADR-0012: Repositories live in core and use Drizzle directly

| | |
| --- | --- |
| Status | Accepted |
| Date | 2026-11-10 |

## Context

Core follows ports and adapters: LLM providers, embedders, social platforms, channels and notification senders sit behind ports, with adapters in `packages/integrations`, so core never depends on a vendor. Strict ports and adapters would also put persistence behind repository ports, with Drizzle implementations outside core.

Khadim has one database (PostgreSQL) by design (conventions §1, "Boring technology"). Its services need transactions that span several tables at once: a state change, its audit row and its outbox event. A persistence port would double the code and make those transactions awkward, while protecting against a database switch that is not planned.

## Decision

- Repositories (`*.repository.ts`) live in their core module and use Drizzle and the schema from `@khadim/db` directly. They receive the transaction (`tx`) from the service.
- `drizzle-orm` is the one persistence library core may import. Every other vendor stays behind a port (enforced by the core allowlist in dependency-cruiser).
- There is no separate repository port. When code must be unit-tested without a database (the agent loop), it receives the repository as an injected dependency typed from the repository itself (`ReturnType<typeof createAgentRunRepository>`), so a test can pass an in-memory fake.
- Repositories hold queries only: no business rules, HTTP or Redis (conventions §10.1).

## Alternatives considered

- **Repository ports in core, Drizzle adapters elsewhere:** pure, but doubles the persistence code, splits each transaction across a port boundary, and buys a database switch Khadim does not plan.
- **Raw SQL in core:** no ORM dependency, but loses the typed schema and `$inferSelect` types the standard relies on.
- **Another ORM (Prisma):** generated client and its own migration engine; Drizzle is already the standard's choice and stays closer to SQL.

## Consequences

- Core depends on `drizzle-orm` and `@khadim/db`. Changing the ORM or database would touch core; this is accepted.
- Services that use repositories are tested with integration tests against PostgreSQL in Testcontainers; pure rules and the loop stay unit-tested.
- Transactions that include audit and outbox writes stay simple: one `tx` passed through.
