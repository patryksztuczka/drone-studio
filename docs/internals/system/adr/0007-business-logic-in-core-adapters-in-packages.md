# Business logic in packages/core, each adapter in its own package

**Status:** superseded by root ADR 0016, 2026-11-27.

A CLI command, an MCP server or a local backend for a desktop app needs the same rules as the api. If the services lived in `apps/api`, each of them would have to call the api over HTTP, import `@drone-studio/api` with all its host dependencies, or implement the rules a second time.

Services and their ports live in `packages/core/src/<context>/`, exported per context as `@drone-studio/core/<context>` through `"./*": "./src/*/index.ts"`. Each adapter capability is its own package that implements core's ports: `packages/database` (repositories, migrations, the Testcontainers Postgres layer), `packages/mail` (Mailpit) and `packages/auth` (better-auth and the authentication middleware). Apps are composition roots: `apps/api` keeps `server.ts`, `app.layer.ts` and the thin HttpApi and RPC handlers, and `apps/cli` takes the migrations from `@drone-studio/database`. Dependencies point one way, `domain ← core ← database, mail, auth ← apps`, and `apps/web` depends on `domain` alone.

## Consequences

- `package.json` holds the boundary as well as lint does. `core` lists no `pg`, `@effect/sql-pg` or better-auth, so an adapter import in a service fails to resolve. `apps/web` lists no `core`, and pnpm's strict `node_modules` refuse the import. A deep import past a context's `index.ts` has no entry in `exports`.
- The lint fences point at the packages: `module-boundaries` and `service-id-matches-path` take `packages/core/src` as their root, `no-domain-adapters` and `no-domain-sql` fence `packages/core/src/**` and refuse `@drone-studio/database`, `@drone-studio/mail` and `@drone-studio/auth`. A service id starts with its package's import path: `drone-studio/core/todos/TodosService`, `drone-studio/auth/Auth`.
- A new adapter package needs no lint config change. The Effect rules run on every `packages/*`, `service-id-matches-path` derives its id prefix `drone-studio/<package>` from the folder name, and `no-domain-adapters` treats every `@drone-studio/*` import from core except `@drone-studio/domain` as an adapter.
- A composition root that calls a service in its own process skips the api's authentication middleware, and it decides which `ownerId` the service gets. Every new root needs an explicit identity source: a session checked through Identity in `packages/auth`, or an admin mode named as such in the root.
- The contract stays in `packages/domain`, and each transport keeps its own thin handlers. Root ADR 0005 is unchanged.

## Considered options

- One `packages/core` with `modules/` and `adapters/` folders inside: only lint would keep a service from importing an adapter, and every root would install every adapter's dependencies.
- Keep the logic in `apps/api`: a CLI or MCP server would call the api over HTTP, or import an app and its Worker dependencies.
- rat-stack's layout with the contract inside core: the browser would depend on core, and a lint rule instead of `package.json` would keep handlers out of its bundle. We keep `packages/domain` (root ADR 0005).
