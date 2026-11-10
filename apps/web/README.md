# apps/web

**Next.js (App Router) web app and BFF: chat, approvals, schedules, memory and connections. Built in Phase 1.**

- The browser never calls the API directly: Server Components read, Server Actions mutate, and a Route Handler proxies the chat SSE stream (conventions §18).
- Talks to `apps/api` only through `@khadim/contracts`, with a short-lived signed service token; never imports `core`, `integrations` or `db`, except `@khadim/db/auth` for Better Auth in server-only code (§5.3, ADR-0007).
- Owns sign-in, sessions and TOTP (Better Auth); runs in `private` or `public` access mode (§14).
- Local port: `3100`.

Not built yet: this folder holds only this README until its phase (conventions §2.3).
