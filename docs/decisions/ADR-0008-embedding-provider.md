# ADR-0008: Embedding provider

| | |
| --- | --- |
| Status | Proposed (owner decision needed before Phase 2) |
| Date | 2026-11-10 |

## Context

Retrieval over memory documents needs text embeddings. Anthropic does not offer an embedding API. The `Embedder` port makes the provider replaceable, but switching models requires re-indexing (BR-33), so the first choice should be deliberate. ADR-0009 allows several embedding adapters to exist; this ADR chooses which model is **active** first.

## Options

| Option | Fit | Concerns |
| --- | --- | --- |
| **Voyage AI** (hosted) | Recommended in Anthropic's documentation; strong retrieval quality; simple API | Another account and API key; usage-based cost (small at this scale) |
| **OpenAI embeddings** (hosted) | Widely used; inexpensive small model | Another vendor account |
| **Google Gemini embeddings** (hosted) | Good quality; free tier | Another vendor account |
| **Cohere Embed** (hosted) | Strong multilingual support; also offers reranking | Another vendor account |
| **Local model** (for example through Ollama or Transformers.js) | No API cost; data stays on the machine | Extra runtime to install and run; quality and speed depend on the machine; production hosting must run it too |

## Recommendation

Start with a hosted provider for reliability and simplicity, with Voyage AI as the default because Anthropic's documentation points to it. Keep the local option available behind the same port for experiments. Confirm current models, dimensions and prices when accepting this ADR.

## Consequences (if accepted)

- `memory_chunks.embedding` uses the chosen model's dimensions; provider, model and dimensions are stored per chunk.
- The adapter lives in `packages/integrations/src/embeddings/<provider>` and passes the shared contract suite (ADR-0009); tests use a deterministic fake embedder.
- Other embedding adapters can be added later; switching the active model runs a re-index job (BR-33).
