# apps/web

**Next.js (App Router) web app and BFF: chat, approvals, schedules, memory and connections. Built in Phase 1.**

- The browser never calls the API directly: Server Components read, Server Actions mutate, and a Route Handler proxies the chat SSE stream (conventions §18).
- Talks to `apps/api` only through `@khadim/contracts`; never imports `core`, `integrations` or `db` (§5.3).
- Local port: `3100`.

Not built yet: this folder holds only this README until its phase (conventions §2.3).
