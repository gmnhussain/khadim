# apps/worker

**BullMQ worker: every agent run and resume (chat, schedule and webhook triggers), publishing, comment processing, memory ingestion, the outbox relay and repeatable schedules. Writes run events to Redis Streams (ADR-0010). Composition root for background services. Built in Phase 1 and extended each phase.**

- Thin job handlers that call one core service method; idempotent with deterministic job ids (conventions §17).
- See [background jobs](../../docs/architecture/background-jobs.md).

Not built yet: this folder holds only this README until its phase (conventions §2.3).
