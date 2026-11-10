import { execFileSync } from "node:child_process";

/** Returns true when the current directory is inside a git work tree. */
function isGitRepository() {
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// Conventions §3: hooks live in .githooks; skip quietly before `git init` or without git.
if (isGitRepository()) {
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "inherit" });
}
