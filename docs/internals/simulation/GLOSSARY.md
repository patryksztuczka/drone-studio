# Simulation

The deterministic physical world a flight happens in, stepped in lockstep with the flight controller so a scenario and a seed always produce the same flight.

## Language

**Physics step**:
One fixed integration interval of the rigid-body world; several physics steps make one control tick.
_Avoid_: frame, update

**Control tick**:
One exchange with the flight controller: sensor samples out, actuator outputs back. See [Lockstep](./lockstep.md).
_Avoid_: loop, cycle

**Lockstep**:
The rule that the simulator never advances while the flight controller is computing, and the controller never sees a sample from the future.
_Avoid_: sync, real time

**Ground truth**:
The simulator's exact state (pose, velocity, rates, rotor speeds, battery), which the flight controller never sees.
_Avoid_: actual, real values

**Sensor sample**:
What a modelled sensor reports at its own output rate, with noise, bias, vibration, latency and quantisation applied, in the sensor's own axes.
_Avoid_: reading (for the true value)

**Seed**:
The single number every random process in a flight derives from.

**Fault**:
A scheduled change to the world a scenario injects, such as a degraded motor, a lost radio or a gyro bias step.
_Avoid_: failure (reserved for an assertion)

**Ground effect**:
The extra thrust a rotor gets near the floor.

**Gust**:
A scheduled wind change with a ramp in and out; steady wind and turbulence are separate.

A flight flies an [Airframe](../hardware/GLOSSARY.md) defined by Hardware.
