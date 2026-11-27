# Studio page

`apps/web/src/features/studio/` composes the Studio window: the breadcrumb top bar with the module menu, and one module at a time. Workbench and Runs share the 3D viewport and the Flight Time Machine; Hardware and Emulation draw the isometric board. Every value on screen comes from `drone-engine` through `@drone-studio/engine-client` ([engine protocol](../../../../docs/internals/studio/engine-protocol.md)). `pnpm dev` starts the engine with the web dev server; the page reads its URL from `VITE_DRONE_ENGINE_URL`, and `?engine=ws://…` overrides it.

The look follows the Paper file "Drone Studio", page "Studio — light (A2)". Compare each module with its artboard: Workbench with `A2 · Quiet — Workbench`, the open module menu with `A2 · Module menu`, Hardware with `A2 · Hardware`, Runs with `A2 · Runs + Ghost Diff`, Emulation with `A2 · Emulation`.

Record runs first so Runs has data: `cargo run --release -p drone-cli -- sim suite`. For a failing run to compare, add `cargo run --release -p drone-cli -- sim run 01_hover_calm --set rate.roll.kp=0.2 --set rate.roll.kd=0`.

## Drive

1. Open `urls.web` at 1440×900. The top right reads `engine online` next to the SIM pill, and the glass drone sits on the pad between the FLIGHT and MOTORS cards with an fps counter near 60.
2. Open the scenario menu (second part of the path), pick "6 m/s lateral gust" and press the round play button. FLIGHT turns ARMED, the drone climbs, the thrust arrows grow, the height line grows with ARM and GUST pills and the camera keeps the drone centred.
3. Press `X`. The glass thins, tags for FC, IMU, BARO, BATT and M1 to M4 appear, the centre of mass and the grey setpoint ghost show. Press `X` again.
4. Drag the timeline back to 2 s. The drone, the cards and the scrub pill jump there. Press `T`: the charts and the firmware log open above the timeline with their cursors at 2 s. Press `L` during a live flight to follow it again.
5. Press `2` for Hardware. Swap battery to 2S 450 mAh: mass drops in green, thrust to weight and hover time drop in red. Click USART2: the TX2 and RX2 pads light and the strip names the pins. Click the barometer: the leader line moves to it.
6. Press `3` for Runs. Open the failing hover run (red dot, black row with its parameters), hover a passing hover run and press compare. GHOST DIFF lists max height, saturation and energy in red and the failed assertions; the timeline shows one SATURATION pill, a dashed baseline and `base`; the BASELINE tag points down when the baseline is out of view.
7. With the window open, run `cargo run --release -p drone-cli -- studio focus latest --t 4`. Studio switches to Runs, the clock reads 4.00 s and the toast says "An agent opened this run at 4.00 s".
8. Press `4` for Emulation and Run smoke (Docker must run). The UART card reads booting and the first step pulses; after about twenty seconds once the image exists, the steps turn to ticks, the UART lines appear and last smoke reads PASS.
9. Press MANUAL FLIGHT in Workbench. The stick card appears. Hold `W`, press `Enter` to arm, steer with the arrows. With a gamepad plugged in, its name replaces the keyboard hint.
10. Press `F` for Showcase: only the drone, the grid, the name and the leave pill stay, and the camera orbits. `Esc` leaves it.
11. Check the desktop window without opening one: `DESKTOP_SMOKE=$PWD/.scratch/evidence/desktop.png pnpm dev:desktop`. It exits 0 and the PNG shows the light Workbench with `engine online`.

## What usually lies

- **Empty Runs.** `runs/` is gitignored, so a fresh checkout has none. Run the suite.
- **A second engine.** `pnpm dev` and the desktop window each start their own engine. `drone studio focus` talks to the one in `.dev/engine.json`, the last one started.
- **A frozen drone in a background tab.** Browsers stop `requestAnimationFrame` in hidden tabs, and manual flight stops sending sticks, which trips the firmware's RC-loss failsafe. That is the safe behaviour, not a bug.
- **`⌘1` in Chrome.** The browser takes `⌘1` to `⌘4` for its own tabs before the page sees them. Use the plain digits in a browser; the desktop window gets both.
- **A first smoke run that takes minutes.** The first `Run smoke` builds the firmware and the Renode Docker image. Later runs reuse both.
