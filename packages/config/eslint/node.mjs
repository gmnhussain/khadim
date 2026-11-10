import { defineConfig } from "eslint/config";
import globals from "globals";

import { createBaseConfig } from "./base.mjs";

/**
 * ESLint flat config for Node workspaces: api, worker, packages and root files.
 * @param {{ tsconfigRootDir: string }} options
 */
export function createNodeConfig({ tsconfigRootDir }) {
  return defineConfig(createBaseConfig({ tsconfigRootDir }), {
    languageOptions: { globals: globals.node },
  });
}
