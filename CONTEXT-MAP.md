# Context map

The contexts follow the [M0 + M1 blueprint](./docs/vision/drone-studio-m0-m1-blueprint.md). Each gets its `GLOSSARY.md` under `docs/internals/<context>/` with its first code; until then the blueprint's words are the ones to use.

## Contexts

- **Hardware**: owns the YAML manifests of components, boards, airframes and scenarios, their validation, and the code generated from them for the firmware, the simulator, Renode and the Studio. The one source of truth about the drone.
- **Simulation**: owns the deterministic 6DOF world a flight runs in: physics, propulsion, battery, wind, ground effect and the sensor models, stepped in lockstep with the flight controller.
- **Flight Control**: owns the `no_std` flight core (estimation, PID cascade, mixer, arming and failsafe) and its targets: SITL, Renode and the STM32 board.
- **Telemetry**: owns each recorded Run (`runs/<id>/`: metadata, telemetry, events) and the queries over it: slices, anomalies and diffs.
- **Studio**: owns what the person at the desktop app sees and does. It holds no physics or flight logic and reads everything from `drone-engine`.

## Relationships

- **Hardware → Simulation, Flight Control, Studio**: they read the generated configuration, never the YAML directly. Hardware knows none of them.
- **Simulation ↔ Flight Control**: the lockstep protocol in `drone-protocol`. Each simulation step sends sensor samples and receives actuator outputs; neither side reads the other's state.
- **Simulation, Flight Control → Telemetry**: every flight writes a Run. Telemetry never drives a flight.
- **Studio → everything**: through `drone-engine` over WebSocket JSON-RPC only (root ADR 0016). The `drone` CLI and `drone-mcp` give agents the same commands.

## Where each context's documents live

Each context keeps its glossary, its ADRs and any module files in its own folder under [docs/internals](./docs/internals), created with its first document. Decisions that belong to no single context live in [docs/internals/system/adr](./docs/internals/system/adr).

| Context            | Docs                                             | Code                                                                | ADRs cited as      |
| ------------------ | ------------------------------------------------ | ------------------------------------------------------------------- | ------------------ |
| Hardware           | none yet                                         | `hardware/`, `crates/drone-schema`                                  | Hardware ADR       |
| Simulation         | none yet                                         | `crates/drone-sim`, `crates/drone-protocol`                         | Simulation ADR     |
| Flight Control     | none yet                                         | `firmware/`, `emu/`                                                 | Flight Control ADR |
| Telemetry          | none yet                                         | `crates/drone-telemetry`, `runs/`                                   | Telemetry ADR      |
| Studio             | none yet                                         | `apps/web`, `apps/desktop`, `crates/drone-engine`                   | Studio ADR         |
| none (system-wide) | [docs/internals/system](./docs/internals/system) | `crates/drone-cli`, `crates/drone-mcp`, the workspace configuration | root ADR           |
