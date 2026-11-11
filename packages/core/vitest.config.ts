import { vitestBaseConfig } from "@khadim/config/vitest";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(vitestBaseConfig, defineConfig({}));
