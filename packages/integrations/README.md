# @khadim/integrations

**Adapters that implement core ports, one folder per vendor (ADR-0009).**

| Folder | Port | Phase |
| --- | --- | --- |
| `src/llm/anthropic` | `LlmProvider` | 1 |
| `src/llm/openai-compatible` (local models, gateways) | `LlmProvider` | 1 |
| `src/llm/openai`, `src/llm/gemini` | `LlmProvider` | 6 |
| `src/embeddings/<provider>` | `Embedder` | 2 |
| `src/social/linkedin` | `SocialPlatform` | 3 |
| `src/social/facebook-page` | `SocialPlatform` | 5 |
| `src/channels/<vendor>` (Telegram, email, voice) | `ChannelAdapter` | 6 |
| `src/notifications/<vendor>` (web push, email, Telegram) | `NotificationSender` | 6 |
| `src/mcp` (MCP client, one source per configured server) | `ToolSource` | 6 |
| `src/testing/contract` | Shared adapter contract suite | 1 |

- Adapters map vendor shapes and errors; they hold no business rules (conventions §10.1).
- Imports only core ports and types, never core services (§5.3).
- Tested on HTTP fixtures, never live APIs. Anthropic's fixtures are hand-built from its documentation until the deferred recording (phase-1 plan, D-6); every LLM and embedding adapter passes the shared contract suite (§19).

Built so far (Phase 1a): `src/llm/anthropic`, the Anthropic adapter of the `LlmProvider` port. It maps requests, responses, stream events and errors, and turns the SDK's own retries off, because core decides every retry (phase-1 plan, D-9).

| Script | Does |
| --- | --- |
| `pnpm --filter @khadim/integrations lint` | ESLint with zero warnings |
| `pnpm --filter @khadim/integrations typecheck` | `tsc` on source, then on tests with the test preset |
| `pnpm --filter @khadim/integrations test:unit` | Unit tests with coverage, including the adapter contract suite; none calls a real API |
| `pnpm --filter @khadim/integrations record:anthropic` | Records the contract fixtures against the real API. Owner only, by hand |

## Contract suite and fixtures

`src/testing/contract/` holds the contract every `LlmProvider` adapter keeps: one function that takes a provider factory and HTTP fixtures, and answers the adapter's calls from them with MSW. `src/llm/anthropic/anthropic.contract.test.ts` runs it for Anthropic.

Every fixture is hand-built today, in `src/llm/anthropic/fixtures/synthetic/`: TypeScript typed against the SDK's own `Message`, stream event and error types, following Anthropic's documentation. They prove our reading of the docs, not the live API. Recording is deferred (phase-1 plan, D-6); when it is done, the recordings replace the eight success fixtures and the values expected from them, and the suite does not change.

## Recording fixtures

Not run yet. Only the owner records (phase-1 plan, D-6), with a low-limit test key and the synthetic prompts in `src/testing/recording/`. `src/testing/contract/contract-requests.ts` holds the same prompts for the contract cases; the two must stay identical.

1. Create `packages/integrations/.env.recording` with one line: `ANTHROPIC_API_KEY=<test key>`. Git ignores the file.
2. Run `pnpm --filter @khadim/integrations record:anthropic`.
3. Review `src/llm/anthropic/fixtures/*.json` for keys and personal data before they are committed, then delete `.env.recording`.

A fixture holds the request body the adapter sent, and the response's status, body and three headers (`content-type`, `retry-after`, `retry-after-ms`). No request header is ever written, and the recorder refuses to write a file that contains the key.
