# Drone Studio

Drone Studio is the window you fly, replay and inspect `palm_x4_2in` in. It shows the simulated drone in 3D, its sensors and motors as charts, the board it runs on, and every recorded flight, yours and the ones agents run.

## Start

Run `pnpm dev:desktop`. The window starts the drone engine on its own; the status at the top right reads ENGINE ONLINE once it is connected.

## Fly a scenario

Pick a scenario in SCENARIO and press PLAY (or Space). The flight runs live: Space pauses it, `R` restarts it, and the speed buttons run it from 0.1× to 4×. When the scenario ends, Studio records it and it appears at the top of Runs.

## Fly it yourself

Press Manual flight. Plug in a gamepad, an Xbox or PlayStation pad or an RC transmitter in USB joystick mode, or use the keyboard:

| Control           | Gamepad      | Keyboard   |
| ----------------- | ------------ | ---------- |
| Throttle and yaw  | left stick   | W/S, A/D   |
| Roll and pitch    | right stick  | arrow keys |
| Arm or disarm     | A / Cross    | Enter      |
| Angle or alt hold | Y / Triangle | M          |
| Bigger deflection |              | Shift      |

The drone starts in altitude hold: centre throttle holds height. It arms only with throttle low or centred, like the real firmware. If you switch away so the window is hidden, Studio stops sending sticks and the firmware's RC-loss failsafe takes over, as it would with a real radio.

## Look inside

Press `X` for X-Ray: the frame turns see-through, arrows on the rotors show each motor's thrust, the white ghost is the attitude the flight controller is asking for, and labels point at the flight controller, the IMU, the barometer and the battery. `C` switches the camera between following the drone and orbiting a fixed point.

## Go back in time

The Flight Time Machine at the bottom holds the whole flight. Drag it to any moment and everything follows: the drone, the charts and the firmware log. Markers show arming, gusts, motor saturation, failsafes and touchdowns; click one to jump there. During a live flight, LIVE takes you back to the present. The arrow keys step a tenth of a second, a whole second with Shift.

## Replay and compare runs

Runs lists every recorded flight, newest first, with PASS or FAIL, where it came from (studio, cli, suite or an agent over MCP) and its key numbers. Click one to replay it. Press Compare on another to fly it as a violet ghost next to the open one; the HUD shows how far apart they are.

When an agent calls `studio_focus`, Studio opens that run at the second it names.

## Inspect the hardware

Hardware shows the flight controller board. Hover a pad to see its net and what it drives, or a bus to light the parts on it. The sensor list shows whether the IMU and barometer are streaming at the moment on the timeline.

Component swap recalculates mass, thrust to weight and hover time for another battery, motor, prop or frame. It is a preview: the drone keeps flying the parts in `hardware/` until someone changes them there.

## EMU and REAL

EMU shows whether the firmware has been built and booted in Renode, and how to run that check. REAL is read-only: Studio reads a real board and never commands it until the Safety Gate arrives in M2.

## Showcase

Press `F` or Showcase to hide the panels and let the camera circle the drone. The HUD and the sticks stay. `Esc` brings the panels back.
