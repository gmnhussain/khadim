# Documentation

**Map of Khadim's documentation. Docs are the source of truth: behaviour is written here first, code implements it, tests prove it.**

| Area | Document | Answers |
| --- | --- | --- |
| Product | [prd.md](product/prd.md) | What Khadim does, for whom, scope by phase |
| | [glossary.md](product/glossary.md) | What each domain term means and its code name |
| | [business-rules.md](product/business-rules.md) | Numbered rules (BR-xx) the code must follow |
| | [features/](product/features/README.md) | Per-module behaviour and acceptance criteria |
| Architecture | [overview.md](architecture/overview.md) | System shape, tech choices, what is not used |
| | [agent.md](architecture/agent.md) | Run lifecycle, loop, tools, memory, approvals |
| | [data-model.md](architecture/data-model.md) | Planned tables and relationships |
| | [background-jobs.md](architecture/background-jobs.md) | Queues, outbox, schedules |
| | [channels.md](architecture/channels.md) | How the owner and Khadim talk: channels and notifications |
| Decisions | [decisions/](decisions/README.md) | Architecture decision records (ADRs) |
| Plans | [plans/](plans/README.md) | Implementation plans per phase |
| Development | [setup.md](development/setup.md) | Getting a working local environment |
| | [conventions.md](development/conventions.md) | The binding engineering standard |
| | [testing.md](development/testing.md) | Test levels, commands, fakes |
| Operations | [environments.md](operations/environments.md) | Environments and configuration |
| | [deployment.md](operations/deployment.md) | How Khadim is deployed |
| | [runbooks/](operations/runbooks/README.md) | What to do when something breaks |
| Security | [security.md](security.md) | Controls and the test that proves each |

## Conventions for docs

- Each fact has one home; others link to it.
- Every doc opens with one bold summary sentence.
- Unknowns are marked `> **Open question:**`; chosen-for-now answers `> **Default:**`.
- Ids: `BR-xx` business rule, `D-xx` plan decision, `P-xx` pitfall, `E-xx` eval case, `G-n` PRD goal, `ADR-NNNN` decision.
