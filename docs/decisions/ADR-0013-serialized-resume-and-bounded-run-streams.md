# ADR-0013: Serialized, outbox-backed resume and bounded run event streams

| | |
| --- | --- |
| Status | Accepted |
| Date | 2026-11-10 |
| Relates to | Extends ADR-0010 (resumable runs, Redis Streams) |

## Context

ADR-0010 says a paused run resumes "when every pending action from the paused step is resolved" and that its events flow through a Redis Stream per run. Review found four gaps:

- Two pending actions of one step can be resolved at the same moment. Each transaction may still see the other as unresolved, so neither enqueues the resume and the run stays in `awaiting_approval` forever.
- The resume job is enqueued after the resolving transaction commits, with no outbox event. A crash or a Redis outage between commit and enqueue loses it.
- It is unclear whether `run.awaiting_approval` ends the SSE response. If it does not, a paused run holds a browser, BFF and API connection plus a Redis read loop for up to the approval window.
- Streams are trimmed only after a run ends. Redis runs with `noeviction`, so unbounded streams of paused or long runs could fill memory and make every write fail, including BullMQ's.

## Decision

### 1. Resolution is serialized on the run

- Every path that resolves a pending action (execution succeeded or failed, rejection, expiry, cancellation) goes through one core function, in one transaction:
  1. lock the run row (`SELECT … FROM agent_runs … FOR UPDATE`);
  2. update the pending action and record its outcome as the tool call's result;
  3. count the step's pending actions that are still unresolved;
  4. if none remain and the run is still `awaiting_approval`, write an `agent.resume-run` outbox event.
- The lock makes concurrent resolutions take turns: the second transaction reads the first one's committed result after it gets the lock, so exactly one of them sees "none remain".
- No resume is written for a run that is no longer `awaiting_approval` (for example, cancelled).

### 2. Resume goes through the outbox

- The outbox event from §1 is the source of truth. After commit, the service may also enqueue the job directly to save the relay's polling delay; the deterministic job id `agent.resume.<agentRunId>.<stepIndex>` makes the second enqueue a no-op (conventions §17).
- The resume job moves the run to `running` with a guarded update (`WHERE status = 'awaiting_approval'`). If no row changes, the job ends without doing anything.

### 3. SSE ends when the run stops producing events

- The API closes the SSE response after `run.awaiting_approval`, `run.completed`, `run.failed` or `run.cancelled`. Heartbeats are sent only while the run is `queued` or `running`.
- A resumed run appends to the same stream. The web app reopens the stream with its `Last-Event-ID` after the owner decides in the UI, and whenever a chat page opens or regains focus on a run that `GET /api/v1/runs/{id}` reports as `queued` or `running`.

### 4. Streams are bounded

- `text.delta` events are coalesced before they are appended. > **Default:** at most one `text.delta` entry every 50 ms per run.
- Every append caps the stream length with approximate trimming. > **Default:** `MAXLEN ~ 10000` entries per run.
- A stream gets a time to live when its run pauses or ends, and loses it when the run resumes. > **Default:** 24 hours.
- If a client's `Last-Event-ID` is older than the oldest entry left in the stream, or the stream has expired, the API answers `410 Gone` (problem details), and the client reads the run from `GET /api/v1/runs/{id}`.
- Appending to a stream is best effort. If an append fails, the run continues; the failure is logged with the run id only and counted. PostgreSQL stays the record of the run.
- Redis memory is monitored. > **Default:** warn the owner (a `critical` notification) when used memory passes 80% of `maxmemory`.

## Alternatives considered

- **Advisory lock instead of the row lock:** works, but the run row is already the natural owner of the step's state, and a row lock is visible in the schema and in tests.
- **A counter of unresolved actions on the run:** also correct under the lock, but it duplicates what the pending action rows already say and can drift.
- **`SERIALIZABLE` isolation for resolutions:** correct, but it brings retries on serialization failures into every resolution path.
- **Keep SSE open while paused:** the client learns about resumption without reopening, at the cost of idle connections for up to a day per paused tab.
- **Separate Redis instance for streams:** isolates memory pressure from BullMQ, at the cost of a second instance to run. The caps and the memory alert make it unnecessary for one owner; revisit if streams grow.

## Consequences

- A run resumes exactly once after its step's last pending action is resolved, even under concurrent resolutions and crashes.
- Paused runs hold no connections. The web app needs the reopen logic in §3.
- Stream memory is bounded per run, and the owner is warned before Redis runs out of memory.
- Tests: a concurrency test that resolves two pending actions of one step in parallel transactions and expects exactly one resume event; a test that a resume job for a cancelled run changes nothing; a test of the `410` path.
