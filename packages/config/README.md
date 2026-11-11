# @khadim/config

**Shared tooling presets for every workspace: TypeScript, ESLint, Prettier, Vitest, and the local port map.**

| Export | Use it in |
| --- | --- |
| `@khadim/config/tsconfig/base.json` | Base for all presets (strict flags from conventions §6) |
| `@khadim/config/tsconfig/node.json` | Code that runs on Node.js: `apps/api`, `apps/worker`, `packages/core`, `packages/integrations`, `packages/db` (add `@types/node` as a devDependency) |
| `@khadim/config/tsconfig/library.json` | Browser-safe code: `packages/contracts`. No Node.js types, so a Node-only API fails to typecheck |
| `@khadim/config/tsconfig/test.json` | Test files, typechecked separately (`tsc --noEmit -p tsconfig.test.json`); relaxes only `exactOptionalPropertyTypes` and the unused checks |
| `@khadim/config/eslint/node` | `createNodeConfig({ tsconfigRootDir: import.meta.dirname })` in Node workspaces |
| `@khadim/config/eslint/base` | Base for future presets |
| `@khadim/config/prettier` | Root `prettier.config.mjs` |
| `@khadim/config/vitest` | `vitestBaseConfig`, merged in each workspace's `vitest.config.ts`: `unit` and `integration` projects, and the per-file 100% coverage gate on `*.rules.ts`. Typed by `vitest/index.d.mts` |
| `@khadim/config/ports` | `PORTS` constants for local development: tooling, tests and scripts only |

## Dependencies

Every dependency of this package is a `devDependency`: it is build and lint tooling, never shipped code. Workspaces add `@khadim/config` as a `devDependency` too, so `pnpm audit --prod` audits only what runs in production and stays strict.

Production code (`src/`, outside test files) never imports `@khadim/config`, including `ports`; dependency-cruiser's `no-config-in-production` rule enforces this. Apps read their port from validated environment variables, and each app's `.env.example` uses the value from `PORTS`.

## Added later

- A Next.js tsconfig and an ESLint preset with React, React Hooks and Next rules, together with `apps/web` (Phase 1).
- The Prettier Tailwind plugin, together with `apps/web`.

## Example

```jsonc
// packages/core/tsconfig.json
{
  "extends": "@khadim/config/tsconfig/node.json",
  "include": ["src"]
}
```

```js
// packages/core/eslint.config.mjs
import { createNodeConfig } from "@khadim/config/eslint/node";

export default createNodeConfig({ tsconfigRootDir: import.meta.dirname });
```
