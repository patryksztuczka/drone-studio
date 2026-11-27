# Local development

You need Node 26.13.0 (`.node-version`), pnpm 11.28.9 and rustup. `rust-toolchain.toml` pins Rust 1.99.0 with rustfmt, clippy and the `thumbv7em-none-eabihf` target, and rustup installs it the first time `cargo` runs in the repository.

## Start

```sh
pnpm install       # also installs the Git hooks
pnpm dev           # the web app's Vite dev server and drone-engine
pnpm dev:desktop   # the Studio window; starts the web dev server when none runs
```

`pnpm dev` builds `drone-engine` with cargo, starts it on the port after the web port and hands its URL to the page as `VITE_DRONE_ENGINE_URL`; `?engine=ws://…` on the page overrides it. It prints both URLs. Its port comes from a hash of the checkout path, so two worktrees can run side by side. [AGENTS.md](../../AGENTS.md#commands) lists where the state and logs live and the variable that overrides the port. `pnpm dev:status` shows what is running, `pnpm dev:stop` stops it.

The Rust workspace builds with plain `cargo`. `pnpm check:rust` runs the format check, clippy with warnings as errors and the tests, the same as CI.

## Environment

[`.env.schema`](../../.env.schema) declares every variable. Put local values in `.env.local`, which Git ignores, and run `pnpm env:check` to validate them.

## Desktop app

`apps/desktop` is the Electron shell of Drone Studio, and its renderer is the web app (root ADR 0016).

```sh
pnpm dev:desktop                                      # builds the main process and opens the window on this checkout's Vite server
pnpm dev:desktop -- --remote-debugging-port=9333      # the same, with DevTools on port 9333 for agent-browser --cdp 9333
DESKTOP_SMOKE=$PWD/.scratch/desktop.png pnpm dev:desktop  # hidden window: waits for the engine and a rendered frame, writes the PNG, exits 0 or 1
```

The window builds and starts its own `drone-engine` on a free port, passes it to the page as `?engine=`, and stops it when the window quits; `DESKTOP_ENGINE_URL` attaches to a running engine instead. When `pnpm dev` already runs, the window opens its URL; otherwise `pnpm dev:desktop` starts the dev server and stops it when the window closes. Vite's hot reload works as in a browser. A change to `apps/desktop/src` needs a restart: quit the window and run the command again. Each checkout keeps the window's cache and single-instance lock in `.dev/desktop`, so a second worktree opens its own window.

Bundle mode is what a packaged app will do: it serves `apps/web/dist` from disk on its own origin. To try it:

```sh
pnpm --filter @drone-studio/web build
pnpm --filter @drone-studio/desktop run build
DESKTOP_USER_DATA_DIR=$PWD/.dev/desktop-bundle pnpm --filter @drone-studio/desktop start
```

Electron downloads its binary the first time it starts, not at install. Run it from a terminal that does not set `ELECTRON_RUN_AS_NODE`: an Electron-based editor can set it, and then the window starts as plain Node. `pnpm dev:desktop` removes it for you.

The window and the Dock show `apps/desktop/resources/icon.png`. Packaging comes later: electron-builder will turn that file into the macOS `.icns` and the Windows `.ico`, sign the app and ship `drone-engine` in its resources.

## Before you push

`pnpm check:changed` checks the files you touched, Rust included. `pnpm verify` runs what CI runs, and the pre-push hook runs it too.
