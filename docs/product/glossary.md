# Glossary

**The domain terms used in Khadim's docs and code, with their code names. Use these words exactly; add a term here before using a new one.**

| Term | Code name | Meaning |
| --- | --- | --- |
| Owner | `owner`, `ownerUserId` | The single user who runs Khadim, chats with it and approves its actions. |
| Service token | `serviceToken` | A short-lived JWT the web app signs to call the API on the owner's behalf; never reaches the browser. |
| Access mode | `accessMode` | `private` (behind localhost, Tailscale or Cloudflare Access) or `public` (Better Auth with TOTP required). |
| Agent run | `AgentRun`, `agent_runs` | One execution of the agent for one task, from trigger to final answer or failure. |
| Trigger | `triggerType`, `triggerRef` | What started a run: a chat message, a schedule or a webhook event. |
| Task | `task` | The kind of work a run does (`chat`, `draft_post`, `draft_reply`); selects the model and prompt. |
| Run step | `AgentStep`, `agent_steps` | One iteration of the loop: a model call and the tool calls it requested. |
| Resume | `agent.resume-run` | Continuing a paused run once every pending action from its last step is resolved; the outcomes become tool results. |
| Run event stream | `agent:run-events:v1:<agentRunId>` | The Redis Stream of a run's live events, relayed to the browser over SSE; transient. |
| Loop | `agentLoop` | The cycle of calling the model, executing requested tools and returning results until a final answer. |
| LLM call | `LlmCall`, `llm_calls` | One request to a language model, with tokens, cost and latency. |
| LLM provider | `LlmProvider` | Port for language models; adapters implement it for Anthropic, OpenAI-compatible services, OpenAI and Gemini. |
| Provider | `providerId` | A source of models: `anthropic`, `openai`, `gemini`, or an OpenAI-compatible endpoint such as a local Ollama server. |
| Model catalog | `modelCatalog` | Configuration listing usable models with their provider, capabilities, limits and prices. |
| Model route | `ModelRoute` | The `{ provider, model }` a task, schedule or message uses. |
| Model routing | `modelRegistry`, `model-routing.rules` | Choosing provider and model: per-message override, then schedule override, then task route. |
| Fallback | `fallbackRoutes` | An ordered backup route used when the primary provider is unavailable after retries. |
| OpenAI-compatible adapter | `openai-compatible` | One adapter for any endpoint that speaks the Chat Completions format, including local models. |
| Adapter contract suite | `adapterContract` | Shared tests every LLM and embedding adapter must pass. |
| Tool | `ToolDefinition` | A capability the model may call, with a name, description, input schema and handler. |
| Tool source | `ToolSource` | Where tools come from: built-in tools, later MCP servers. |
| MCP server | `mcp` tool source | An external Model Context Protocol server whose tools Khadim may use once the owner enables each tool with a tier and policy. |
| Tool call | `ToolCall`, `tool_calls` | One execution of a tool requested by the model. |
| Effect tier | `effect` | What a tool changes: `read` (nothing), `local_write` (Khadim's own state), `external` (something outside Khadim). |
| Tool policy | `ToolPolicy` | How a tool call executes: `auto` (now), `propose` (stored for the owner to accept later), `approve` (pending action; the run pauses). `external` tools are always `approve`. |
| Write tool | — | Older term for a tool whose policy is `approve`; prefer "effect tier" and "tool policy". |
| Proposal | `proposed` status | A `local_write` effect stored for the owner to accept later, without pausing the run (for example a learned memory fact). |
| Pending action | `PendingAction`, `pending_actions` | A proposed external side effect with its exact payload, awaiting the owner's decision. |
| Approval | `approve` | The owner accepting a pending action, optionally after editing it, which queues its execution. |
| Rejection | `reject` | The owner declining a pending action; it never executes. |
| Autopilot | `autopilotPolicy` | A future per-action-type setting allowing execution without approval, within limits. Not built. |
| Profile | `Profile` | Structured facts about the owner (career, skills, tone, topics, do and don't) the agent always sees. |
| Memory document | `MemoryDocument`, `memory_documents` | A file the owner adds to memory, such as a CV or a project README. |
| Learned fact | `MemoryFact`, `memory_facts` | A fact about the owner that Khadim proposed from the owner's own message; used only after the owner approves it. |
| Chunk | `MemoryChunk`, `memory_chunks` | A section of a memory document with its embedding, used for retrieval. |
| Embedding | `embedding` | A vector representing text meaning, used for similarity search. |
| Retrieval | `retrievalService` | Finding the chunks most relevant to a question. |
| Conversation | `Conversation`, `conversations` | A chat thread between the owner and Khadim, on one channel. |
| Channel | `ChannelAdapter`, `channel` | A surface where the owner converses with Khadim: `web`, later `telegram`, `email`, `voice`. |
| Channel identity | `ChannelIdentity`, `channel_identities` | The owner's account on a channel (for example a Telegram user id), linked so that only the owner can start runs there. |
| Notification | `Notification`, `notifications` | A short message Khadim sends the owner unasked (approval waiting, budget reached, connection expiring); always shown in the web app inbox. |
| Notification sender | `NotificationSender` | Port for delivering notifications outside the web app (web push, email, Telegram). |
| Inbound message | `InboundMessage` | A message from a channel, normalised by its adapter before it becomes a conversation message. |
| Message | `Message`, `messages` | One turn in a conversation, from the owner or Khadim. |
| Platform | `platform` | A social network Khadim can post to: `linkedin`, `facebook_page`. |
| Adapter | `SocialPlatform` adapter | Code that implements a port for one vendor, such as the LinkedIn adapter. |
| Capability | `Capabilities` | What a platform supports: `maxChars`, `supportsComments`, `supportsImages`. |
| Connection | `PlatformConnection`, `platform_connections` | An authorised link to the owner's platform account, holding encrypted tokens. |
| Post | `Post`, `posts` | Content published, or to be published, on a platform, with its platform post id once live. |
| Draft | `draft` | Generated text not yet approved; lives in a pending action. |
| Comment | `Comment`, `comments` | A reply by someone else to one of the owner's posts. Untrusted input. |
| Reply draft | `draft_reply` task | A suggested reply to a comment, awaiting approval. |
| Schedule | `Schedule`, `schedules` | A recurring rule (cron expression and time zone) that triggers a task. |
| Webhook event | `WebhookEvent`, `webhook_events` | A raw notification from a platform, stored before processing. |
| Outbox event | `OutboxEvent`, `outbox_events` | A record written with a state change so a job is enqueued reliably. |
| Prompt version | `promptVersion` | The versioned prompt file a run used, such as `post-writer.v2`. |
| Budget | `runBudget`, `dailyBudget` | Limits on tokens, cost and iterations for a run or a day. |
| Eval case | `G-xx` | A test input with expected properties for measuring agent quality. |
| Untrusted content | `untrusted` | Text from outside Khadim (comments, web pages, documents) treated as data, never instructions. |
