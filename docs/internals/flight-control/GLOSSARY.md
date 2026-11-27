# Flight Control

The flight controller that keeps the drone in the air, written once without an operating system and run unchanged in SITL, in Renode and on the board.

## Language

**Flight core**:
The hardware-independent controller: estimation, control laws, mixer and the arming state machine.
_Avoid_: firmware (that is the flight core plus a target), autopilot

**Target**:
One way to run the flight core: SITL against the simulator, the STM32 image in Renode, or the STM32 image on the board.
_Avoid_: platform, port

**Arm state**:
Disarmed, Armed or Failsafe; motors spin only when not Disarmed.

**Failsafe**:
The armed state in which the controller ignores the pilot and lands, entered on radio loss, a critical battery or an IMU fault.
_Avoid_: emergency mode, RTL

**Angle mode**:
Sticks command roll and pitch angles and a yaw rate; throttle commands collective thrust.

**Altitude hold**:
Angle mode where the throttle stick commands climb rate and a centred stick holds height.
_Avoid_: alt mode, baro mode

**Setpoint**:
What a control loop is asked to reach: an attitude, a body rate, a height or a climb rate.
_Avoid_: target (taken), reference

**Ghost target**:
The attitude setpoint drawn as a wireframe next to the drone in the Studio.

**Parameter**:
A named, range-checked tuning value of the flight core that a scenario, a person or an agent may override for one flight.
_Avoid_: gain (a parameter may be a filter cutoff or a limit), setting

**Saturation**:
A tick in which the mixer could not give every motor the command the control laws asked for.

**Safety gate**:
The planned mechanism, from M2, that alone may let motor commands reach real hardware.
