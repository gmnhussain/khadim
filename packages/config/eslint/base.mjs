import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import prettierConfig from "eslint-config-prettier";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import { importX } from "eslint-plugin-import-x";
import turbo from "eslint-plugin-turbo";
import { configs as typescriptConfigs } from "typescript-eslint";

/** Names whose leading underscore marks them as intentionally unused (conventions §8). */
const UNUSED_PATTERN = "^_";

/** Files a workspace typechecks with its tsconfig.test.json instead of its tsconfig.json. */
const TEST_PROJECT_FILES = ["**/*.test.ts", "vitest.config.ts"];
const TEST_TSCONFIG = "./tsconfig.test.json";

/** Paths no workspace ever lints. */
const IGNORED_PATHS = [
  "**/node_modules/**",
  "**/dist/**",
  "**/.next/**",
  "**/coverage/**",
  "**/.turbo/**",
];

/**
 * Base ESLint flat config for every workspace (conventions §6).
 * @param {{ tsconfigRootDir: string }} options
 */
export function createBaseConfig({ tsconfigRootDir }) {
  return defineConfig(
    { ignores: IGNORED_PATHS },
    js.configs.recommended,
    typescriptConfigs.strictTypeChecked,
    typescriptConfigs.stylisticTypeChecked,
    importX.flatConfigs.recommended,
    importX.flatConfigs.typescript,
    {
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      settings: {
        "import-x/resolver-next": [createTypeScriptImportResolver()],
      },
      plugins: { turbo },
      linterOptions: { reportUnusedDisableDirectives: "error" },
      rules: {
        "@typescript-eslint/consistent-type-imports": [
          "error",
          { fixStyle: "inline-type-imports" },
        ],
        "@typescript-eslint/no-explicit-any": "error",
        "@typescript-eslint/no-floating-promises": "error",
        "@typescript-eslint/no-misused-promises": "error",
        "@typescript-eslint/no-non-null-assertion": "error",
        "@typescript-eslint/switch-exhaustiveness-check": "error",
        // Options replace the preset's, so the strict ones are restated; only numbers are added.
        "@typescript-eslint/restrict-template-expressions": [
          "error",
          {
            allowAny: false,
            allowBoolean: false,
            allowNever: false,
            allowNullish: false,
            allowRegExp: false,
            allowNumber: true,
          },
        ],
        "@typescript-eslint/no-unused-vars": [
          "error",
          {
            argsIgnorePattern: UNUSED_PATTERN,
            varsIgnorePattern: UNUSED_PATTERN,
            caughtErrorsIgnorePattern: UNUSED_PATTERN,
            destructuredArrayIgnorePattern: UNUSED_PATTERN,
          },
        ],
        "import-x/no-duplicates": "error",
        // Cycles are checked once, by dependency-cruiser's no-circular rule; import-x/no-cycle
        // duplicates it and is slow with type-aware linting.
        // TypeScript already checks member access on default imports.
        "import-x/no-named-as-default-member": "off",
        eqeqeq: ["error", "always"],
        "no-console": "error",
        "no-param-reassign": "error",
        "no-else-return": "error",
        "prefer-object-has-own": "error",
        // An env variable Turbo does not know about is missing from cache keys (stale builds).
        "turbo/no-undeclared-env-vars": "error",
      },
    },
    {
      files: ["**/*.ts", "**/*.tsx"],
      // TypeScript reports unresolved imports more accurately.
      rules: { "import-x/no-unresolved": "off" },
    },
    {
      // Test files and the Vitest config are outside tsconfig.json (conventions §6), so the
      // project service cannot find them; they are linted with the project that typechecks them.
      files: TEST_PROJECT_FILES,
      languageOptions: {
        parserOptions: { projectService: false, project: TEST_TSCONFIG, tsconfigRootDir },
      },
    },
    {
      files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
      extends: [typescriptConfigs.disableTypeChecked],
    },
    prettierConfig,
  );
}
