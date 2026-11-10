# Deployment

**How Khadim is built and deployed. The target host is still an open question; the build approach is fixed by conventions §20.**

> **Open question:** Where will production run (your own machine, a VPS, a container platform)? Platform webhooks and OAuth callbacks need a stable public HTTPS address from Phase 3.

## Approach

- One Docker image per app (`web`, `api`, `worker`), built with multi-stage Dockerfiles; images run as a non-root user.
- Only a reverse proxy (TLS termination) is public; the API is reachable from the web app and platform webhooks only through it.
- Database migrations run once, as a separate step, before new containers start.
- PostgreSQL and Redis are managed services or containers with persistent volumes.
- Daily database backups with a restore tested at least once per quarter.
- Secrets come from the host's secret store, never from files in the image.

## Release flow

1. Merge to `main` after CI passes.
2. Build and tag images with the commit SHA.
3. Run migrations.
4. Deploy `api` and `worker`, then `web`.
5. Check `GET /health` and `GET /ready`.

The deployment pipeline is written in the phase that first needs production (expected Phase 3).
