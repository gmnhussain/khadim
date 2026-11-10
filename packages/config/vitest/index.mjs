/**
 * Shared Vitest options (conventions §19). Workspaces merge them with `mergeConfig`
 * from "vitest/config" and add their own include patterns.
 */
export const vitestBaseConfig = Object.freeze({
  test: {
    environment: "node",
    restoreMocks: true,
    unstubEnvs: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
});

/** Unit test files: fast, no I/O. */
export const UNIT_TEST_PATTERN = "src/**/*.test.ts";

/** Integration test files: real PostgreSQL and Redis via Testcontainers. */
export const INTEGRATION_TEST_PATTERN = "src/**/*.int.test.ts";
