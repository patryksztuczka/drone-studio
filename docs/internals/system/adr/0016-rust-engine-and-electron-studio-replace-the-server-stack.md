# The Rust engine and the Electron Studio replace the server stack

**Status:** accepted, 2026-11-27.

Drone Studio started from a template built around a TypeScript api: services in `packages/core`, contracts in `packages/domain` projected onto HttpApi, RPC and MCP, Postgres, better-auth, and a container deployed with Alchemy. The product is not that. It is a workbench for one drone's digital twin, where the physics must run deterministically at 1 to 2 kHz, the flight controller must be the same `no_std` code in SITL, in Renode and on an STM32, and AI agents must drive every step as reproducibly as a person does ([blueprint](../../../vision/drone-studio-m0-m1-blueprint.md)). None of that fits a Node server, and nobody signs in to a tool that runs on the owner's machine.

The Rust workspace owns the domain. The hardware manifests in `hardware/` are the one source of truth, and `drone codegen` turns them into the firmware, simulator, Renode and Studio configuration. The crates in `crates/` hold the schema and codegen, the protocol, the simulator, the telemetry store, the `drone-engine` daemon, the `drone` CLI and the `drone-mcp` server; `firmware/` holds the flight core and its targets, and `emu/` the Renode track. An agent reaches all of it through `drone … --json` and `drone-mcp`, never through the UI.

The Studio is a thin client. `apps/desktop` is an Electron shell whose renderer is the React app in `apps/web`; it starts the local `drone-engine` sidecar and talks to it over WebSocket JSON-RPC on localhost, with binary frames for the live state. The renderer holds no physics, hardware or flight logic. There is no server, no database and no authentication until a later milestone needs one, and that milestone writes its own ADR.

## Consequences

- Root ADRs 0003, 0005 to 0015 no longer hold and are superseded by this one. Root ADRs 0001, 0002 and 0004 still hold for the TypeScript side: one pnpm workspace on Vite+, Effect in the desktop main process, and `VENDOR:` comments only. The Cargo workspace sits beside the pnpm one in the same repository.
- `pnpm verify` and CI run `cargo fmt --check`, `cargo clippy -D warnings` and `cargo test` next to the TypeScript checks, so a Rust change fails the same gate as a TypeScript one.
- What survives of the desktop decision in root ADR 0008: Electron APIs are called only in `apps/desktop/src/main.ts`, and its decisions (which file serves a request, where a navigation may go) are plain functions with tests. In development the window opens this checkout's Vite server. A packaged window serves `apps/web/dist` through `protocol.handle` on the fixed origin `https://studio.invalid`. That origin was rejected before only because better-auth checked callback URLs against it, and better-auth is gone.
- What survives of root ADR 0010: state in the renderer lives in Effect atoms, not React Query, and lint still refuses `@tanstack/react-query`. The atoms and the engine client go in a new package when the engine's protocol exists. `packages/client-runtime` was deleted with the api it called.
- Real hardware is read-only by default. A motor command reaches a real board only through the Safety Gate planned for M2.

## Considered options

- Keep the TypeScript api as the engine's front door: a second process and a second language between the UI and the simulator, with no user, session or remote client to justify it.
- Run the simulator in the Electron main process through N-API: it ties the engine's lifecycle to the window, and the CLI and the MCP server would need a second host for the same code.
- Keep `packages/core` and `packages/domain` empty for later: shells that every check has to carry, which come back from the template's history in one commit if a server is ever needed.
