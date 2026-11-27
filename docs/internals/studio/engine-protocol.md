# Engine protocol

Drone Studio talks to `drone-engine` (crates/drone-engine) over one WebSocket on localhost. The engine prints `DRONE_ENGINE_READY <url>` on stdout when it listens, and writes `.dev/engine.json` (`{ "url", "pid" }`) unless `DRONE_ENGINE_NO_STATE` is set; it removes the file again when it gets SIGINT or SIGTERM. The default URL is `ws://127.0.0.1:47800`; `DRONE_ENGINE_PORT` overrides the port (`0` picks a free one). `DRONE_ROOT` points it at the repository; otherwise it searches up from its working directory.

## Messages

Text messages are JSON-RPC 2.0. Requests carry an `id`; notifications from the engine carry a `method` and no `id`. Errors use code `-32000` with a readable `message`.

Binary messages are live samples, little-endian:

| Bytes | Content                                                                                     |
| ----- | ------------------------------------------------------------------------------------------- |
| 0..4  | `u32` frame kind, `1` = live sample                                                         |
| 4..8  | `u32` session id (changes on `sim.start` and `sim.reset`)                                   |
| 8..   | `f32` values in the order of `engine.info.frame.columns` (the first column is `t`, seconds) |

Decode them with `new Float32Array(buffer, 8)` and the column list. The engine sends one frame per 60 Hz tick while a session runs, paused sessions included.

## Requests

| Method             | Params                                                                                 | Result                                                                                                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `engine.info`      |                                                                                        | `{ engine, airframes, scenarios: [{ id, name, description, tags, duration_s, airframe }], frame: { kind, header_bytes, columns, rate_hz }, params: [flight-core parameter names], live }` |
| `engine.reload`    |                                                                                        | re-reads `hardware/` and returns `engine.info`                                                                                                                                            |
| `hardware.layout`  | `{ airframe }`                                                                         | the generated `hardware/generated/<airframe>/board_layout.json`                                                                                                                           |
| `hardware.catalog` |                                                                                        | `{ batteries, motors, props, frames }` with id, name, mass and key specs                                                                                                                  |
| `hardware.preview` | `{ airframe, battery?, motor?, prop?, frame? }`                                        | `{ selection, mass_g, baseline_mass_g, center_of_mass_m, performance, baseline_performance, full_throttle_current_a, warnings, simulated_firmware_matches }`                              |
| `sim.start`        | `{ mode: "scenario" \| "manual", scenario?, speed?, seed?, overrides?, battery_soc? }` | session status                                                                                                                                                                            |
| `sim.pause`        | `{ paused? }` (toggles without it)                                                     | session status                                                                                                                                                                            |
| `sim.speed`        | `{ speed }` (0.05 to 20)                                                               | session status                                                                                                                                                                            |
| `sim.reset`        |                                                                                        | restarts the same session, new session id                                                                                                                                                 |
| `sim.stop`         | `{ record? }` (default true)                                                           | `{ stopped, run_id, result, assertions }`                                                                                                                                                 |
| `sim.status`       |                                                                                        | session status or `null`                                                                                                                                                                  |
| `rc.set`           | `{ roll, pitch, yaw, throttle, arm, mode: "angle" \| "althold" }`, any subset          | the stick state the firmware sees                                                                                                                                                         |
| `runs.list`        | `{ limit? }`                                                                           | `{ runs: [{ run_id, created_at, scenario, scenario_name, result, source, seed, params, duration_s, metrics, assertions }] }` newest first                                                 |
| `runs.load`        | `{ run_id, rate_hz? }` (default 100)                                                   | `{ meta, events, anomalies, t: [..], columns: { name: [..] } }`                                                                                                                           |
| `runs.spectrum`    | `{ run_id, t? }`                                                                       | `{ freq_hz, accel_z, gyro_x }` over the 1024 samples before `t`                                                                                                                           |
| `studio.focus`     | `{ run_id, t? }`                                                                       | `{ run_id, t, delivered_to }`; broadcasts the `studio.focus` notification                                                                                                                 |
| `emu.status`       |                                                                                        | `{ docker, elf_built, repl, last_smoke, hint }`; `last_smoke` is the last `drone emu smoke` report (`.dev/emu-last.json`) or `null`                                                       |
| `emu.smoke`        |                                                                                        | `{ started: true }`; runs `drone emu smoke` in the background and reports through `emu.smoke.started` and `emu.smoke.finished`                                                            |
| `real.status`      |                                                                                        | `{ connected: false, policy: "read-only", detail }`                                                                                                                                       |

Session status: `{ session_id, mode, scenario, t, duration_s, speed, paused, finished, rc, wall_s }`.

## Notifications

| Method               | Params                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `sim.started`        | session status                                                                                                                       |
| `sim.status`         | session status, every 15 frames                                                                                                      |
| `sim.events`         | `{ session_id, events: [{ t, kind, data }] }`                                                                                        |
| `sim.finished`       | the `sim.stop` result; scenario sessions stop and record on their own at the end                                                     |
| `sim.error`          | `{ message }`                                                                                                                        |
| `telemetry.spectrum` | `{ session_id, freq_hz, accel_z, gyro_x }` every 30 frames                                                                           |
| `runs.changed`       | `{}` after a run is recorded                                                                                                         |
| `studio.focus`       | `{ run_id, t }`: load the run in the Time Machine and seek to `t`                                                                    |
| `emu.smoke.started`  | `{}` when an `emu.smoke` request starts the smoke test                                                                               |
| `emu.smoke.finished` | the smoke report: `{ ok, elf, elf_bytes, image, tests, uart_log_tail, duration_s }`, or `{ ok: false, error }` when it could not run |

Event kinds include `ARM`, `DISARM`, `ARM_REJECTED`, `FAILSAFE`, `LANDED`, `TOUCHDOWN`, `GUST_START`, `GUST_END`, `FAULT`, `FAULT_CLEARED`, `SATURATION`, `SATURATION_END`, `BATTERY_WARNING`, `BATTERY_CRITICAL`, `RC_LOST`, `CRASH` and `ASSERT_FAIL`.

## Frames of reference

The simulator uses NED for the world (north, east, down; the floor is `pos_d = 0`, `height` is above the floor) and FRD for the body (front, right, down). Angles are degrees, `q_*` is the body-to-world quaternion and `sp_q_*` the firmware's attitude setpoint. To draw in a Y-up scene such as Three.js, map a vector `(n, e, d)` to `(x, y, z) = (e, -d, -n)` and a quaternion `(w, x, y, z)` to `(w, y, -z, -x)`; the mapping keeps handedness. Rotor positions in `board_layout.json` are FRD metres relative to the centre of mass and map the same way.
