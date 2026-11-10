# Testing

**How Khadim is tested: levels, file names, commands and fakes. The rules are in conventions §19; this doc explains how to apply them.**

## Levels

| Level | File pattern | Runs with | Uses |
| --- | --- | --- | --- |
| Unit | `*.test.ts` beside the code | `pnpm test:unit` | Pure rules, loop logic with a fake LLM, tool input validation, adapter mapping |
| Integration | `*.int.test.ts` | `pnpm test:integration` | Real PostgreSQL 18 + pgvector and Redis via Testcontainers; API through Supertest |
| Adapter | `*.test.ts` in `packages/integrations` | `pnpm test:unit` | Recorded HTTP fixtures (MSW or nock), never live APIs |
| Adapter contract | Shared suite in `packages/integrations`, run once per LLM and embedding adapter | `pnpm test:unit` | Same cases for every provider: message and tool mapping, streaming events, usage, error codes |
| End-to-end | `e2e/*.spec.ts` | `pnpm test:e2e` (added with the web app) | Playwright against production builds with fake adapters |
| Evals | `evals/**/*.eval.ts` | `pnpm evals` (added in Phase 2) | Real models; measures agent quality |

`pnpm test` runs unit and integration tests.

## Fakes

| Fake | Replaces | Behaviour |
| --- | --- | --- |
| `FakeLlmProvider` | `LlmProvider` | Returns scripted responses in order: text, tool requests, errors, usage |
| `FakeEmbedder` | `Embedder` | Deterministic vectors from text, so similarity is predictable |
| `FakeSocialPlatform` | `SocialPlatform` | Records calls; configurable capabilities and failures |
| Fixed clock and id generator | `now`, `randomId` | Deterministic timestamps and ids |

Fakes live next to their port in `packages/core` under a `testing/` folder and are exported only for tests.

## Rules of thumb

- **No real LLM or social API calls** in unit, integration or e2e tests.
- Every `*.rules.ts` file has 100% coverage.
- Every API route tests: success, validation error, unauthenticated, not found, conflict, stale version.
- Every job handler has a test that runs it twice and checks there is no duplicate effect.
- Test names are sentences that cite rules: `it("never publishes without an approved pending action (BR-02)")`.
- Use factories, not shared fixtures.

## Adding a provider

1. Write the adapter in `packages/integrations/src/llm/<provider>` (or `embeddings/<provider>`).
2. Record fixtures for the contract cases against a test account.
3. Make the shared contract suite pass.
4. Add the provider's models to the model catalog configuration.
5. Run the relevant evals on the new models before routing any task to them.

## Evals

- Cases (`G-xx`) hold an input and expected properties, for example "post under 3,000 characters, mentions only skills from the profile, no hashtags from the blocked list".
- Deterministic graders run first; a model-graded rubric covers tone, relevance and grounding.
- Results are stored and compared with the previous baseline in the PR description.
- The same cases can run across several models to compare quality and cost per provider.
