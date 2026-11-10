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
| `src/testing/contract` | Shared adapter contract suite | 1 |

- Adapters map vendor shapes and errors; they hold no business rules (conventions §10.1).
- Imports only core ports and types, never core services (§5.3).
- Tested with recorded HTTP fixtures, never live APIs; every LLM and embedding adapter passes the shared contract suite (§19).

Not built yet: this folder holds only this README until its phase (conventions §2.3).
