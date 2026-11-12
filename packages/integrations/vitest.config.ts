import { vitestBaseConfig } from "@khadim/config/vitest";
import { defineConfig, mergeConfig } from "vitest/config";

/** Recording calls the real provider; it can take as long as a model call does. */
const RECORDING_TIMEOUT_MS = 300_000;

export default mergeConfig(
  vitestBaseConfig,
  defineConfig({
    test: {
      coverage: {
        // Production code only: test helpers, hand-built fixtures and the owner-only recording
        // script are not what the coverage report is about (finding I17).
        exclude: ["src/**/testing/**", "src/**/fixtures/**", "src/**/*.record.ts"],
      },
      projects: [
        {
          // Not a test project: the owner runs it by hand to record fixtures (phase-1 plan, D-6). No
          // test script includes it, so no test run ever calls a real model.
          extends: true,
          test: {
            name: "record",
            include: ["src/testing/recording/*.record.ts"],
            testTimeout: RECORDING_TIMEOUT_MS,
          },
        },
      ],
    },
  }),
);
