/** Scopes are modules, apps and repo areas (conventions §3). */
const SCOPES = [
  "agent",
  "llm",
  "tools",
  "memory",
  "social",
  "approvals",
  "schedules",
  "connections",
  "channels",
  "web",
  "api",
  "worker",
  "core",
  "integrations",
  "db",
  "contracts",
  "config",
  "evals",
  "e2e",
  "infra",
  "ci",
  "deps",
  "docs",
  "repo",
];

/** Conventional Commits, checked by the commit-msg hook and in CI. */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [2, "always", SCOPES],
    "header-max-length": [2, "always", 72],
    "subject-full-stop": [2, "never", "."],
  },
};
