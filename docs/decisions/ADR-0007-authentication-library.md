# ADR-0007: Authentication library

| | |
| --- | --- |
| Status | Proposed (owner decision needed before Phase 1) |
| Date | 2026-11-10 |

## Context

The standard forbids hand-built authentication (conventions §14). Khadim needs owner sign-in with a strong password hash, server-side sessions in httpOnly cookies, TOTP two-factor authentication and rate-limited sign-in, working with Next.js (BFF), Express and Drizzle on PostgreSQL. There is one user and no sign-up (BR-01).

## Options

| Option | Fit | Concerns |
| --- | --- | --- |
| **Better Auth** | TypeScript-first; Drizzle adapter; Next.js and Express integrations; two-factor (TOTP) and rate-limit features; sign-up can be disabled | Younger project; check current release and security advisories |
| **Auth.js (NextAuth v5)** | Widely used with Next.js | Credentials sign-in and TOTP are not first-class; Express use is awkward |
| **Hosted provider (Clerk, Auth0 and similar)** | Least code; strong security features | External dependency and account for a single-user app; user data held by a third party |

## Recommendation

Better Auth, with sign-up disabled, the owner account created by a seed script, TOTP required, and sessions stored in PostgreSQL. Verify the current version, its Express 5 and Next.js integration, and open advisories when accepting this ADR.

## Consequences (if accepted)

- Auth tables are owned by the library's schema, generated into `packages/db`.
- The web app holds the session cookie; the API validates sessions on every request.
