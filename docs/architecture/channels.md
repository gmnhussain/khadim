# Channels

**How the owner and Khadim talk. A channel carries a conversation in both directions. It is a port, so adding Telegram, email or voice needs an adapter, not changes to the agent.**

## Channels

A channel is a surface where the owner converses with Khadim.

| Channel | Key | Phase | Implemented by |
| --- | --- | --- | --- |
| Web app | `web` | 1 | `apps/web` + `apps/api` (SSE relay); the reference channel |
| Telegram, email, voice | `telegram`, `email`, `voice` | 6 | Adapters in `packages/integrations/src/channels/<vendor>` |

### Flow

```mermaid
sequenceDiagram
  participant X as Channel (webhook or poller)
  participant A as Channel adapter
  participant C as Channels service (core)
  participant DB as PostgreSQL
  participant W as Worker
  X->>A: raw inbound message
  A->>A: verify signature and sender
  A->>C: InboundMessage
  C->>DB: find or create conversation; store message; create run (one transaction)
  C->>W: agent.run
  W-->>C: run events and final answer
  C->>A: OutboundMessage (if the channel is not web)
  A->>X: send
```

- Inbound: an adapter verifies the request, checks the sender, and normalises it to an `InboundMessage` (channel, sender ref, thread ref, external message id, text, attachments, received at). The API webhook route or a worker poller calls it.
- From there the message follows exactly the same path as a web chat message: one conversation, one run in the worker (BR-20, ADR-0010).
- Outbound: the web channel reads run events over SSE. Other channels receive the final answer through `send()`, split to the channel's `maxMessageChars`; channels that support streaming may receive partial text.

### Port

`ChannelAdapter` in `packages/core/src/channels/channel.port.ts`:

| Member | Purpose |
| --- | --- |
| `key` | Channel key (`telegram`, …) |
| `capabilities` | `supportsStreaming`, `supportsInteractiveApproval`, `supportsAttachments`, `supportsMarkdown`, `maxMessageChars` |
| `parseInbound(request)` | Verify and normalise to `InboundMessage`, or reject |
| `send(message)` | Deliver an `OutboundMessage` to a thread |

### Rules

- Only the owner's linked identities can start runs from a channel; anything else is ignored and counted, never answered (BR-07).
- A redelivered inbound message never starts a second run: `messages` has a unique (`channel`, `external_message_id`) (BR-20).
- Message text from the owner is owner input. Attachments are memory-like documents and therefore untrusted data (BR-34).
- > **Default:** approvals happen only in the web app. A channel can render approval actions only after an ADR shows that it authenticates the owner as strongly as the web app.
- A conversation belongs to one channel (`conversations.channel`, `conversations.channel_thread_ref`).
