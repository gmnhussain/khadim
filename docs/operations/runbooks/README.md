# Runbooks

**Step-by-step responses to known incidents. A runbook is added when its failure mode becomes possible.**

| Runbook | Covers | Added in |
| --- | --- | --- |
| `llm-provider-outage.md` | Model API errors or rate limits; runs failing with `LLM_UNAVAILABLE` | Phase 1 |
| `budget-exceeded.md` | Daily budget reached; scheduled runs paused | Phase 1 |
| `platform-token-expired.md` | LinkedIn or Facebook connection expired or revoked | Phase 3 |
| `duplicate-or-failed-publish.md` | A post failed or appears twice | Phase 3 |
| `dead-letter-jobs.md` | Jobs in the dead-letter queue | Phase 1 |

## Template

```markdown
# <Incident>

**One sentence: what is wrong and who notices.**

## Symptoms
## Check
## Fix
## Prevent
```
