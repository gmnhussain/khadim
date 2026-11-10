# ADR-0007: Authentication library and auth only at the edges

| | |
| --- | --- |
| Status | Accepted |
| Date | 2026-11-10 |

## Context

The standard forbids hand-built authentication (conventions §14). Khadim needs owner sign-in with a strong password hash, server-side sessions in httpOnly cookies, TOTP two-factor authentication and rate-limited sign-in, working with Next.js (BFF), Express and Drizzle on PostgreSQL. There is one user and no sign-up (BR-01).

During development Khadim runs only on a private network, so the network can be the first gate. Before it is ever reachable from the internet, it needs real sign-in.

## Options

| Option | Fit | Concerns |
| --- | --- | --- |
| **Better Auth** | TypeScript-first; Drizzle adapter; Next.js integration; two-factor (TOTP) and rate-limit features; sign-up can be disabled | Younger project; check current release and security advisories |
| **Auth.js (NextAuth v5)** | Widely used with Next.js | Credentials sign-in and TOTP are not first-class |
| **Hosted provider (Clerk, Auth0 and similar)** | Least code; strong security features | External dependency and account for a single-user app; user data held by a third party |

## Decision

### 1. Better Auth, only in `apps/web`

- Better Auth handles sign-in, sessions and TOTP in the web app: sign-up disabled, owner account created by a seed script, TOTP required, sessions stored in PostgreSQL, sign-in rate-limited.
- Its tables are generated into `packages/db` under `src/auth/`. The web app may import **only** `@khadim/db/auth` (auth schema and its client), in server-only code, connecting as a database role limited to the auth tables. This is the one exception to "web never imports db", enforced by dependency-cruiser.
- Verify the current Better Auth version, its Next.js integration and open advisories when Phase 1 starts.

### 2. Auth only at the edges

- **Web (edge for the owner):** every Server Action and Route Handler checks the session first (conventions §18).
- **BFF → API:** the web app calls the API with a short-lived **service token**: a JWT signed by the web app with an Ed25519 key, carrying `sub` (owner user id), `iss` `khadim-web`, `aud` `khadim-api`, `exp` and a `kid`. The API verifies it with the public key and puts the owner id into the request context. It never looks up sessions and never sees the session cookie. > **Default:** tokens live 60 seconds; the API accepts 5 seconds of clock skew and two active keys during rotation.
- **API (edge for platforms):** webhook routes are authenticated by the platform's signature, never by a service token.
- **Core** never imports auth code. It receives the owner id through the request context or from the stored run.
- The service token never reaches the browser; the API is never called by the browser (BFF).

### 3. Access modes

| Mode | Where | Gate |
| --- | --- | --- |
| `private` | Local machine, or a host reachable only through Tailscale or Cloudflare Access | The private network or access proxy; the web app may run without sign-in and uses the seeded owner |
| `public` | Any address reachable from the internet | Better Auth with TOTP required; the private gate may stay in front |

- The web app reads its mode from validated configuration and refuses to start in `public` mode unless auth is fully configured.
- The API is never public in either mode. Only webhook routes are exposed, through the reverse proxy, from Phase 3.

## Consequences

- Development can start before sign-in exists, without weakening production: going public is impossible without Better Auth and TOTP.
- The API has a single, stateless check (verify a signature), with no session store access.
- Key management is needed: an Ed25519 key pair in the web and API env files, rotated with `kid`.
- `packages/db` exposes an `auth` subpath that the web app may import; every other part of `db` stays off-limits to the web app.
