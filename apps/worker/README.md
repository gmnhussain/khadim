# apps/worker

**BullMQ worker: scheduled and webhook-triggered agent runs, publishing, comment processing, memory ingestion, the outbox relay and repeatable schedules. Composition root for background services. Built in Phase 1 and extended each phase.**

- Thin job handlers that call one core service method; idempotent with deterministic job ids (conventions §17).
- See [background jobs](../../docs/architecture/background-jobs.md).

Not built yet: this folder holds only this README until its phase (conventions §2.3).
