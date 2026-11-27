# Lockstep

The runner advances the simulator by `physics_hz / control_hz` physics steps, reads the sensor frame, sends one `SimStepInput` to the flight controller and applies the returned motor commands for the next interval. The SITL target passes both messages through the real wire protocol (postcard, CRC16, COBS) on every tick, so a change that breaks the framing breaks every scenario, not only the serial link.

## Decisions and traps

- **Sensors live in their own axes.** The simulator rotates ground truth into the IMU's axes using the board orientation, and the firmware rotates it back with the generated constant. A wrong orientation in a board manifest therefore shows up as an unstable flight, which is the point: the twin catches the wiring mistake before the bench does.
- **The accelerometer reaches the attitude estimator low-passed.** Rotor vibration is several m/s² per axis; gating samples by the norm of an unfiltered accelerometer rectifies that vibration into a steady tilt bias that grows into metres of drift. Filter first, then gate.
- **The mixer comes from geometry, not from the centre of mass.** Its roll and pitch factors are normalised around the rotors' centroid so they sum to zero; the integrators absorb a centre of mass that is a few millimetres off.
- **The RK4 stage at the end of a step feeds the accelerometer.** Evaluating the derivative again would cost a fifth of the step for a difference far below sensor noise.
- **Every random draw happens at the sensor's own rate.** Drawing noise per physics step instead changes the stream when a rate changes and costs most of the runtime.
- **Determinism includes the platform.** Physics and filters use `libm` rather than the platform's math library, so a seed reproduces the same flight on macOS and in Linux CI.
- **Spin-up draws real current.** Arming and takeoff pull the pack down for tens of milliseconds; the anomaly detector ignores dips shorter than its sag duration so every run does not report one.
