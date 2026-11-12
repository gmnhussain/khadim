import { readFileSync } from "node:fs";

import type { PromptFile } from "../agent.types";

/** `<purpose>.v<n>`, optionally `.<provider>` (conventions §8). */
const PROMPT_VERSION_PATTERN = /^[a-z][a-z0-9-]*\.v[1-9][0-9]*(?:\.[a-z][a-z0-9-]*)?$/;

/**
 * Reads a versioned prompt file from this folder, once, at startup (conventions §15.5).
 * The version is recorded on every run that uses the prompt.
 */
export function loadPromptFile(version: string): PromptFile {
  if (!PROMPT_VERSION_PATTERN.test(version)) {
    throw new Error(`prompt version is not <purpose>.v<n>: ${version}`);
  }
  const text = readFileSync(new URL(`./${version}.md`, import.meta.url), "utf8").trim();
  if (text === "") {
    throw new Error(`prompt file is empty: ${version}`);
  }
  return { version, text };
}
