# Agent instructions

This file is the repo law for agents and contributors: what the project is for, the commands, where code goes, and when to stop and ask. How code is written is in [CODING_STANDARDS.md](CODING_STANDARDS.md). All documentation is indexed in [docs/README.md](docs/README.md).

## Project thesis

Drone Studio is a digital-twin workbench for one drone, the `palm_x4_2in` micro quad: a 95 mm, 2S, STM32H743 quad that fits on a palm ([blueprint](docs/vision/drone-studio-m0-m1-blueprint.md)). Everything about the drone starts from one YAML source of truth in `hardware/`, and `drone codegen` turns it into the firmware's configuration, the simulator's model, the Renode platform and the Studio's board view. Nothing generated is edited by hand.

A flight is deterministic software-in-the-loop: the 6DOF simulator steps in lockstep with the flight controller from a seed, so the same scenario and seed always record the same run in `runs/`. The flight controller is one `no_std` flight core that runs unchanged in SITL, in Renode and on the STM32.

AI agents drive all of it the way a person does: the `drone` CLI with `--json` and the `drone-mcp` server expose validation, codegen, simulation, analysis, diffs and the Renode smoke test. Drone Studio, the Electron app, is a thin client of the local `drone-engine` sidecar over WebSocket JSON-RPC; it shows and steers, and holds no physics or flight logic (root ADR 0016).

It optimises for a codebase an agent can extend without making it worse. Every rule that can be a lint rule, a type, a test or a hook is one, so a mistake fails `pnpm verify` instead of waiting for a reviewer. Rules that cannot be checked live in one place each and are short.

## General rules

- This project started from a template. To bring back a part cut at setup, or to compare with the template, read the "Origin" section of the README.
- Read [CONTEXT-MAP.md](CONTEXT-MAP.md) and the context's `GLOSSARY.md` before naming anything. Code uses the glossary's words.
- The Rust workspace owns the domain: hardware, simulation, flight control, telemetry, the CLI and MCP. The Studio renders what `drone-engine` sends and sends commands back; a rule that decides how the drone flies never lives in TypeScript (root ADR 0016).
- Before writing or reviewing Effect code, load the `effect-best-practices` skill. Before using an Effect or Electron API you have not seen in this repo, read it at the pinned version: `pnpm sources:fetch` clones the tagged sources into `.repos/` (gitignored). Do not invent APIs.
- No prose comments in code. A workaround for someone else's bug keeps a `VENDOR:` comment (root ADR 0004).
- Add a lint rule before cleaning up a pattern by hand, so it cannot come back. When you are corrected for the same thing twice, use the `correct` skill.
- A new version replaces the old one in the same change: no `V2`, no re-export kept for compatibility (the `principle-no-shims` skill).
- Work by task type with the `playbook-*` skills: bug fix, feature, refactoring, investigation, prototype, perf issue, hillclimb.
- The `principle-*` skills and `benchmark-checklist` do not load on their own. When a playbook, a skill or a review names one, read `.agents/skills/<name>/SKILL.md`.
- Before Git: the `babysit-git` skill. Before a pull request: the `file-pr` skill. For prose: the `unslop` skill. To see a UI change working: the `verify-web` skill.

## Rust

- `cargo fmt --all` and `cargo clippy --workspace --all-targets -- -D warnings` are clean. `pnpm check:rust` runs both with `cargo test`, and `pnpm verify` and CI run it.
- `flight-core` and `drone-protocol` stay `no_std` and build for `thumbv7em-none-eabihf` (`rust-toolchain.toml` installs the target). No `std`, heap or host-only crate reaches them.
- The simulator and the firmware are deterministic: no wall clock, no unseeded RNG, no iteration order that depends on a hash seed. Time comes from the simulation step, randomness from the scenario's seed.
- Generated files are never edited by hand. Change the manifest or the generator and run `drone codegen`; `drone codegen --check` fails when a generated file is out of date.

## Safety rules for AI agents

- Real hardware (REAL mode) is read-only by default: an agent may read telemetry from a connected board, nothing more.
- Never flash firmware to, or arm, real hardware without the owner present and asking for it in this session.
- Motor commands reach real hardware only through the Safety Gate planned for M2. Until it exists, no code path sends them.

## Commands

| Command                            | Does                                                                                                                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install`                     | installs; `prepare` runs `vp config`, which installs the Git hooks                                                                                                                |
| `pnpm dev`                         | `vp dev` for the web app, the Studio renderer. The port is per checkout (below)                                                                                                   |
| `pnpm dev:desktop`                 | builds `apps/desktop` and opens it on this checkout's web dev server, starting one when none runs; the window starts its own `drone-engine`; `DESKTOP_SMOKE=<png>` runs it hidden |
| `pnpm dev:status`, `pnpm dev:stop` | show or stop the dev server of this checkout                                                                                                                                      |
| `pnpm check`                       | `vp check`: oxfmt and oxlint, type-aware                                                                                                                                          |
| `pnpm typecheck`                   | TypeScript 7 with Effect diagnostics                                                                                                                                              |
| `pnpm test`                        | unit tests in every package                                                                                                                                                       |
| `pnpm check:rust`                  | `cargo fmt --check`, `cargo clippy -D warnings` and `cargo test` over the Rust workspace                                                                                          |
| `pnpm build`                       | builds every package                                                                                                                                                              |
| `pnpm verify`                      | check, `env:check`, the dependency, pin, knip and suppression checks, typecheck, test, `check:rust` and build: the same steps as CI. The pre-push hook runs it                    |
| `pnpm check:deps`                  | fails on a dependency that is not an exact version or an action not pinned by SHA                                                                                                 |
| `pnpm check:doc-pins`              | fails when a document names a version the workspace does not install                                                                                                              |
| `pnpm check:knip`                  | fails on unused files, exports and dependencies                                                                                                                                   |
| `pnpm check:web-boot`              | opens the built `apps/web/dist` in Chrome through agent-browser; fails when the page does not mount or logs an error                                                              |
| `pnpm env:check`                   | `varlock load`: validates the environment, `.env.local` included, against `.env.schema`                                                                                           |
| `pnpm check:suppressions`          | counts lint and type-check suppressions against `suppressions.baseline.json`; reports growth, never fails                                                                         |
| `pnpm check:changed`               | format, lint, typecheck, unit tests and, when Rust changed, `check:rust`, for the files changed since `master`                                                                    |
| `pnpm pr-evidence <files>`         | uploads screenshots and recordings to the R2 bucket and prints the Markdown for a pull request ([pr-evidence](docs/operations/pr-evidence.md))                                    |
| `pnpm sources:fetch`               | clones the pinned sources of Effect and Electron into `.repos/`                                                                                                                   |

The `drone` CLI in `crates/drone-cli` provides these as it lands; each prints JSON with `--json`:

| Command                                       | Does                                                                                          |
| --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `cargo run -p drone-cli -- validate --json`   | validates every manifest in `hardware/` against its schema                                    |
| `cargo run -p drone-cli -- codegen [--check]` | generates the firmware, simulator, Renode and Studio files; `--check` fails when one is stale |
| `cargo run -p drone-cli -- sim run\|suite`    | flies one scenario, or the regression suite, and records each run in `runs/`                  |
| `cargo run -p drone-cli -- analyze`           | reports a run's metrics and anomalies                                                         |
| `cargo run -p drone-cli -- diff`              | compares the metrics of two runs                                                              |
| `cargo run -p drone-cli -- emu smoke`         | builds the STM32 firmware and boots it in Renode                                              |

`pnpm dev` derives its port from a hash of the checkout path, so worktrees run side by side. `node scripts/dev.mjs ports` prints it, `.dev/state.json` holds the running URL and pids, `.dev/logs/` the logs, and `DEV_WEB_PORT` overrides the port.

Build the change first, then check it once at the end: `pnpm check:changed` for what you touched, then `pnpm verify`, plus the `verify-web` skill when you touched the Studio UI.

Git hooks come from Vite+: `pre-commit` runs `vp staged`, `commit-msg` checks the Conventional Commit subject, `pre-push` runs `pnpm verify`.

## Where things go

| You are adding                                | It goes in                                                                                                                       |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| a component, board, airframe or scenario      | a YAML manifest in `hardware/`, valid against `hardware/schemas/`                                                                |
| host-side logic: schema, sim, telemetry, CLI  | a crate in `crates/`, a member of the root `Cargo.toml` workspace                                                                |
| a message between the sim, firmware or Studio | `crates/drone-protocol` (`no_std`)                                                                                               |
| flight control                                | `firmware/flight-core` (`no_std`); hardware traits in `firmware/flight-hal`; a target in `firmware/target-*`                     |
| an engine command the Studio or an agent uses | a JSON-RPC method in `crates/drone-engine`, the matching `drone` subcommand in `crates/drone-cli` and tool in `crates/drone-mcp` |
| the Renode platform, sensor models and tests  | `emu/`                                                                                                                           |
| a Studio screen                               | `apps/web/src/features/<name>/`; what other features may use is exported from its `index.ts`                                     |
| a UI primitive                                | `packages/ui`                                                                                                                    |
| desktop shell behaviour                       | `apps/desktop/src/`: decisions as plain functions with tests, Electron calls only in `main.ts` (root ADR 0016)                   |
| an env var the desktop app reads              | a line in `.env.schema`, read with `Config` in `apps/desktop/src/main.ts`; the local value in `.env.local`                       |
| a bounded context                             | `CONTEXT-MAP.md`, `docs/internals/<context>/GLOSSARY.md`, then code (the `domain-modeling` skill)                                |
| a decision worth remembering                  | an ADR (the `domain-modeling` skill)                                                                                             |
| how a user does something                     | a section in `docs/user/<feature>.md`, in the product's voice ([docs/README.md](docs/README.md#writing-user-docs))               |
| a setup or debugging procedure                | `docs/operations/`                                                                                                               |

## Autonomy

The owner reviews after the fact, so an agent does not wait for permission on work that a revert can undo. Make the call, do the work, then say what you did and why. Ask first only when a step cannot be undone or reaches outside this repository. What a feature does and who it is for comes from the owner; how it is built is yours.

### On your own

Read anything; run every command in the Commands tables; edit code, tests, manifests, docs and skills; add a lint rule or raise a diagnostic to `error`; start and stop the local dev stack; create branches and commits when the user asked for the change. The changes under "Needs owner sign-off" are yours to make too, flagged as that section says.

If the repo's rules and the task disagree, do the version that keeps the rule and finish it. End your reply with the disagreement and what you recommend changing.

### Ask first

These cannot be undone with a revert, or they weaken the checks the after-the-fact review relies on:

- Anything that reaches real hardware beyond reading it ("Safety rules for AI agents" above).
- Loosening a check in `.vite-hooks/`, `.github/`, `.claude/settings.json` or `.claude/hooks/`.

### Never

- Never `--no-verify`, `git commit -n`, `HUSKY=0`, `VP_GIT_HOOKS=0` or another hook bypass. `.claude/hooks/block-no-verify.mjs` blocks them. A failing hook is work: fix the cause.
- Never weaken a check to make your own change pass: no deleted or skipped test, no raised timeout, no `oxlint-disable` without a reason on the same line, no `@ts-expect-error` without one.
- Never commit secrets, `.env*` files, build output, recorded runs or customer data. Files `drone codegen` writes are committed, and change only through it.
- Never commit screenshots or recordings: a pull request shows them only as links printed by `pnpm -s pr-evidence`, and without that upload they go in the chat.
- Never force-push, rewrite published history, merge, or publish a release unless the user asks.

### Needs owner sign-off

The owner signs these off after the work is done, not before you start. Make each one when the task needs it, in its own commit whose body says why, and finish the task. Then list them in your final message to the user, under "Needs sign-off": one line per change, saying what changed and why. The list goes in the chat, not in the pull request description. The `code-review` skill lists changes to these paths above everything else.

- Adding, removing or changing the version of a dependency, an npm package or a crate, or of the Rust toolchain in `rust-toolchain.toml`.
- Any change that loosens a check in the lint config in `vite.config.ts` and `tools/oxlint/`, `tsconfig.base.json` diagnostics, `knip.json` or `suppressions.baseline.json`, because the check is wrong and not because your change fails it.
- Adding an entry point or a composition root to the lint allow lists.
- A change to the hardware manifest schema or the run format that existing manifests or recorded runs no longer satisfy.
- Changing an ADR's decision. Write a new ADR that supersedes it.
- Widening what the desktop window may load, open or ask for (navigation guard, permissions, the bundle origin).
