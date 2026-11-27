# Studio page

`apps/web/src/features/studio/` composes the Studio window: the context bar, the 3D viewport, the inspector tabs (Hardware, Telemetry, Runs) and the Flight Time Machine. Every value on screen comes from `drone-engine` through `@drone-studio/engine-client` ([engine protocol](../../../../docs/internals/studio/engine-protocol.md)). `pnpm dev` starts the engine with the web dev server; the page reads its URL from `VITE_DRONE_ENGINE_URL`, and `?engine=ws://…` overrides it.

Record runs first so the Runs tab has data: `cargo run --release -p drone-cli -- sim suite`.

## Drive

1. Open `urls.web` at 1600×1000. The status in the context bar reads ENGINE ONLINE, and the viewport shows `palm_x4_2in` on the landing pad with an FPS counter near 60.
2. Pick "6 m/s lateral gust" in SCENARIO and press PLAY. The HUD fills, the drone climbs, the charts draw, the timeline grows with ARM and GUST markers and the firmware log scrolls. The camera keeps the drone in view while it drifts.
3. Press `X`. The frame turns translucent, four thrust arrows stand on the rotors, the FC, IMU, BARO and BATT labels fan out, and a white ghost shows the attitude setpoint. Press `X` again.
4. Drag the timeline back to 2 s. The drone, the HUD, the chart cursors and the log all jump there. Press `L` to follow the live session again.
5. Open Runs (`3`), click a run: it replays from 0 s at the chosen speed. Hover another run and press Compare: a violet ghost flies the same seconds and the HUD shows the distance between the two.
6. Open Hardware (`1`). Hover the TX1 pad: it lights with its net and the USART1 trace. Hover the SPI1 chip: the IMU lights. Swap BATTERY to the 450 mAh LiPo: mass drops, thrust to weight rises, hover time falls, and the deltas turn green and red.
7. With the window open, run `cargo run --release -p drone-cli -- studio focus <run_id> --t 4.5`. The window opens that run in REPLAY and the clock reads 00:04.50.
8. Press Manual flight. The stick HUD appears. Hold `W`, press `Enter` to arm, steer with the arrows. With a gamepad plugged in, its name replaces the keyboard hint.
9. Press `F` for Showcase: the panels hide and the camera orbits. `Esc` leaves it.
10. Check the desktop window without opening one: `DESKTOP_SMOKE=$PWD/.scratch/evidence/desktop.png pnpm dev:desktop`. It exits 0 and the PNG shows the drone with ENGINE ONLINE.

## What usually lies

- **An empty Runs tab.** `runs/` is gitignored, so a fresh checkout has none. Run the suite.
- **A second engine.** `pnpm dev` and the desktop window each start their own engine. `drone studio focus` talks to the one in `.dev/engine.json`, the last one started.
- **A frozen drone in a background tab.** Browsers stop `requestAnimationFrame` in hidden tabs, and manual flight stops sending sticks, which trips the firmware's RC-loss failsafe. That is the safe behaviour, not a bug.
