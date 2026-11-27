# Studio page

`apps/web/src/features/studio/` composes the Studio window: the context bar, the 3D viewport with its flight card and view controls, the inspector tabs (Hardware, Telemetry, Runs · AI feed), the Flight Time Machine and the firmware log. Every value on screen comes from `drone-engine` through `@drone-studio/engine-client` ([engine protocol](../../../../docs/internals/studio/engine-protocol.md)). `pnpm dev` starts the engine with the web dev server; the page reads its URL from `VITE_DRONE_ENGINE_URL`, and `?engine=ws://…` overrides it.

The look follows the Paper file "Drone Studio", page "Studio — complete (A3)". Compare each state with its artboard: Workbench with X-Ray and Telemetry, the Hardware tab, the Runs tab with a ghost, Manual flight, the EMU and REAL cards, Showcase, and Empty + engine offline.

Record runs first so Runs has data: `cargo run --release -p drone-cli -- sim suite`. For a failing run to compare, add `cargo run --release -p drone-cli -- sim run 01_hover_calm --set rate.roll.kp=0.2 --set rate.roll.kd=0`.

## Drive

1. Open `urls.web` at 1440×900. The context bar reads ENGINE ONLINE, and the glass drone sits on the pad with the flight card at the top left and an FPS counter near 60.
2. Pick "6 m/s lateral gust" in the scenario menu and press Play. The flight card fills, the drone climbs, the thrust arrows grow, the charts draw, the timeline grows with ARM and GUST markers and the firmware log scrolls. The camera keeps the drone centred.
3. Press `X`. The glass thins, callouts for FC, IMU, BATT and BARO and tags for M1 to M4 appear, with the setpoint ghost and the centre of mass. Press `X` again.
4. Drag the timeline back to 2 s. The drone, the flight card, the chart cursors and the log all jump there. Press `L` to follow the live session again.
5. Open Runs (`3`), click the failing hover run: it replays from 0 s with a blue border. Hover a passing hover run and press Compare: a violet ghost flies the same seconds, the flight card shows GHOST · base · Δ, and the timeline draws both heights.
6. Open Hardware (`1`). Hover the TX1 pad: its net and USART1 light. Hover SPI1: the IMU lights and the row above the pills lists SCK, MISO and MOSI. Swap BATTERY to the 450 mAh LiPo: mass drops in green, thrust to weight and hover time drop in red.
7. With the page open, run `DRONE_ENGINE_URL=<urls.engine> cargo run --release -p drone-cli -- studio focus latest --t 4`. Studio opens Runs, the run replays from 00:04.00.
8. Pick EMU. The Renode card shows Docker, the ELF, the platform and the last smoke test. Press Run smoke test (Docker must run): the last smoke test reads running…, then PASS with its duration. Pick REAL: the read-only card says motor commands are blocked until the M2 Safety Gate.
9. Press Manual flight. The stick card replaces the footer. Hold `W`, press `Enter` to arm, steer with the arrows. With a gamepad plugged in, its name replaces the keyboard hint.
10. Press `F` for Showcase: the panels hide, the name sits at the bottom right and the camera orbits. `Esc` leaves it.
11. Open `urls.web` with `?engine=ws://127.0.0.1:9` and press Play: ENGINE OFFLINE in red, "Waiting for drone-engine" in the viewport, the dashed empty timeline, and a red note "sim.start failed: engine offline".
12. Check the desktop window without opening one: `DESKTOP_SMOKE=$PWD/.scratch/evidence/desktop.png pnpm dev:desktop`. It exits 0 and the PNG shows the light Studio with ENGINE ONLINE.

## What usually lies

- **An empty Runs tab.** `runs/` is gitignored, so a fresh checkout has none. Run the suite.
- **A second engine.** `pnpm dev` and the desktop window each start their own engine, and each removes `.dev/engine.json` when it stops. `drone studio focus` talks to the one in `.dev/engine.json` or `DRONE_ENGINE_URL`; after a desktop smoke run, pass the dev engine's URL.
- **A frozen drone in a background tab.** Browsers stop `requestAnimationFrame` in hidden tabs, and manual flight stops sending sticks, which trips the firmware's RC-loss failsafe. That is the safe behaviour, not a bug.
- **A frozen replay after a hot update.** Editing the playback hooks while a replay runs can leave the clock stopped until the page reloads. Reload before you judge it.
