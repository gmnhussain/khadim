/** Unit test files: fast, no I/O. */
export declare const UNIT_TEST_PATTERN: string;

/** Integration test files: real PostgreSQL and Redis via Testcontainers. */
export declare const INTEGRATION_TEST_PATTERN: string;

/** Pure rules files, which must keep 100% coverage, file by file (conventions §19). */
export declare const RULES_FILE_PATTERN: string;

/** Shared Vitest options; merge them with `mergeConfig` from "vitest/config". */
export declare const vitestBaseConfig: Readonly<{ test: Readonly<Record<string, unknown>> }>;
