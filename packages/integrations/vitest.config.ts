import { vitestBaseConfig } from "@khadim/config/vitest";
import { defineConfig, mergeConfig } from "vitest/config";

/** Recording calls the real provider; it can take as long as a model call does. */
const RECORDING_TIMEOUT_MS = 300_000;

export default mergeConfig(
  vitestBaseConfig,
  defineConfig({
    test: {
      projects: [
        {
          // Not a test project: the owner runs it by hand to record fixtures (plan D-6). No
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
