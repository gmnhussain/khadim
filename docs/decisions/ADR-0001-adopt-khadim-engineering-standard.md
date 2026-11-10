# ADR-0001: Adopt the Khadim engineering standard

| | |
| --- | --- |
| Status | Accepted |
| Date | 2026-11-10 |

## Context

The owner follows a detailed SaaS engineering standard in other projects. Khadim is a single-user product and also an LLM agent. Large parts of the SaaS standard (multi-tenancy, plans, billing, operators, financial ledger, public site) solve problems Khadim does not have, while the SaaS standard has no guidance for agent-specific concerns (the loop, tools, prompts, evals, LLM security).

## Decision

Adopt [docs/development/conventions.md](../development/conventions.md) as Khadim's binding standard. It keeps the SaaS standard's working rules, code style, naming, layering, API, error, database, jobs, testing and CI practices; removes the multi-tenant and commercial sections; and adds section 15 (AI agent standards) and section 16 (social integrations).

Out of scope, with the signal for adding each back, as listed in conventions §21:

| Removed | Add back when |
| --- | --- |
| Multi-tenancy, RLS, `tenant_id`, tenant transactions | Khadim serves other users |
| Plans, billing, entitlements, operator console | Khadim becomes a commercial product |
| Money package, financial ledger | Never; LLM cost is an integer counter |
| Public marketing site | A public landing page is needed |
| Separate scheduler app, extra shared packages | A second consumer or instance needs them |

Owned rows keep an `owner_user_id` so a later multi-user change does not need a data rewrite.

## Alternatives considered

- **Apply the SaaS standard unchanged:** rejected; much unused machinery to build and maintain, which slows learning.
- **No written standard:** rejected; the project's purpose is to practise industry-standard engineering.

## Consequences

- One standard governs people and AI coding agents; `AGENTS.md` points to it.
- Re-adding a removed section requires a new ADR.
