# Drone Studio

Drone Studio is the window you fly, replay and inspect `palm_x4_2in` in. It shows the simulated drone as a blue glass model, its sensors and motors as charts, the board it runs on, and every recorded flight, yours and the ones agents run.

## Start

Run `pnpm dev:desktop`. The window starts the drone engine on its own; the top right reads ENGINE ONLINE once it is connected. While it is not, the viewport says "Waiting for drone-engine" and shows the address it keeps retrying.

## Fly a scenario

Pick a scenario in the path at the top left and press Play (or Space). The flight runs live: Space pauses it, `R` restarts it, and the speed menu next to the target pill runs it from 0.1× to 4×. Pick another scenario while paused and Play flies the new one. When the scenario ends, Studio records it and it appears at the top of Runs.

If the engine refuses a command or is not there, a red note under the drone says which call failed and why.

## Fly it yourself

Press Manual flight under the drone, or pick Manual flight in the scenario menu. Plug in a gamepad, an Xbox or PlayStation pad or an RC transmitter in USB joystick mode, or use the keyboard:

| Control           | Gamepad      | Keyboard   |
| ----------------- | ------------ | ---------- |
| Throttle and yaw  | left stick   | W/S, A/D   |
| Roll and pitch    | right stick  | arrow keys |
| Arm or disarm     | A / Cross    | Enter      |
| Angle or alt hold | Y / Triangle | M          |
| Bigger deflection |              | Shift      |

The drone starts in altitude hold: centre throttle holds height. It arms only with throttle low or centred, like the real firmware. If you switch away so the window is hidden, Studio stops sending sticks and the firmware's RC-loss failsafe takes over, as it would with a real radio.

## Look inside

The card at the top left of the viewport reads height, climb, ground speed, attitude, the pack and the charge, with pills for the arm state, the flight mode, saturation and wind. The thin arrows on the rotors show each motor's thrust: blue below 55 % command, amber up to 80 %, red above.

Press `X` or X-Ray for X-Ray: the glass thins, the battery turns amber, a marker shows the centre of mass, the grey ghost is the attitude the flight controller is asking for, and callouts name the flight controller, the IMU, the barometer, the battery and each motor, with its command once it passes 55 %. `C` switches the camera between following the drone and orbiting a fixed point; drag to orbit and scroll to zoom. The dotted line is where the drone has just been.

## Go back in time

The Flight Time Machine at the bottom holds the whole flight. Drag it to any moment and everything follows: the drone, the charts and the firmware log at the bottom right. Markers show arming, gusts, motor saturation, failed assertions and touchdowns, shaded while they last; click a label to jump there. An amber bar along the bottom marks an anomaly. During a live flight, LIVE (or `L`) takes you back to the present. The arrow keys step a tenth of a second, a whole second with Shift.

## Replay and compare runs

Runs · AI feed lists every recorded flight, newest first, with PASS or FAIL, where it came from (studio, cli, suite or an agent over MCP) and its key numbers. A red dot on the tab means an agent recorded a run you have not seen yet. Click a run to replay it. Press Compare on another to fly it as a violet ghost next to the open one; the flight card shows how far apart they are, and the Time Machine draws both heights.

When an agent calls `studio_focus`, Studio opens that run in Runs at the second it names.

## Inspect the hardware

Hardware shows the flight controller board. Hover a pad to see its net and what it drives, or a bus to light the parts on it and list its pins. The sensor rows show whether the IMU and barometer are streaming at the moment on the timeline.

Component swap recalculates mass, thrust to weight and hover time for another battery, motor, prop or frame. It is a preview: the drone keeps flying the parts in `hardware/` until someone changes them there.

## EMU and REAL

EMU opens a card over the viewport with Docker, the firmware build, the Renode platform and the last smoke test. Run smoke test builds the firmware and boots it in Renode, which takes about twenty seconds once the Docker image exists; the SIM flight keeps running meanwhile. Check again reads the status anew.

REAL is read-only: Studio reads a real board and never commands it until the Safety Gate arrives in M2.

## Showcase

Press `F` or Showcase to hide the panels and leave the glass drone, the flight card and the name while the camera circles. The sticks stay. `Esc` brings the panels back.
