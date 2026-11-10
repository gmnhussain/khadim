# ADR-0009: Multi-provider LLM and embedding adapters

| | |
| --- | --- |
| Status | Accepted |
| Date | 2026-11-10 |
| Relates to | Extends ADR-0005 (hand-built loop); refines ADR-0008 (embedding provider) |

## Context

ADR-0005 put the LLM behind a port with one adapter (Anthropic). The owner wants Khadim to use Claude, OpenAI, Gemini, other third-party services and local models, and to choose between them in different places: per task, per schedule, per chat message, and as a fallback when a provider is down. Reasons: learning how providers differ, controlling cost, resilience, and keeping some data on the local machine.

Providers differ in message format, tool calling, streaming events, prompt caching, structured output, usage reporting, error codes and prices. Without a deliberate design those differences leak into core and make switching expensive.

## Decision

### 1. Provider-neutral ports in core

- `LlmProvider` (in `packages/core/src/llm/llm.port.ts`): `generate(request)`, `stream(request)`, and `capabilities` (`supportsTools`, `supportsStreaming`, `supportsImages`, `supportsStructuredOutput`, `supportsPromptCaching`, `maxContextTokens`).
- `Embedder` (in `packages/core/src/memory/embedder.port.ts`): `embed(texts, purpose)` where purpose is `document` or `query`, plus `model` and `dimensions`.
- Core owns every type that crosses the port: messages, content parts, tool definitions, tool calls, tool results, usage (input, output, cached tokens), stop reasons and errors. No vendor type enters core (enforced by dependency-cruiser).

### 2. Adapters in `packages/integrations`

| Adapter | Covers | Phase |
| --- | --- | --- |
| `llm/anthropic` | Claude, official Anthropic SDK | 1 |
| `llm/openai-compatible` | Any Chat Completions–compatible endpoint by `baseUrl`: local models (Ollama, LM Studio, vLLM) and gateways or hosts such as OpenRouter, Groq, xAI and DeepSeek; OpenAI itself in a pinch | 1 |
| `llm/openai` | OpenAI, official SDK and its native API | 6 |
| `llm/gemini` | Google Gemini, official SDK and its native API | 6 |
| `embeddings/<provider>` | Voyage, OpenAI, Gemini, local (Ollama) | 2 onward |

Each adapter translates messages, tool calls, streaming events, usage and errors (`LLM_RATE_LIMITED`, `LLM_UNAVAILABLE`, …) to the core types, and applies the provider's prompt caching mechanism to the prefix that core marks as stable.

### 3. Provider registry and model catalog (configuration)

- The composition roots (`apps/api`, `apps/worker`) build a provider registry from validated environment variables. A provider without valid configuration is disabled.
- A **model catalog** in configuration lists every usable model: provider, model id, capabilities, context limit, prices (integer micro-USD per million tokens for input, output, cache write and cache read) and status.
- Services never hard-code provider or model ids.

### 4. Routing

- Each task has a **route** (`{ provider, model }`) in configuration: `chat`, `draft_post`, `draft_reply`, `classify`, `summarise`, `eval_grader`.
- Resolution order: **per-message override** (chat, from an allowlist) → **schedule override** → **task route**.
- Each route may list ordered **fallbacks**, tried only after retries are exhausted on `LLM_UNAVAILABLE` or `LLM_RATE_LIMITED`.
- At startup, every route and fallback is validated against the task's needs (for example, tool support). An invalid route stops the app from starting (BR-25).

### 5. Persistence

- Conversation history and run steps are stored in the provider-neutral format, never as a vendor's raw shape, so a conversation can continue on a different model.
- `agent_runs` and `llm_calls` record `provider` and `model`; `llm_calls` also records whether it was a fallback (BR-24, BR-26).

### 6. Prompts per model

- Each task has one base prompt (`<purpose>.v<n>.md`). A model-specific variant (`<purpose>.v<n>.<provider>.md`) is allowed when evals show the base prompt underperforms on that provider. A variant must pass the same evals.

### 7. Embeddings

- Several embedding adapters may exist, but **one embedding model is active at a time**. Chunks record provider, model and dimensions; queries use the same model as the chunks they search (BR-33).
- Changing the active model runs a re-index job; until it finishes, search uses the previous model's chunks.

### 8. Testing

- One shared **adapter contract suite** runs against every LLM and embedding adapter using recorded HTTP fixtures: message and tool mapping, streaming events, usage, and error mapping. Passing it is required to add a provider.
- Core keeps using `FakeLlmProvider` and `FakeEmbedder`.
- Evals run per routed model so quality and cost can be compared side by side.

## Alternatives considered

- **Single provider (ADR-0005 as written):** simplest, but no cost control, no resilience, no local option.
- **Vercel AI SDK as the abstraction in core:** many providers quickly, but hides the mechanics the project exists to teach and couples core to a library. May be added later as one adapter behind the port, by ADR.
- **One hosted gateway only (OpenRouter, a LiteLLM proxy):** one integration for many models, but adds an external dependency, cannot reach local models without extra setup, and teaches less. Still reachable through the `openai-compatible` adapter when wanted.
- **Separate tools or code paths per provider in core:** rejected; that is exactly the leakage this ADR prevents.

## Consequences

- Adding a provider means one adapter, configuration entries and a passing contract suite; core, tools and approvals do not change.
- More adapters to maintain; vendor SDK upgrades are reviewed per adapter.
- Prompts may need tuning per model; evals make the difference measurable.
- Owner data (profile, memory chunks, chat) is sent to whichever provider a task routes to. Only enabled providers receive data (BR-27); sensitive tasks can be routed to a local model.
- Cost and quality can be reported per provider and model.
