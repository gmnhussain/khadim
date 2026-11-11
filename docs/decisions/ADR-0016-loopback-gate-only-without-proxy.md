# ADR-0016: The `loopback` gate is only for unproxied local use

| | |
| --- | --- |
| Status | Accepted, 2026-11-11 (foundation-review plan D-1) |
| Date | 2026-11-11 |
| Relates to | Extends ADR-0015 (`private` access mode fails closed) |

## Context

ADR-0015 lists `tailscale serve` and `cloudflared` running on the same host as typical uses of the `loopback` gate. Both proxies connect to the web app from `127.0.0.1`, so every request they forward has a loopback peer address and passes the gate. Safety then depends entirely on the Cloudflare Access policy or on Tailscale Funnel staying off: one wrong setting gives anyone the owner's UI. That is the fail-open case ADR-0015 exists to remove.

A second point is unverified: ADR-0015 reads the socket's peer address on every request. Next.js removed `request.ip` from `NextRequest` in version 15, and middleware does not see the socket, so the web app may need a custom server, or another way to reach the peer address, to apply the `loopback` and `tailscale` gates.

## Decision

- `loopback` is for a browser on the same machine talking to the web app directly. It is never the gate for traffic that a proxy on the same host forwards.
- Behind `cloudflared`, the gate is `cloudflare-access`, which checks the Access JWT on every request whatever the peer address.
- With Tailscale, the web app listens on the host's Tailscale address and uses the `tailscale` gate. `tailscale serve` and Funnel are not used in front of a `private` web app.
- Defence in depth: under the `loopback` gate, a request carrying any forwarding header (`Forwarded`, `X-Forwarded-For`, `X-Forwarded-Host`, `X-Real-IP`, `Cf-Connecting-IP`, `Tailscale-User-Login`) gets `403`. A direct local browser never sends these; a same-host proxy usually does, so a misconfigured proxy fails closed.
- The Phase 1b plan confirms how the web app reads the socket peer address in the installed Next.js version before the gates are built. If it cannot be read reliably, that plan proposes the alternative.

## Alternatives considered

- **Keep ADR-0015 as written:** simplest, but the documented setups pass every request.
- **Trust Tailscale identity headers from `tailscale serve`:** gives the user's identity, but those headers are only trustworthy if nothing else can reach the port; it adds a fourth gate to build and test. Revisit if per-user identity is ever needed.
- **Only `cloudflare-access` for any remote use:** one gate to maintain, but it forces Cloudflare even for a tailnet-only setup.

## Consequences

- The ADR-0015 table's "Typical use" for `loopback` no longer includes `tailscale serve` or `cloudflared`.
- New tests: under `loopback`, a request with each forwarding header is rejected; a direct loopback request without them passes.
- `deployment.md` and `security.md` are updated when this ADR is accepted.
