import { createNodeConfig } from "@khadim/config/eslint/node";
import { defineConfig } from "eslint/config";

/** Root config lints only root-level files; each workspace lints itself. */
export default defineConfig(
  { ignores: ["apps/**", "packages/**", "e2e/**", "evals/**"] },
  createNodeConfig({ tsconfigRootDir: import.meta.dirname }),
);
