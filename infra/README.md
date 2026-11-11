# infra

**Local infrastructure for development: PostgreSQL 18 with pgvector, and Redis for BullMQ.**

| Service | Image |
| --- | --- |
| PostgreSQL + pgvector | `pgvector/pgvector:pg18` |
| Redis | `redis:8-alpine` |

Ports are listed in the [README](../README.md#local-ports).

```bash
cp infra/.env.example infra/.env   # then change POSTGRES_PASSWORD
pnpm infra:up                      # start and wait until healthy
pnpm infra:down                    # stop (data is kept in Docker volumes)
```

- Ports bind to `127.0.0.1` only and use non-default numbers (see `@khadim/config/ports`).
- The `vector` extension is created by the first database migration, not by this compose file, so local, test and production databases are set up the same way.
- A mail catcher is added here when email features arrive.
