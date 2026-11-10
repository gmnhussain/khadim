# ADR-0014: Unclassified tools are never offered to the model

| | |
| --- | --- |
| Status | Accepted |
| Date | 2026-11-10 |
| Relates to | Extends ADR-0011 (tool effect tiers and policy) |

## Context

ADR-0011 says a tool whose tier is unknown "is treated as `external`", which means it could still be offered to the model under the `approve` policy. The conventions (§15.4) and the agent design say an MCP tool is disabled until the owner gives it a tier and a policy. The two readings differ: under the first, a new or re-described (possibly poisoned) MCP tool can reach the model and create pending actions without the owner opting in.

## Decision

- A tool without an owner-assigned effect tier and policy is **never offered to the model**. The tool registry rejects it, whatever its source.
- For MCP tools, "classified" means the owner has given the tool a tier and a policy and approved its pinned description. A changed description makes the tool unclassified again until re-approved.
- `external` is the assumed tier only inside validation and policy checks that meet an unknown tool name (for example, a policy entry naming a tool that no source provides). There it applies the strictest floor; it never makes the tool available.

## Alternatives considered

- **Offer unclassified tools under `approve`:** every call would still need approval, but the model would see tool descriptions the owner never reviewed, which is the tool-poisoning path.

## Consequences

- Adding a tool source cannot widen what the model sees until the owner acts.
- Tests: the registry rejects a tool without a tier; an MCP tool with a changed description disappears from the model's tool list.
