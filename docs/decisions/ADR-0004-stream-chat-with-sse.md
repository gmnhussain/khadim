# ADR-0004: Stream chat answers with Server-Sent Events

| | |
| --- | --- |
| Status | Superseded by [ADR-0010](ADR-0010-resumable-runs-in-worker.md) |
| Date | 2026-11-10 |

## Context

A model answer takes seconds. The standard forbids slow work in a request handler and WebSockets without an ADR. Chat users expect to see text as it is generated, along with tool activity and approval prompts.

## Decision

Interactive chat runs execute in the API and stream to the browser as Server-Sent Events: `POST /api/v1/conversations/{id}/messages` (with `Idempotency-Key`) returns `text/event-stream` with typed events `run.started`, `text.delta`, `tool.called`, `tool.completed`, `approval.required`, `run.completed`, `run.failed`.

The web app proxies the stream through a Route Handler (BFF). Every event is persisted as part of the run, so a dropped connection resumes from `GET /api/v1/runs/{id}` and `Last-Event-ID`. Scheduled and webhook runs execute in the worker and do not stream.

This is the one deliberate exception to "no slow work in a request" (conventions §17).

## Alternatives considered

- **Run in the worker, browser polls:** simplest operationally, but no token streaming and noticeably slower feel.
- **WebSockets:** two-way channel not needed; more infrastructure and state.
- **Worker runs and publishes to Redis pub/sub, API relays SSE:** decouples execution from the request; more moving parts. Revisit if API instances need to restart without interrupting runs.

## Consequences

- Responsive chat with standard HTTP and simple proxying.
- Long chat runs hold an API connection; the per-run timeout (BR-21) bounds this.
- Graceful shutdown must mark interrupted runs so the client can recover.
