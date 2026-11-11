import { createNodeConfig } from "@khadim/config/eslint/node";
import { defineConfig } from "eslint/config";

/**
 * Root config lints only root-level files; each workspace lints itself. `reference/` is parked
 * (AGENTS.md), and ESLint does not read .gitignore.
 */
export default defineConfig(
  { ignores: ["apps/**", "packages/**", "e2e/**", "evals/**", "reference/**"] },
  createNodeConfig({ tsconfigRootDir: import.meta.dirname }),
);
