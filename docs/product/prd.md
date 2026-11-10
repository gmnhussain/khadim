# Product requirements: Khadim

**Khadim is a single-user AI assistant that answers from memory its owner controls and drafts career posts for LinkedIn and a Facebook Page, publishing nothing without the owner's approval.**

| | |
| --- | --- |
| Owner | Project owner (single user) |
| Status | Draft, Phase 0 |
| Last updated | 2026-11-10 |

## 1. Problem

A software developer wants a steady, authentic professional presence on LinkedIn without spending time every day writing posts, and wants one assistant that knows their career, projects and preferences. Existing assistants forget context between sessions, cannot publish, or publish without control.

## 2. Goals

| # | Goal | Measured by |
| --- | --- | --- |
| G-1 | Learn to build a production-quality AI agent with industry-standard practices | Every phase ships with tests, docs, ADRs and passing CI |
| G-2 | Useful daily assistant grounded in personal memory | Answers cite memory sources; owner rates answers useful |
| G-3 | Consistent LinkedIn presence with little effort | A reviewed draft is ready every scheduled day; approval takes under a minute |
| G-4 | Extensible to new platforms and tools | Facebook Page added without changing the agent loop or approval flow |
| G-5 | Safe and affordable | Zero unapproved publications; monthly model cost within budget (NFR-5) |

## 3. Users

| User | Description |
| --- | --- |
| Owner | The only user. Chats with Khadim, maintains memory, approves posts and replies. |
| Audience | People who read and comment on the owner's posts. They never use Khadim directly; their comments are untrusted input. |

## 4. Product capabilities

1. **Chat:** a streaming chat in the web app. Khadim answers from the owner's profile and memory documents and says when something is not in memory.
2. **Memory:** the owner edits a structured profile and uploads documents (CV, project docs, past posts) that Khadim retrieves from.
3. **Posts on request:** "Write a post about X for LinkedIn" produces a draft; the owner edits and approves; Khadim publishes.
4. **Scheduled posts:** at configured times (for example daily, 9 PM Asia/Dhaka) Khadim drafts a career post and asks for approval.
5. **Comment replies:** new comments on the owner's posts (where the platform allows) get reply drafts for approval.
6. **Transparency:** every run can be inspected: steps, tools used, tokens and cost.

## 5. Scope by phase

| Phase | Delivers | Main rules |
| --- | --- | --- |
| 0 | Docs foundation and monorepo scaffold | — |
| 1 | Agent core: owner sign-in, run lifecycle, tool registry, tool-calling loop, streaming chat UI, run inspection, cost tracking; provider-neutral LLM port with Anthropic and OpenAI-compatible adapters, routing by task | BR-01, BR-20–BR-27 |
| 2 | Memory: profile, document ingestion, retrieval, cited answers; post drafts in chat (not published); first evals; model choice per chat message and fallbacks | BR-30–BR-34 |
| 3 | LinkedIn: OAuth connection, adapter, pending actions and approval, publishing job | BR-02–BR-06, BR-40–BR-44, BR-46 |
| 4 | Schedules: create and manage schedules; scheduled drafts and approval notifications | BR-50–BR-53 |
| 5 | Facebook Page: connection, adapter, comment webhooks, reply drafts | BR-45, BR-60–BR-64 |
| 6 | More tools and channels (web search, email, calendar, Telegram, voice, MCP) and native OpenAI and Gemini adapters, each with its own plan | — |

## 6. Functional requirements

| Id | Requirement | Phase |
| --- | --- | --- |
| FR-1 | The owner signs in with a password and TOTP second factor. | 1 |
| FR-2 | The owner chats with Khadim; answers stream as they are generated. | 1 |
| FR-3 | Each conversation keeps its history; the owner can start, rename and archive conversations. | 1 |
| FR-4 | The owner can open any run and see its steps, tool calls, tokens, cost and timing. | 1 |
| FR-5 | The owner edits a structured profile (career, skills, tone, topics, do and don't). | 2 |
| FR-6 | The owner uploads, lists and deletes memory documents. | 2 |
| FR-7 | Answers that use memory show which documents they came from. | 2 |
| FR-8 | The owner connects and disconnects LinkedIn and a Facebook Page. | 3, 5 |
| FR-9 | Khadim drafts posts on request; drafts appear as approval cards in chat and on an approvals page. | 3 |
| FR-10 | The owner edits, approves or rejects each pending action. | 3 |
| FR-11 | Approved posts are published and the platform link is shown. | 3 |
| FR-12 | The owner creates, edits, pauses and deletes schedules. | 4 |
| FR-13 | Scheduled runs create drafts and notify the owner. | 4 |
| FR-14 | New comments on Facebook Page posts create reply drafts. | 5 |
| FR-15 | The owner sees daily and monthly cost and token totals, per provider and model. | 1 |
| FR-16 | The owner chooses the provider and model for a chat message from an allowlist; otherwise the task's configured route is used. | 2 |
| FR-17 | The owner can see which provider and model produced every answer, draft and reply. | 1 |

## 7. Non-functional requirements

| Id | Requirement | Target |
| --- | --- | --- |
| NFR-1 | Chat responsiveness | First streamed token within 3 s at p95 for chat without tool calls |
| NFR-2 | Safety | No external side effect without an approved pending action (BR-02); verified by tests |
| NFR-3 | Reliability | Retried jobs never publish twice (BR-04) |
| NFR-4 | Security | OWASP ASVS Level 2 for web and API; OWASP Top 10 for LLM Applications controls (see [security](../security.md)) |
| NFR-5 | Cost | Monthly model cost under a configured budget. > **Default:** USD 20 per month |
| NFR-6 | Observability | Every run fully traceable; logs carry no personal content |
| NFR-7 | Accessibility | WCAG 2.2 AA for the web app |
| NFR-8 | Portability | Claude, OpenAI, Gemini, OpenAI-compatible services and local models usable and switchable per task, schedule or message by configuration; a new provider needs only an adapter (ADR-0009) |

## 8. Not in scope

- Other users, teams, sign-up, billing or plans.
- Posting to personal Facebook profiles (the platform does not allow it).
- Fully automatic publishing without approval (may be revisited after evals; see ADR-0006).
- Scraping or browser automation against platform terms.
- Mobile apps (the web app is responsive).

## 9. Open questions

> **Open question:** What topics should career posts cover (for example technologies, lessons learned, project updates), and in what proportion?

> **Open question:** What tone and length do you want for LinkedIn posts? Any phrases, emojis or hashtags to always use or avoid?

> **Open question:** Which language should posts use: English only, Bangla only, or either per request?

> **Open question:** Do you already have a Facebook Page for testing, or should Phase 5 include creating one?

> **Open question:** Where will Khadim run in production (your own machine, a VPS, a cloud platform)? This affects Phase 3 onward, because platform webhooks and OAuth callbacks need a public HTTPS address.
