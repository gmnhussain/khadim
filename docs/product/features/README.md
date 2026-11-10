# Feature docs

**One doc per module describing entities, flows, rules, edge cases and acceptance criteria. Each is written in the plan of the phase that builds the module, before its code.**

| Module | Doc | Phase |
| --- | --- | --- |
| Agent (runs, loop, chat) | `agent.md` | 1 |
| Connections and auth | `connections.md` | 1, 3 |
| Memory | `memory.md` | 2 |
| Social (posts, platforms) | `social.md` | 3 |
| Approvals | `approvals.md` | 3 |
| Schedules | `schedules.md` | 4 |
| Comments | `comments.md` | 5 |

## Template

```markdown
# <Module>

**One sentence on what this module does for the owner.**

## Entities
## Flows (Mermaid)
## Rules (link BR-xx; never restate them)
## Edge cases
## Acceptance criteria (Given / When / Then)
## Open questions
```
