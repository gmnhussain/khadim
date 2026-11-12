# Implementation plans

**One plan per phase or significant change, written and approved before code (conventions §2.2).**

| Plan | Status |
| --- | --- |
| [phase-0-foundation.md](phase-0-foundation.md) | Done |
| [foundation-review.md](foundation-review.md) | Done 2026-11-12 |
| [phase-1-agent-core.md](phase-1-agent-core.md) | Re-approved 2026-11-12; slice 1a done 2026-11-12; the 1b plan is next |
| [phase-1a-review-fixes.md](phase-1a-review-fixes.md) | Approved 2026-11-12; slices 1 and 2 done 2026-11-12; slice 3 next |

## Template

Rules: conventions §4.2. When a plan is done, mark it "Done <date>" and move decisions worth keeping into an ADR or spec.

```markdown
# Plan: <name>

**One sentence on the outcome.**

| | |
| --- | --- |
| Status | Draft / Approved <date> / Done <date> |
| Phase | n |

## Goal and scope (and what is not in scope)

## Increments

### 1. <Name>

- Scope: schema · contracts · core · api · worker · web · integrations · tests · docs (only the layers it touches)
- Copy from: <reference module files>
- Tests: <what proves it>
- Gate: format, lint, typecheck, tests (<count>), depcruise, build pass before the next increment

## Decisions

| Id | Decision | Options | Recommendation | Owner answer |

## Verification (commands that must pass, test count)

## Risks and pitfalls (P-xx)
```
