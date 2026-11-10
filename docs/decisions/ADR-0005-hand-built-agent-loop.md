# ADR-0005: Hand-built agent loop on the Anthropic SDK

| | |
| --- | --- |
| Status | Accepted (extended by [ADR-0009](ADR-0009-multi-provider-llm-and-embeddings.md): more providers and routing) |
| Date | 2026-11-10 |

## Context

Khadim's first goal is learning how agents work (PRD G-1). Agent frameworks hide the loop, context assembly and tool execution, which are exactly the parts to learn. Provider lock-in should also be avoided.

## Decision

- Build the tool-calling loop, context builder, tool registry and budgets in `packages/core`, without an agent framework.
- Define a provider-neutral `LlmProvider` port (messages, tool definitions, usage). Implement it in `packages/integrations` with the official Anthropic TypeScript SDK.
- Route models by task through configuration (conventions §15.2).
- Use prompt caching and structured outputs where they apply.

## Alternatives considered

- **LangChain.js / LangGraph.js:** fast start, but abstractions hide the mechanics and add churn.
- **Vendor agent SDKs:** powerful managed loops; less learning, more coupling.
- **Vercel AI SDK:** good streaming helpers; may be adopted inside the web app later for UI streaming without owning the loop.

## Consequences

- Full control and understanding of the loop; more code to write and test.
- The fake `LlmProvider` makes the loop fully unit-testable.
- Adopting a framework later is a new ADR; the port keeps that change contained.
