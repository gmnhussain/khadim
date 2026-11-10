import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import prettierConfig from "eslint-config-prettier";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import { importX } from "eslint-plugin-import-x";
import { configs as typescriptConfigs } from "typescript-eslint";

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
        "import-x/no-cycle": "error",
        // TypeScript already checks member access on default imports.
        "import-x/no-named-as-default-member": "off",
        eqeqeq: ["error", "always"],
        "no-console": "error",
        "no-param-reassign": "error",
      },
    },
    {
      files: ["**/*.ts", "**/*.tsx"],
      // TypeScript reports unresolved imports more accurately.
      rules: { "import-x/no-unresolved": "off" },
    },
    {
      files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
      extends: [typescriptConfigs.disableTypeChecked],
    },
    prettierConfig,
  );
}
