# CI

`.github/workflows/ci.yml` runs on every pull request and every push to `master`. When a change touches only documentation, the jobs are skipped. Each TypeScript stage needs the one before it, so a cheap failure stops the expensive ones:

1. Static checks: format and lint, the environment schema, exact dependency versions and pinned actions, versions named in the docs, unused code (knip), and the suppression count, which reports but never fails.
2. Typecheck.
3. Unit tests, only for the packages a change touches and their dependents. The stage fails if a changed package was not selected, so it cannot pass by testing nothing.
4. Build, then `pnpm check:web-boot`, which opens the built web app in Chrome.

The Rust job runs next to them: it installs the toolchain from `rust-toolchain.toml`, then runs `cargo fmt --check`, `cargo clippy` with warnings as errors and `cargo test` over the workspace.

The Firmware job runs beside it on `firmware/target-stm32h7`, which is its own Cargo workspace: `cargo fmt --check`, clippy with warnings as errors and the release build for `thumbv7em-none-eabihf`. When it passes, the Renode smoke job builds the emulation image and boots that ELF in Renode ([emulation](emulation.md)).

The `CI OK` job fails when any job failed or was cancelled and passes when they passed or were skipped, so a branch rule can require it instead of each job.

`.github/workflows/pr-title.yml` checks that the pull request title is a Conventional Commit subject. On a branch, a newer run cancels the older one. On `master`, every run finishes.

`pnpm verify` runs the same checks locally, without the web boot, and the pre-push hook runs it.
