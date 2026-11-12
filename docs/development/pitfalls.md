# Known pitfalls

**Traps in Khadim's stack that are easy to fall into and costly to find later, each with what to do instead. Plans cite them by id (`KP-xx`); a plan's own pitfalls stay `P-xx` in that plan.**

Add a pitfall when one is hit, or found by a probe, and is likely to be hit again. Keep each to one row.

## Tooling and dependencies

| Id | Pitfall | What to do |
| --- | --- | --- |
| KP-01 | Setting options on a rule from a preset (`strictTypeChecked`) **replaces** the preset's options, and the rule's loose defaults return. Found with `restrict-template-expressions` (foundation review, slice 2). | Restate every strict option when overriding one; check with `eslint --print-config <file>`. |
| KP-02 | ESLint does not read `.gitignore`, so a git-ignored folder is still linted by `eslint .`. Found with `reference/` (slice 4). | List parked and generated folders in the root ESLint `ignores`. Prettier does read `.gitignore`. |
| KP-03 | With `minimumReleaseAge`, `pnpm add` re-resolves optional platform binaries already in the lockfile, so an unrelated add fails on a young binary. Found with `unrs-resolver` (slice 2). | Add the exact `name@version` exclusions with a removal date; frozen installs are not affected. |
| KP-04 | `pnpm install` can move unrelated transitive versions. | Read the lockfile diff after every install; restore it and re-add only your change if anything else moved (conventions §6). |
| KP-05 | Mixed line endings on Windows. | `.gitattributes` and `.editorconfig` already set LF; scripted edits keep each file's endings. |
| KP-06 | A stopped shell can leave a Node child holding a port. | Check the port before and after; never kill a process you did not start (conventions §2.3). |
| KP-18 | The npm audit feed can lag days behind a project's own security advisories, so a passing `pnpm audit` does not prove a version is safe. Found with Vite GHSA-p4f5-76q4-ffq7 (increments 1–2). | When every maintained line of a package is patched on the same day, check that project's advisories page before choosing a version; take the patch with an exact release-age exclusion, its reason and removal date (conventions §6). |

## TypeScript and packages

| Id | Pitfall | What to do |
| --- | --- | --- |
| KP-07 | `exactOptionalPropertyTypes` rejects `{ field: undefined }`. | Conditional spreads: `...(value !== undefined ? { field: value } : {})` (conventions §7). |
| KP-08 | Indexing an object with a key from a request or a model can reach prototype keys (`constructor`, `__proto__`). | `Object.hasOwn(object, key)` first (conventions §7). |
| KP-09 | A browser bundle that imports a whole package or a contracts barrel ships every schema and can pull in server code. | Import by subpath, one per file (conventions §5.4); there is no package-root barrel. |
| KP-10 | Next.js (Turbopack) can fail to resolve imports inside source-shipped workspace packages that a Node run accepts. | One `exports` subpath per file, no file extensions; prove it with `next build`, not only `tsc`. |
| KP-21 | Zod 4 `z.record` silently drops a `__proto__` key from JSON-parsed input, before the key schema runs, so neither the parse nor a key pattern reports it. Found with Zod 4.6.7 (review fixes, slice 2). | Configuration records use `namedRecordSchema` (`core/src/shared/names.ts`), which checks the raw object's own keys before `z.record` parses it. |
| KP-22 | Zod 4 keeps running a schema's checks after one fails, so a `.refine` still runs on a string that failed `.max()`, and the caller gets both issues. Found with Zod 4.6.7 (review fixes, slice 2). | Pass `{ abort: true }` to the check that must stop the rest, such as a length limit before an expensive refine. |

## Database and jobs

| Id | Pitfall | What to do |
| --- | --- | --- |
| KP-11 | drizzle-kit asks interactively when a change looks like a rename, and fails without a terminal (CI, agents). | Additive changes; never rename together with other edits; ask before a rename (conventions §13). |
| KP-12 | PostgreSQL silently truncates identifiers over 63 characters, so two long constraint names can collide. | Check generated names; name long constraints explicitly (conventions §13). |
| KP-13 | Raw SQL with typed table names breaks when a table or schema is renamed. | Interpolate Drizzle table and column objects in `sql` templates. |
| KP-14 | `count(*)` and `bigint` come back from PostgreSQL as strings. | Convert at the repository (`Number(row.total ?? 0)`), or use a `bigint` mode that returns numbers for values within safe-integer range. |
| KP-15 | BullMQ rejects some characters in custom job ids, and a deterministic id deduplicates only while the job is still held. | Ids use `[A-Za-z0-9._-]` (conventions §8); handlers also check the state of their work ([background jobs](../architecture/background-jobs.md)). |

## Observability and APIs

| Id | Pitfall | What to do |
| --- | --- | --- |
| KP-16 | Prompts, chat text or personal data leak into logs, traces or error reports through an error message or a library's default capture. | Log ids and counts only; logger redaction; tracing content capture off; test both (conventions §14, §15.9). |
| KP-19 | Anthropic's strict tools (`strict: true`) accept only part of JSON Schema: `maxLength`, `minLength`, `minimum`, `maximum` and similar keywords are a 400, recursive schemas are not supported, and a request may hold at most 20 strict tools, 24 optional parameters and 16 union-typed parameters across all of them. Zod emits those keywords, and nothing counts the limits yet. Found in the provider's docs (increment 6). | The adapter's own transform (`strict-schema.ts`) keeps what strict mode accepts, `enum` and `const` included, and moves the rest into the field's description; core still enforces every keyword with Zod. Its kept-keyword list cites the provider's docs: re-check it on every SDK upgrade. Not the SDK's `transformJSONSchema` (KP-23). The plan that first adds more tools (Phase 6, MCP) builds a startup check for the limits. |
| KP-20 | Anthropic reports a prompt over the context limit as a plain 400 `invalid_request_error`, with no code of its own. The adapter maps it to `LLM_CONTEXT_EXCEEDED` by matching the documented message, "prompt is too long"; if the provider rewords it, the run fails with `LLM_REQUEST_REJECTED` instead. | A contract test pins the match on a fixture. That fixture is hand-built, so it cannot see a rewording by itself: re-check the wording against the provider's docs on every SDK upgrade, and replace the fixture with a recording when one is available. The same limit holds for every hand-built fixture: until the deferred recording is done (phase-1 plan, D-6), the success fixtures prove only our reading of the provider's docs, not the live API. |
| KP-23 | The Anthropic SDK's `transformJSONSchema` (1.3.0) moves `enum` and `const` into the description, so strict decoding no longer limits the value, and throws a plain `Error` on a subschema without `type`, which crosses the port as a vendor error. Found in the 1a review (I2, I3). | The adapter's own transform (review fixes, D-8). `defineTool` refuses an input schema with an untyped subschema, so such a tool stops startup. |
| KP-17 | When an OpenAPI generator registers named schemas, extending a registered schema emits `allOf` and `$ref`, which some client generators mishandle. | Extend the unnamed base object, then register the result. Confirm with the generator chosen in Phase 1b. |
