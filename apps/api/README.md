# apps/api

**Express 5 HTTP API: routes, controllers, OpenAPI, webhooks and the SSE chat stream. Composition root for request-time services. Built in Phase 1.**

- Layers: routes → controllers → services (in `@khadim/core`) → repositories (conventions §10).
- Errors as RFC 9457 problem details; `Idempotency-Key` on run-starting and publishing POSTs (§11, §12).
- Local port: `4100`.

Not built yet: this folder holds only this README until its phase (conventions §2.3).
