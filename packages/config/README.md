# @khadim/config

**Shared tooling presets for every workspace: TypeScript, ESLint, Prettier, Vitest, and the local port map.**

| Export | Use it in |
| --- | --- |
| `@khadim/config/tsconfig/base.json` | Base for all presets (strict flags from conventions §6) |
| `@khadim/config/tsconfig/node.json` | `apps/api`, `apps/worker` |
| `@khadim/config/tsconfig/library.json` | `packages/*` |
| `@khadim/config/eslint/node` | `createNodeConfig({ tsconfigRootDir: import.meta.dirname })` in Node workspaces |
| `@khadim/config/eslint/base` | Base for future presets |
| `@khadim/config/prettier` | Root `prettier.config.mjs` |
| `@khadim/config/vitest` | `vitestBaseConfig`, merged in each workspace's `vitest.config.ts` |
| `@khadim/config/ports` | `PORTS` constants for local development |

## Added later

- A Next.js tsconfig and an ESLint preset with React, React Hooks and Next rules, together with `apps/web` (Phase 1).
- The Prettier Tailwind plugin, together with `apps/web`.

## Example

```jsonc
// packages/core/tsconfig.json
{
  "extends": "@khadim/config/tsconfig/library.json",
  "include": ["src"]
}
```

```js
// packages/core/eslint.config.mjs
import { createNodeConfig } from "@khadim/config/eslint/node";

export default createNodeConfig({ tsconfigRootDir: import.meta.dirname });
```
