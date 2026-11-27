<h1 align="center">Drone Studio</h1>

<p align="center">
  <strong>A digital-twin workbench for the <code>palm_x4_2in</code> micro quad.</strong><br>
  One hardware source of truth, a deterministic simulator, one flight core from SITL to the STM32, and every step drivable by an AI agent.
</p>

<p align="center">
  <a href="#quickstart">Quickstart</a> ·
  <a href="AGENTS.md">AGENTS.md</a> ·
  <a href="docs/README.md">Docs</a> ·
  <a href="docs/vision/drone-studio-m0-m1-blueprint.md">Blueprint</a>
</p>

## What it is

- **One source of truth.** The components, the board, the airframe and the flight scenarios are YAML manifests in `hardware/`. `drone codegen` generates the firmware configuration, the simulator model, the Renode platform and the Studio's board view from them.
- **Deterministic SITL.** A 6DOF simulator steps in lockstep with the flight controller from a seed, so the same scenario and seed always record the same run in `runs/`.
- **One flight core everywhere.** The `no_std` flight core runs unchanged in SITL, on an emulated STM32H7 in Renode, and on the real board.
- **Agents first.** The `drone` CLI (`--json`) and the `drone-mcp` server expose validation, codegen, simulation, analysis, diffs and the Renode smoke test, so an agent works the way a person does.
- **A thin Studio.** Drone Studio is an Electron app whose React renderer talks to the local `drone-engine` sidecar over WebSocket JSON-RPC. It shows and steers; the physics and the flight logic stay in Rust.

The [blueprint](docs/vision/drone-studio-m0-m1-blueprint.md) (in Polish) lays out the drone, the architecture and the M0 and M1 milestones. Root ADR 0016 records why there is no server, database or sign-in.

## Stack

- **Rust 1.99.0**, pinned in `rust-toolchain.toml` with rustfmt, clippy and the `thumbv7em-none-eabihf` target, for the crates in `crates/` and the firmware in `firmware/`.
- **Electron 45** for the desktop shell in `apps/desktop`, its main process an Effect 4.0.7 program.
- **React 19** with Tailwind 4 and the React Compiler for the Studio renderer in `apps/web`.
- **Vite+ 1.4.0** (`vp`): dev server, build, Vitest, oxlint, oxfmt, task runner and Git hooks.
- **TypeScript 7** with Effect diagnostics, **pnpm 11**, **Node 26**.

## Quickstart

You need Node 26 with pnpm 11, and [rustup](https://rustup.rs). rustup installs the toolchain `rust-toolchain.toml` names the first time `cargo` runs here.

```sh
pnpm install         # dependencies and the Git hooks
pnpm verify          # every check CI runs, cargo fmt, clippy and test included
pnpm dev:desktop     # the Studio window on this checkout's web dev server
```

[Local development](docs/operations/development.md) covers ports, the environment and bundle mode.

## Fly it

```sh
cargo run -q --release -p drone-cli -- sim suite            # five baseline scenarios in SITL, under two seconds
cargo run -q --release -p drone-cli -- analyze latest --anomalies
cargo run -q --release -p drone-cli -- emu smoke            # the real STM32H743 firmware booted in Renode (Docker)
pnpm dev:desktop                                            # Drone Studio, with drone-engine started for you
```

The [flight lab guide](docs/user/flight-lab.md) covers tuning, diffs and the MCP tools; the [Studio guide](docs/user/studio.md) covers the desktop app.

## Thanks

Drone Studio's tooling comes from the boberstack template, which borrows from people who got there first:

- [rat-stack](https://github.com/joelhooks/rat-stack) by Joel Hooks. See [`UPSTREAM.md`](UPSTREAM.md).
- [pstack](https://github.com/cursor/plugins/tree/main/pstack) by Lauren Tan: the principle, playbook and review skills in `.agents/skills/` started there. See [`.agents/skills/UPSTREAM.md`](.agents/skills/UPSTREAM.md).
- [anti-slop](https://github.com/dmmulroy/anti-slop) by Dillon Mulroy: the `anti-slop` lint rules. See [`tools/oxlint/anti-slop/UPSTREAM.md`](tools/oxlint/anti-slop/UPSTREAM.md).

## License

Add your own before you publish.

## Origin

This project started from the template at https://github.com/patryksztuczka/boberstack, commit [`37fc3b3db632fe190e8e5311ecb1a1de37fa3bee`](https://github.com/patryksztuczka/boberstack/tree/37fc3b3db632fe190e8e5311ecb1a1de37fa3bee), on 2026-11-27.

Setup cut the mobile app, the api server, the Node CLI, the Alchemy, Docker and Cloudflare deploy, Postgres and the database package, Mailpit and the mail package, better-auth, MCP, RPC and HttpApi with the contract and capability packages, `packages/core` and `packages/client-runtime`, i18n, the todos example, the welcome page and the beaver. It kept the web app, reduced to the Studio renderer, the desktop app and `packages/ui`. To cut a part later or bring one back, read its section in the template's [keep-or-cut skill](https://github.com/patryksztuczka/boberstack/blob/37fc3b3db632fe190e8e5311ecb1a1de37fa3bee/.agents/skills/keep-or-cut/SKILL.md): it lists every file and line the part touches. To bring a part back, copy those from the template, then compare with the template's latest `master` for newer versions.
