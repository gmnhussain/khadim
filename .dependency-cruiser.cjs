/**
 * Architecture boundaries (conventions §5.3), checked in CI with `pnpm depcruise`.
 * @type {import("dependency-cruiser").IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      comment: "Cycles hide coupling between modules.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "packages-not-to-apps",
      comment: "Packages are shared; apps are deployables.",
      severity: "error",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },
    {
      name: "no-app-to-app",
      comment: "An app never imports another app.",
      severity: "error",
      from: { path: "^apps/([^/]+)/" },
      to: { path: "^apps/", pathNot: "^apps/$1/" },
    },
    {
      name: "web-not-to-server-packages",
      comment:
        "The browser app reaches the API only through contracts. ADR-0007: it may import only the auth tables of db.",
      severity: "error",
      from: { path: "^apps/web/" },
      to: { path: "^packages/(core|integrations|db)/", pathNot: "^packages/db/src/auth/" },
    },
    {
      name: "core-not-to-integrations",
      comment: "Core defines ports; adapters implement them.",
      severity: "error",
      from: { path: "^packages/core/" },
      to: { path: "^packages/integrations/" },
    },
    {
      name: "core-allowed-packages-only",
      comment:
        "Core imports only allowlisted packages: zod, and drizzle-orm for repositories (ADR-0012). Workspace packages and Node built-ins are allowed. Extend the list only through an approved plan.",
      severity: "error",
      from: { path: "^packages/core/" },
      to: {
        path: "node_modules/",
        pathNot: "node_modules/(zod|drizzle-orm)(/|$)",
      },
    },
    {
      name: "no-unresolvable",
      comment: "Every import resolves; an unresolved import could also slip past the allowlist.",
      severity: "error",
      from: { path: "^(apps|packages)/" },
      to: { couldNotResolve: true },
    },
    {
      name: "integrations-only-core-ports",
      comment: "Adapters import core ports and types, never core services.",
      severity: "error",
      from: { path: "^packages/integrations/" },
      to: {
        path: "^packages/core/src/",
        pathNot: "\\.(port|types|errors)\\.ts$",
      },
    },
    {
      name: "core-module-boundaries",
      comment: "Core modules import each other only through index.ts.",
      severity: "error",
      from: { path: "^packages/core/src/([^/]+)/" },
      to: {
        path: "^packages/core/src/[^/]+/",
        pathNot: ["^packages/core/src/$1/", "^packages/core/src/[^/]+/index\\.ts$"],
      },
    },
    {
      name: "not-to-test-files",
      comment: "Production code never imports test files.",
      severity: "error",
      from: { pathNot: "\\.(test|int\\.test|spec|eval)\\.ts$" },
      to: { path: "\\.(test|int\\.test|spec|eval)\\.ts$" },
    },
    {
      name: "not-to-dev-dependencies",
      comment: "Production code never imports devDependencies.",
      severity: "error",
      from: {
        path: "^(apps|packages)/[^/]+/src/",
        pathNot: "\\.(test|int\\.test|spec)\\.ts$",
      },
      to: { dependencyTypes: ["npm-dev"] },
    },
    {
      name: "no-config-in-production",
      comment:
        "@khadim/config is tooling, installed as a devDependency. Workspace imports resolve to local paths, which not-to-dev-dependencies cannot classify, so this rule names the package.",
      severity: "error",
      from: {
        path: "^(apps|packages)/[^/]+/src/",
        pathNot: "\\.(test|int\\.test|spec)\\.ts$",
      },
      to: { path: "^packages/config/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(^|/)(dist|\\.next|coverage|\\.turbo)/" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
    },
  },
};
