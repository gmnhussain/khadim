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
      comment: "The browser app reaches the API only through contracts.",
      severity: "error",
      from: { path: "^apps/web/" },
      to: { path: "^packages/(core|integrations|db)/" },
    },
    {
      name: "core-not-to-integrations",
      comment: "Core defines ports; adapters implement them.",
      severity: "error",
      from: { path: "^packages/core/" },
      to: { path: "^packages/integrations/" },
    },
    {
      name: "core-vendor-free",
      comment: "Core never imports vendor SDKs or transport libraries.",
      severity: "error",
      from: { path: "^packages/core/" },
      to: {
        path: "node_modules/(@anthropic-ai|openai|@google/genai|@google/generative-ai|ollama|ai|@ai-sdk|voyageai|bullmq|ioredis|express|next|react|axios)(/|$)",
      },
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
