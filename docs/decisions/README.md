# Architecture decision records

**Hard-to-reverse choices and why they were made. Accepted ADRs are never edited except their status line; a new ADR supersedes or extends them.**

| ADR | Title | Status |
| --- | --- | --- |
| [0001](ADR-0001-adopt-khadim-engineering-standard.md) | Adopt the Khadim engineering standard | Accepted |
| [0002](ADR-0002-right-sized-modular-monorepo.md) | Right-sized modular monorepo | Accepted |
| [0003](ADR-0003-typescript-express-nextjs-stack.md) | TypeScript with Express and Next.js | Accepted |
| [0004](ADR-0004-stream-chat-with-sse.md) | Stream chat answers with Server-Sent Events | Superseded by ADR-0010 |
| [0005](ADR-0005-hand-built-agent-loop.md) | Hand-built agent loop on the Anthropic SDK | Accepted (extended by ADR-0009) |
| [0006](ADR-0006-human-approval-for-side-effects.md) | Human approval for every external side effect | Accepted (extended by ADR-0011) |
| [0007](ADR-0007-authentication-library.md) | Authentication library and auth only at the edges | Accepted (extended by ADR-0015) |
| [0008](ADR-0008-embedding-provider.md) | Embedding provider | Proposed |
| [0009](ADR-0009-multi-provider-llm-and-embeddings.md) | Multi-provider LLM and embedding adapters | Accepted |
| [0010](ADR-0010-resumable-runs-in-worker.md) | Resumable runs executed in the worker, streamed from Redis Streams | Accepted (extended by ADR-0013) |
| [0011](ADR-0011-tool-effect-tiers-and-policy.md) | Tool effect tiers and per-tool policy | Accepted (extended by ADR-0014) |
| [0012](ADR-0012-repositories-in-core-with-drizzle.md) | Repositories live in core and use Drizzle directly | Accepted |
| [0013](ADR-0013-serialized-resume-and-bounded-run-streams.md) | Serialized, outbox-backed resume and bounded run event streams | Accepted |
| [0014](ADR-0014-unclassified-tools-are-never-offered.md) | Unclassified tools are never offered to the model | Accepted |
| [0015](ADR-0015-private-mode-fails-closed.md) | `private` access mode fails closed | Accepted |

## Template

```markdown
# ADR-NNNN: <Title>

| Status | Proposed / Accepted / Superseded by ADR-NNNN |
| Date | YYYY-MM-DD |

## Context
## Decision
## Alternatives considered
## Consequences
```
