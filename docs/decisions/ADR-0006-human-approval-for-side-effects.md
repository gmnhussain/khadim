# ADR-0006: Human approval for every external side effect

| | |
| --- | --- |
| Status | Accepted (extended by [ADR-0011](ADR-0011-tool-effect-tiers-and-policy.md): effect tiers and per-tool policy) |
| Date | 2026-11-10 |

## Context

Khadim publishes under the owner's name to a professional audience and reads comments written by strangers. Model output can be wrong, off-tone or manipulated by prompt injection. A bad post or reply has real reputational cost.

## Decision

- Tools flagged `isWrite` never act directly; they create a `pending_action` holding the exact payload (BR-02, BR-03).
- The owner approves, edits or rejects in the web app. Approval writes an outbox event in the same transaction; the worker executes with a deterministic job id (BR-04).
- Pending actions expire if not decided (BR-05).
- An autopilot policy per action type may be added later, only by a new ADR, with daily limits and only after evals show stable quality.

## Alternatives considered

- **Fully automatic posting and replies:** rejected for now; unacceptable risk while quality is unmeasured.
- **Approval only for replies:** rejected; posts carry the same reputational risk.

## Consequences

- The owner spends a short time approving each day; Phase 4 drafts scheduled posts early so approval fits before the target time (BR-51).
- Prompt injection through comments cannot cause an unapproved effect.
- Approval UX (inline cards, notifications) becomes an important part of the product.
