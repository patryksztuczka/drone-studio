# Flight lab

Fly `palm_x4_2in` in simulation, find out why a flight went wrong and compare a change against the last good run. Everything here works from a terminal or from an AI agent, and every flight is repeatable: the same scenario and seed always fly the same way.

## Run the regression suite

```sh
cargo run -q --release -p drone-cli -- sim suite
```

The five baseline scenarios fly in parallel in well under two seconds: calm hover, roll and pitch steps, a 6 m/s side gust, a motor losing 40 % of its thrust, and a nearly empty battery that has to land itself. Each prints PASS or FAIL per assertion, and each flight is saved under `runs/`.

## Fly one scenario with different tuning

```sh
cargo run -q --release -p drone-cli -- sim run 02_step_roll_pitch --set angle.kp=5 --set rate.roll.kd=0.0008
```

`--set` changes a flight controller parameter for this flight only. `--seed` changes the noise and turbulence. Add `--json` to any command for output a script or an agent can read.

## Find out what went wrong

```sh
cargo run -q --release -p drone-cli -- analyze latest --anomalies
cargo run -q --release -p drone-cli -- analyze 02_step_roll_pitch --slice 4..5 --signals roll,sp_roll,gyro_p,motor_1
```

`--anomalies` lists oscillations with their frequency, saturated motors, voltage drops, attitude errors, estimator divergence and hard landings, each with its time window. `--slice` returns the signals you name over a time window. A run can be named by its id, the start of its id, its scenario (the latest run of it) or `latest`.

## Compare two flights

```sh
cargo run -q --release -p drone-cli -- runs
cargo run -q --release -p drone-cli -- diff <baseline run> <candidate run>
```

The diff says which metrics improved or regressed, which assertions changed outcome and how far the two trajectories drifted apart.

## Show a run in the Studio

```sh
cargo run -q --release -p drone-cli -- studio focus latest --t 4.5
```

With Drone Studio open, the run loads in the Flight Time Machine at 4.5 seconds.

## Use it from an AI agent

The repository registers the `drone` MCP server in `.mcp.json`, so an agent working in this checkout gets the tools `sim_run`, `sim_suite`, `run_summary`, `run_anomalies`, `run_slice`, `run_diff`, `runs_list`, `hardware_validate`, `emu_smoke_test` and `studio_focus`. A typical loop: run the suite, read the anomalies of a failing run, try a parameter change with `sim_run`, and compare it with `run_diff`. The tools never touch real hardware.

## Check the hardware description

```sh
cargo run -q --release -p drone-cli -- validate
cargo run -q --release -p drone-cli -- codegen
```

`validate` checks every part, board, airframe and scenario in `hardware/`: the schema, references between them, pin conflicts and physics such as take-off mass and thrust-to-weight. After you change a manifest, `codegen` regenerates what the firmware, the simulator, Renode and the Studio read from it.
