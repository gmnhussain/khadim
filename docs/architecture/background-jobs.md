# Background jobs and schedules

**All slow or external work runs in `apps/worker` on BullMQ: agent runs from schedules and webhooks, publishing, replies, memory ingestion and maintenance. Rules: conventions §17.**

## Queues and jobs

| Queue | Job | Job id | Triggered by | Phase |
| --- | --- | --- | --- | --- |
| `agent` | `agent.run` | `agent.run.<agentRunId>` | Schedule firing, processed webhook event | 4, 5 |
| `social` | `social.publish-post` | `social.publish.<pendingActionId>` | Approved pending action (outbox) | 3 |
| `social` | `social.reply-comment` | `social.reply.<pendingActionId>` | Approved pending action (outbox) | 5 |
| `social` | `social.process-webhook` | `social.webhook.<webhookEventId>` | Stored webhook event | 5 |
| `memory` | `memory.ingest-document` | `memory.ingest.<documentId>.<version>` | Document uploaded | 2 |
| `maintenance` | `maintenance.relay-outbox` | repeatable | Every few seconds | 1 |
| `maintenance` | `maintenance.check-connection-expiry` | repeatable | Daily | 3 |
| `maintenance` | `maintenance.expire-pending-actions` | repeatable | Every 15 minutes | 3 |
| `maintenance` | `maintenance.purge-idempotency-keys` | repeatable | Daily | 1 |

## Outbox flow

```mermaid
sequenceDiagram
  participant S as Service (API or worker)
  participant DB as PostgreSQL
  participant R as Outbox relay job
  participant Q as BullMQ
  participant W as Job handler
  S->>DB: state change + outbox_events row (one transaction)
  R->>DB: SELECT … FOR UPDATE SKIP LOCKED
  R->>Q: add job with deterministic id
  R->>DB: mark delivered
  Q->>W: run handler (idempotent)
```

A crash between steps only causes a retry; deterministic job ids and idempotent handlers make retries safe.

## Schedules

- Stored in the `schedules` table: cron expression, IANA time zone (default `Asia/Dhaka`), task, settings, enabled.
- The worker syncs schedules to BullMQ repeatable jobs on start and whenever a schedule changes.
- A scheduled post fires ahead of its target time (BR-51) and creates a `draft_post` run; publishing follows approval (BR-52).
- Each occurrence fires once (BR-53): the occurrence time is part of the run's trigger reference, with a unique index.

## Retry policy

| Situation | Behaviour |
| --- | --- |
| Transient error (network, 429, 5xx) | Retry with exponential backoff and jitter. > **Default:** 5 attempts |
| Invalid payload | Fail once; no retry |
| Platform says "already exists" or post id stored | Treat as success |
| Attempts exhausted | Move to the dead-letter queue; mark the work `failed`; notify the owner |

Every handler has a test that runs it twice and checks there is no duplicate effect.
