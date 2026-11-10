/**
 * Local development ports, the single source for tooling, tests, scripts and docs (conventions §20).
 * Never imported by production code: apps read their port from validated env, whose
 * .env.example values come from here.
 * Non-default values avoid clashes with other projects on the same machine.
 * infra/docker-compose.yml uses the same values as its defaults.
 */
export const PORTS = Object.freeze({
  web: 3100,
  api: 4100,
  postgres: 55432,
  redis: 56379,
});
