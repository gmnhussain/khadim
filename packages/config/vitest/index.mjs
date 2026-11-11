/**
 * Shared Vitest options (conventions §19). Workspaces merge them with `mergeConfig` from
 * "vitest/config" and run one kind of test with `vitest run --project unit|integration`.
 */

/** Unit test files: fast, no I/O. */
export const UNIT_TEST_PATTERN = "src/**/*.test.ts";

/** Integration test files: real PostgreSQL and Redis via Testcontainers. */
export const INTEGRATION_TEST_PATTERN = "src/**/*.int.test.ts";

/** Pure rules files, which must keep 100% coverage, file by file (conventions §19). */
export const RULES_FILE_PATTERN = "src/**/*.rules.ts";

/** Containers start slowly on a cold machine. */
const INTEGRATION_TIMEOUT_MS = 120_000;

export const vitestBaseConfig = Object.freeze({
  test: {
    environment: "node",
    restoreMocks: true,
    unstubEnvs: true,
    // Only until Phase 1a's first tests exist: it would also hide a test glob that matches
    // nothing. The 1a plan removes it (foundation-review slice 2).
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      include: ["src/**"],
      reporter: ["text", "html"],
      // Glob thresholds do not inherit a top-level perFile, so it is set on the glob.
      thresholds: { [RULES_FILE_PATTERN]: { 100: true, perFile: true } },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: [UNIT_TEST_PATTERN],
          exclude: ["**/node_modules/**", "**/dist/**", INTEGRATION_TEST_PATTERN],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: [INTEGRATION_TEST_PATTERN],
          testTimeout: INTEGRATION_TIMEOUT_MS,
          hookTimeout: INTEGRATION_TIMEOUT_MS,
        },
      },
    ],
  },
});
