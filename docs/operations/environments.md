# Environments

**The environments Khadim runs in and how each is configured.**

| Environment | Purpose | Data | Infrastructure |
| --- | --- | --- | --- |
| `local` | Development | Seed data, owner's test accounts | Docker Compose (`infra/`) |
| `test` | CI and integration tests | Created per test run | Testcontainers in GitHub Actions |
| `production` | The owner's real assistant | Real memory, real platform connections | See [deployment](deployment.md) |

A `staging` environment is added when there is a second person or a risky migration (conventions §20).

## Configuration

- All configuration comes from environment variables, validated with Zod at startup; a process exits on invalid configuration.
- Each app documents its variables in its `.env.example`.
- Every process runs with `TZ=UTC`; business time zones come from settings (default `Asia/Dhaka`).

## Platform accounts per environment

| Platform | Local and test | Production |
| --- | --- | --- |
| Anthropic | Separate API key with a low spend limit | Production key with a spend limit |
| OpenAI, Google Gemini, other hosted providers | Optional; separate keys with low spend limits, only when routed | Keys only for providers in use |
| Local models (Ollama, LM Studio) | Optional; free, runs on the developer machine | Only if the host can run them |
| LinkedIn | Developer app in development mode, owner as tester | Same app after verification, if required |
| Facebook | Meta app in development mode with a test Page; only accounts with a role on the app | Same app; App Review only if used beyond app roles |
