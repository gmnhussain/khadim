# Development setup

**How to get a working local environment for Khadim on Windows, macOS or Linux.**

## Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 24 LTS | Version in `.nvmrc`; use nvm, fnm or the official installer |
| pnpm | 10 | Enabled through Corepack (bundled with Node.js) |
| Git | Recent | Configure `core.autocrlf=false` on Windows; `.gitattributes` handles line endings |
| Docker Desktop | Recent | Runs PostgreSQL and Redis |
| VS Code | Optional | Accept the recommended extensions in `.vscode/extensions.json` |

## First-time setup

```bash
git init                         # if this is a fresh copy
corepack enable                  # makes the pinned pnpm available
pnpm install                     # installs dependencies and enables .githooks
cp infra/.env.example infra/.env # then change POSTGRES_PASSWORD
pnpm infra:up                    # starts PostgreSQL + pgvector and Redis
```

On Windows PowerShell, use `Copy-Item infra/.env.example infra/.env` instead of `cp`.

To move to the newest pnpm 10 release, run `corepack use pnpm@10` and commit the updated `packageManager` field.

## Checks

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm depcruise
pnpm build
```

All must pass with zero warnings before a change is ready (conventions §22).

## Local ports

| Service | Port |
| --- | --- |
| Web | 3100 |
| API | 4100 |
| PostgreSQL | 55432 |
| Redis | 56379 |

The single source is `@khadim/config/ports`; `infra/docker-compose.yml` and each app's `.env.example` use the same values. Apps read their port from the environment, never from `@khadim/config` at runtime.

## Environment variables

- Each app gets its own `.env.example`, added with the app. Copy it to `.env` and fill in values. Never commit `.env` files.
- Provider API keys (Anthropic, and OpenAI or Gemini when used) go only in the API and worker `.env` files, never in global environment variables. A global `ANTHROPIC_API_KEY` would also be picked up by other tools on your machine.
- A provider is enabled only when its configuration is present (ADR-0009). You can develop with just one provider.

## Optional: local models

To run models on your own machine at no API cost, install [Ollama](https://ollama.com), pull a model that supports tool calling, and point the OpenAI-compatible provider at `http://localhost:11434/v1`. Local models are slower and less capable than hosted ones; use them for cheap tasks or experiments.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `pnpm` not found | Run `corepack enable`, then open a new terminal |
| Engine error on install | Switch to Node.js 24 (`nvm use`) |
| Commit rejected by the hook | Use a Conventional Commit message with a valid scope (see `commitlint.config.mjs`) |
| Port already in use | Change the port in `infra/.env` and the matching app `.env` |
