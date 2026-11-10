# @khadim/db

**Drizzle ORM schema, migrations, pgvector setup, seeds and test helpers for PostgreSQL 18. Built in Phase 1.**

- One file per table; rules in conventions §13; planned model in [data model](../../docs/architecture/data-model.md).
- The first migration creates the `vector` extension.
- Better Auth tables live in `src/auth/`, exported as `@khadim/db/auth`: the only part of this package the web app may import (ADR-0007).

Not built yet: this folder holds only this README until its phase (conventions §2.3).
