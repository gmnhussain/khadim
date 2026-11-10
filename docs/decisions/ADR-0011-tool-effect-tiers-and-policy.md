# ADR-0011: Tool effect tiers and per-tool policy

| | |
| --- | --- |
| Status | Accepted |
| Date | 2026-11-10 |
| Relates to | Extends ADR-0006 (human approval); works with ADR-0010 (resumable runs) |

## Context

ADR-0006 split tools in two with an `isWrite` flag: write tools create a pending action, everything else runs freely. That fits posting and replying. Khadim is meant to grow into a general assistant with tools that change its own state (save a memory, create a schedule, write a working file) and, later, tools from MCP servers. Treating all of those like a public post would make every chat stop for approval; treating them like reads would give the model unchecked agency. A single boolean cannot express the difference.

## Decision

### 1. Every tool declares an effect tier

| Tier | Meaning | Examples |
| --- | --- | --- |
| `read` | Reads data; changes nothing | `get_current_time`, `search_memory`, `get_post_history` |
| `local_write` | Changes Khadim's own state only; reversible by the owner | `remember_fact`, a future `create_schedule` |
| `external` | Has an effect outside Khadim | `publish_post`, `reply_to_comment`, a future `send_email` |

`ToolDefinition` replaces `isWrite` with `effect: "read" | "local_write" | "external"`. A tool whose tier is unknown (for example an MCP tool not yet classified) is treated as `external`.

### 2. Every tool has a policy

| Policy | Behaviour | Allowed for |
| --- | --- | --- |
| `auto` | Execute now; record the tool call | `read`, `local_write` |
| `propose` | Store the effect as a proposal the owner accepts later; the run does not wait | `local_write` |
| `approve` | Create a pending action; the run pauses until it is resolved (ADR-0010) | `local_write`, `external` |

- The tier sets a floor: `external` is always `approve` (BR-02). Raising it to autopilot needs a new ADR (ADR-0006).
- > **Default:** `read` → `auto`; `local_write` → `approve` unless its tool entry says otherwise; `remember_fact` → `propose`.
- The policy also holds limits and bindings: maximum calls per run and per day, and arguments fixed by the run (a reply bound to one comment, BR-64).
- Policies live in configuration next to the model catalog, validated with Zod at startup, and are listed per task so each task gets only the tools it needs. An invalid policy (for example `external` with `auto`) stops the app.

### 3. Execution order

- `read` tool calls in one step may run in parallel.
- `local_write` and `external` tool calls run one at a time, in the order the model asked for them.

## Alternatives considered

- **Keep `isWrite`:** simple, but forces every local change through a blocking approval or none at all.
- **Per-tool policy without tiers:** flexible, but nothing stops a mistake in configuration from auto-running an external effect. The tier floor makes that impossible.
- **Ask the model to judge risk:** never; the model's input can be manipulated (OWASP LLM: excessive agency).

## Consequences

- Earlier docs that say "write tool" mean a tool whose policy is `approve`.
- Pending actions also cover `local_write` tools with the `approve` policy; proposals (`propose`) are stored by the owning module, for example `memory_facts` with status `proposed`.
- Adding a tool means choosing its tier and policy, and a test proves the floor holds.
- Tools from new sources (MCP) fit the same model without changing the loop.
