# Drone Studio

Drone Studio is the window you fly, replay and inspect `palm_x4_2in` in. It shows the simulated drone as a glass model on a drafting grid, the board it runs on, every recorded flight, yours and the ones agents run, and the firmware booting in Renode.

## Start

Run `pnpm dev:desktop`. The window starts the drone engine on its own; the top right reads `engine online` once it is connected.

## Find your way around

Studio shows one module at a time. The name after the logo, Workbench at first, opens the module menu:

| Module    | Shortcut | What it is for                           |
| --------- | -------- | ---------------------------------------- |
| Workbench | `⌘1`     | fly, watch and scrub a flight            |
| Hardware  | `⌘2`     | the board, its sensors and parts to swap |
| Runs      | `⌘3`     | every recorded flight, and comparing two |
| Emulation | `⌘4`     | the real firmware booting in Renode      |

The plain digits `1` to `4` work too. A red dot next to Runs in the menu means the newest run failed. The pill at the top right says which target you are looking at, SIM, EMU or REAL, and the round button next to it plays and pauses.

## Fly a scenario

In Workbench, the second part of the path names the scenario. Pick another there, then press the round play button or Space. The FLIGHT card shows the arm state, attitude, height and virtual time, and MOTORS shows each motor's thrust, blue for the ones pushing harder than the rest and red when one saturates. When the scenario ends, Studio records it and it appears at the top of Runs.

Space pauses, `R` restarts, and the speed under the big clock runs the flight from 0.1× to 4×.

## Fly it yourself

Press MANUAL FLIGHT under the drone, or pick Manual flight in the scenario menu. Plug in a gamepad, an Xbox or PlayStation pad or an RC transmitter in USB joystick mode, or use the keyboard:

| Control           | Gamepad      | Keyboard   |
| ----------------- | ------------ | ---------- |
| Throttle and yaw  | left stick   | W/S, A/D   |
| Roll and pitch    | right stick  | arrow keys |
| Arm or disarm     | A / Cross    | Enter      |
| Angle or alt hold | Y / Triangle | M          |
| Bigger deflection |              | Shift      |

The drone starts in altitude hold: centre throttle holds height. It arms only with throttle low or centred, like the real firmware. If you switch away so the window is hidden, Studio stops sending sticks and the firmware's RC-loss failsafe takes over, as it would with a real radio.

## Look inside

Press `X` or the X-RAY pill for X-Ray: the glass gets thinner, the battery turns amber, a black marker shows the centre of mass, the grey ghost is the attitude the flight controller is asking for, a blue line traces the last seconds of flight, and tags point at the flight controller, the IMU, the barometer, the battery and each motor. The thin blue arrows on the rotors show thrust in every view. `C` switches the camera between following the drone and orbiting a fixed point; drag to orbit and scroll to zoom.

## Go back in time

The Flight Time Machine at the bottom holds the whole flight: the big clock, a line of the height and pills for arming, gusts, saturation, failsafes and touchdowns. Drag anywhere on it and everything follows: the drone, the cards and the charts. Click a pill to jump there. During a live flight, `go live` (or `L`) takes you back to the present. The arrow keys step a tenth of a second, a whole second with Shift.

Press `charts` under the clock, or `T`, for attitude against the setpoint, motor commands, the battery, the IMU vibration spectrum and the firmware log. Click a log line to jump to it.

## Replay and compare runs

Runs lists every recorded flight, newest first, with a green or red dot for PASS or FAIL. Click one to replay it; the open run turns black and shows the parameters it flew with. Hover another and press compare to fly it as a faint baseline next to the open one. The GHOST DIFF card puts the two side by side, red where the open run did worse, and lists the assertions it failed. The CANDIDATE and BASELINE tags show each drone's height, with an arrow when one is out of view.

When an agent calls `studio_focus`, Studio switches to Runs, opens that run at the second it names and says so at the bottom.

## Inspect the hardware

Hardware shows the flight controller board, drawn from the same manifest the firmware and the simulator are generated from. Click the MCU, the IMU or the barometer to read its bus, pins and identity register; while a flight is open, the card's line shows its last three seconds of samples. Hover a pad to see its net and what it drives. Hover or click a bus pill to light the pads it uses.

The AIRFRAME card recalculates mass, thrust to weight and hover time for another battery, motor or prop. It is a preview: the drone keeps flying the parts in `hardware/` until someone changes them there.

## Emulation and REAL

Emulation shows the last smoke test: the firmware's UART output, whether Docker, the `.elf` and the Renode platform are ready, and how far the boot got. Run smoke builds the firmware and boots it in Renode, which takes about twenty seconds once the Docker image exists.

REAL is read-only: Studio reads a real board and never commands it until the Safety Gate arrives in M2.

## Showcase

Press `F`, or pick Showcase mode in the module menu, to leave only the glass drone and the grid while the camera circles. The sticks stay. `Esc` brings the rest back.
