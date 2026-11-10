# Security

**Khadim's security controls and the test that proves each. Targets OWASP ASVS Level 2 for the web app and API and the OWASP Top 10 for LLM Applications for the agent (conventions §14, §15.11).**

Status: **Planned** until the phase that builds the control; then **Tested** with the test named.

## Application security

| Control | How | Proven by | Phase | Status |
| --- | --- | --- | --- | --- |
| Single owner, no sign-up | Better Auth with sign-up disabled; owner seeded (BR-01) | Integration test: sign-up endpoint absent or rejected | 1 | Planned |
| Strong authentication | Library password hashing, TOTP required, rate-limited sign-in | Integration tests for lockout and TOTP | 1 | Planned |
| Session handling | httpOnly, `Secure`, `SameSite=Lax` cookies; server-side sessions | Integration test of cookie attributes | 1 | Planned |
| No tokens in the browser | BFF; browser never calls the API | dependency-cruiser rule; e2e network check | 1 | Planned |
| BFF-to-API authentication | Ed25519-signed service token, 60-second lifetime, audience and issuer checked; API never public (ADR-0007) | Integration tests: missing, expired, wrong-audience and wrongly signed tokens get `401` | 1 | Planned |
| Network access | `private` mode only behind Tailscale or Cloudflare Access; `public` mode refuses to start without Better Auth and TOTP | Unit test of the web config schema rejecting `public` without auth | 1 | Planned |
| Input validation | Zod on every body, query, env, job payload, webhook and tool input | Route tests for validation errors | 1 | Planned |
| Security headers and CSP | Nonce-based CSP, HSTS, `nosniff`, frame denial, referrer policy | Integration test of headers | 1 | Planned |
| CORS | Allowlist of the web origin | Integration test | 1 | Planned |
| Rate limiting | Redis limiter on sign-in and run-starting endpoints | Integration test for `429` | 1 | Planned |
| Idempotency | `Idempotency-Key` on publishing and run-starting POSTs | Replay test | 1 | Planned |
| Secrets at rest | OAuth tokens encrypted with AES-256-GCM; key from env | Unit test of crypto; repository test that tokens are never returned | 3 | Planned |
| Webhook authenticity | Signature verified before parsing; replay window | Integration tests with valid, invalid and replayed signatures | 5 | Planned |
| No content in logs | Logger redaction; logs carry ids, counts and timings only | Unit test of logger redaction | 1 | Planned |
| No content in traces | OpenTelemetry GenAI content capture off; span attribute allowlist before export | Unit test exporting a model-call span and asserting no prompt, completion or tool payload attributes | 1 | Planned |
| Dependency hygiene | Lockfile, `pnpm audit --prod` in CI, Dependabot | CI | 0 | In place |
| Commit hygiene | `.env*` ignored; secrets never committed | `.gitignore`; gitleaks scan of the full history in CI (digest-pinned image) | 0 | In place |

## LLM security

| Risk (OWASP LLM Top 10) | Control | Proven by | Phase | Status |
| --- | --- | --- | --- | --- |
| Prompt injection | External content wrapped and labelled as untrusted; system prompt rule; approvals required regardless of content (BR-02, BR-62) | Eval cases with injection attempts in comments and documents | 2, 5 | Planned |
| Excessive agency | Least-privilege tools per task; effect tier and policy per tool, with `external` always needing approval (ADR-0011); reply tool bound to one comment (BR-64); no general HTTP, browser or shell tool without an ADR | Unit tests of tool sets per task and of the tier floor in `tool-policy.rules.ts`; startup test rejecting an `external` tool with `auto` | 1, 5 | Planned |
| Improper output handling | Output validated with Zod; rendered as sanitised Markdown without raw HTML; never executed | Unit and e2e tests with HTML in model output | 1 | Planned |
| Sensitive information disclosure | No secrets or tokens in context; only needed personal data | Unit test of context builder | 1 | Planned |
| Data sent to third-party providers | Only enabled providers receive data (BR-27); sensitive tasks can route to a local model; one API key per provider, server-side only | Unit test of provider registry and routing rules | 1 | Planned |
| Unbounded consumption | Iteration, token, cost and time limits; daily budget (BR-21, BR-22) | Unit tests of budget rules | 1 | Planned |
| Supply chain | Pinned SDK versions per provider adapter; adapters re-run the contract suite on upgrade | Dependabot PR review and contract suite | 1 | Planned |
| Tool poisoning (MCP) | Owner-listed servers only; each tool disabled until given a tier and policy; pinned descriptions, re-approval on change; results treated as untrusted | Unit tests of the MCP tool source: unknown tool disabled, changed description disabled | 6 | Planned |
| Misinformation | Facts about the owner only from memory (BR-30); citations (BR-31) | Eval cases for grounding | 2 | Planned |
| Memory poisoning | Learned facts only from the owner's own messages (BR-36), used only after approval (BR-35); secrets never proposed (BR-38) | Unit tests of `fact.rules.ts` (source check, secret detection); eval cases where a document or comment asks Khadim to remember something | 2 | Planned |

## Reporting

This is a personal project. Security issues are tracked as private notes by the owner and fixed before new features.
