# @khadim/core

**All business and agent logic: the agent loop, tools, memory, social, approvals, schedules and connections. Defines the ports that adapters implement. Built from Phase 1.**

- Module layout and rules: conventions §5.2 and §10.
- Never imports vendor SDKs, `integrations` or transport libraries (§5.3, enforced by dependency-cruiser).
- Repositories use Drizzle and `@khadim/db` directly; persistence has no port (ADR-0012).
- Modules import each other only through their `index.ts`.

Not built yet: this folder holds only this README until its phase (conventions §2.3).
