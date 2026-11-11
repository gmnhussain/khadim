# ADR-0015: `private` access mode fails closed

| | |
| --- | --- |
| Status | Accepted (amendment proposed in [ADR-0016](ADR-0016-loopback-gate-only-without-proxy.md): `loopback` is not the gate behind a same-host proxy) |
| Date | 2026-11-10 |
| Relates to | Extends ADR-0007 (authentication, access modes) |

## Context

ADR-0007 lets the web app run in `private` mode without sign-in, acting as the seeded owner, as long as only a private network or an access proxy can reach it. Nothing in the app checks that this is true. A wrong port binding, reverse-proxy rule or Cloudflare Access policy would give anyone who reaches the host the owner's UI, including approving publishes (BR-02). That is fail-open, against conventions §1 ("Fail closed").

## Decision

- In `private` mode the web app checks the gate itself, on **every request**, before any page, Server Action or Route Handler runs. A request that fails the check gets `403` and nothing else.
- The gate is a required setting, `PRIVATE_GATE`, validated at startup:

| Gate | Check on each request | Typical use |
| --- | --- | --- |
| `loopback` | The connection's peer address is loopback | Local machine; `tailscale serve` or `cloudflared` running on the same host |
| `tailscale` | The peer address is in Tailscale's address ranges (`100.64.0.0/10`, `fd7a:115c:a1e0::/48`) | The web app listening on the host's Tailscale address |
| `cloudflare-access` | A valid Cloudflare Access JWT (`Cf-Access-Jwt-Assertion`): signature from the team's published keys, the application's audience, not expired | A host reachable only through Cloudflare Access |

- The check uses the socket's peer address, never `X-Forwarded-For` or other forwarded headers.
- Missing or invalid gate settings stop the app at startup. There is no "no gate" value.
- `public` mode is unchanged: Better Auth with TOTP is required; a private gate may still stand in front.
- Verify the current Cloudflare Access JWT validation guidance when this is built.

## Alternatives considered

- **Trust the network only (ADR-0007 as written):** simplest, but one configuration mistake exposes the owner's account with no second line.
- **Require Better Auth in every mode:** safest, but it delays usable development until sign-in exists, which ADR-0007 chose to avoid.

## Consequences

- A wrong binding or proxy rule fails closed: the app answers `403` instead of serving the owner's UI.
- Containers that hide the peer address behind NAT need host networking for `loopback` or `tailscale`, or the `cloudflare-access` gate.
- Tests: unit tests for each gate (non-loopback peer rejected, non-tailnet peer rejected, missing, forged, expired and wrong-audience Access JWT rejected, forwarded headers ignored); the config schema rejects `private` without a gate.
