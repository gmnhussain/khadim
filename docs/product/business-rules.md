# Business rules

**The numbered rules Khadim's code must follow. Code and tests cite these ids; a rule changes here before it changes in code.**

Numbering leaves gaps so related rules stay together: 01–09 access and approvals, 20–29 agent runs, 30–39 memory, 40–49 posts and platforms, 50–59 schedules, 60–69 comments.

## Access and approvals

| Id | Rule |
| --- | --- |
| BR-01 | Khadim has exactly one owner. Only the owner can sign in; there is no sign-up. |
| BR-02 | No external side effect (publishing a post, replying to a comment, sending a message) happens without a pending action the owner approved. |
| BR-03 | The approved payload is exactly what executes. If the owner edits a draft, the edited version is what is approved and executed. |
| BR-04 | A pending action executes at most once. Once the platform returns a post id, it is stored and a retry never publishes again. |
| BR-05 | A pending action not decided within its expiry window expires and can no longer be approved. > **Default:** 24 hours. > **Open question:** Is 24 hours right? |
| BR-06 | Rejected and expired pending actions are kept for history and never deleted. |

## Agent runs

| Id | Rule |
| --- | --- |
| BR-20 | Every chat message, schedule firing and processed webhook event starts exactly one agent run, recorded with its trigger. |
| BR-21 | A run stops when the model gives a final answer or a limit is reached: iterations, tokens, cost or time. > **Default:** 10 iterations, 2 minutes, USD 0.50 per run. |
| BR-22 | When the daily budget is reached, new scheduled and webhook runs are not started and the owner is notified; chat still works, with a warning. > **Default:** USD 2 per day. |
| BR-23 | Every model call and tool call of a run is recorded with tokens, cost and timing. |
| BR-24 | Every run and model call records the provider and model that served it, and the owner can see it. |
| BR-25 | A task, schedule or message can only use a model whose capabilities meet the task's needs (for example, tool support); invalid routes stop the app at startup. |
| BR-26 | When the routed provider is unavailable after retries, the run continues on the next configured fallback model; the switch is recorded on the run. > **Default:** fallbacks are configured for `chat` only until the owner sets others. |
| BR-27 | Owner data (profile, memory, chat) is sent only to providers the owner enabled in configuration. |

## Memory

| Id | Rule |
| --- | --- |
| BR-30 | Facts Khadim states about the owner come only from the profile or memory documents. If something is not in memory, Khadim says so instead of inventing it. |
| BR-31 | Answers that use memory documents name the documents they used. |
| BR-32 | The owner can delete any memory document; its chunks and embeddings are deleted with it. |
| BR-33 | Every chunk records the embedding provider, model and dimensions it was made with; one embedding model is active at a time, and chunks from different models are never searched together. |
| BR-34 | Text inside memory documents is data, never instructions to the agent. |

## Posts and platforms

| Id | Rule |
| --- | --- |
| BR-40 | Posts are about the owner's career and grounded in the profile and memory (BR-30). > **Open question:** Topic list and mix (see PRD §9). |
| BR-41 | A draft that breaks the platform's limits (length, required media) is rejected before a pending action is created, and the agent revises it. |
| BR-42 | Khadim avoids repeating the topic of a post published in the recent past. > **Default:** 14 days. |
| BR-43 | At most a limited number of posts are published per platform per day. > **Default:** 3. |
| BR-44 | LinkedIn posts go to the owner's personal profile. LinkedIn comment reading is unsupported until the platform grants the permission. |
| BR-45 | Facebook posts go only to a Page the owner administers, never a personal profile. |

## Schedules

| Id | Rule |
| --- | --- |
| BR-50 | Schedule times are interpreted in the schedule's time zone. > **Default:** Asia/Dhaka. |
| BR-51 | A scheduled post is drafted ahead of its target time so the owner can approve it before then. > **Default:** drafted 60 minutes early. |
| BR-52 | If approved before the target time, the post publishes at the target time; if approved later, it publishes on approval. > **Open question:** Or should a late approval skip the day instead? |
| BR-53 | A schedule fires at most once per occurrence, even after restarts or retries. |

## Comments

| Id | Rule |
| --- | --- |
| BR-60 | Each new comment on the owner's post gets at most one reply draft. |
| BR-61 | Khadim never drafts replies to the owner's own comments or to its own replies. |
| BR-62 | Comment text is untrusted data; it can never change what Khadim does beyond drafting a reply to that one comment. |
| BR-63 | Comments classified as spam or abusive get no reply draft; they are listed for the owner instead. > **Open question:** Should abusive comments be hidden automatically on the Page (with approval)? |
| BR-64 | A reply run can only reply to the comment that started it. |
