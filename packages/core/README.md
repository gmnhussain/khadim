# @khadim/core

**All business and agent logic: the agent loop, tools, memory, social, approvals, schedules and connections. Defines the ports that adapters implement. Built from Phase 1.**

- Module layout and rules: conventions §5.2 and §10.
- Never imports vendor SDKs, `integrations` or transport libraries (§5.3, enforced by dependency-cruiser).
- Repositories use Drizzle and `@khadim/db` directly; persistence has no port (ADR-0012).
- Modules import each other only through their `index.ts`.

Built so far (Phase 1a): `shared` (errors, ids, clock) and `tools`, the reference module for core code (conventions §10.3): types, errors, pure policy rules, `defineTool`, the registry, `get_current_time` and test fakes; and `llm`: the `LlmProvider` port, provider-neutral types, errors, the retry, usage and routing rules, the model registry and `FakeLlmProvider`; and `agent`: the tool-calling loop (`runAgent`), its pure rules, the context builder and the versioned system prompt. Slice 1a is done (2026-11-12); the other modules arrive with their phases ([plan](../../docs/plans/phase-1-agent-core.md#increments)). Rules, problem codes and acceptance criteria: [agent feature doc](../../docs/product/features/agent.md).

| Script | Does |
| --- | --- |
| `pnpm --filter @khadim/core lint` | ESLint with zero warnings |
| `pnpm --filter @khadim/core typecheck` | `tsc` on source, then on tests with the test preset |
| `pnpm --filter @khadim/core test:unit` | Unit tests with coverage; a `*.rules.ts` file below 100% fails the run |
