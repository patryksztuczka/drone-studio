# Hardware

The digital twin's source of truth: what the drone is made of, how it is wired and which flights it must survive. Every other context reads generated artifacts derived from it, never the manifests themselves.

## Language

**Manifest**:
One YAML document describing a single thing (a catalog part, a board, an airframe or a scenario), valid against its JSON Schema.
_Avoid_: config file, spec

**Catalog part**:
A purchasable component with its measured or datasheet properties: MCU, sensor, motor, prop, battery or frame.
_Avoid_: component (when you mean the catalog entry), product

**Board**:
A flight controller PCB: its MCU, buses, attached sensors, motor outputs, analog inputs and the 2D pad layout a person sees in the Studio.
_Avoid_: FC (in names), PCB

**Airframe**:
An assembled drone: a frame, a board, a battery, motors and props placed in body coordinates, with the limits and loop rates its firmware uses.
_Avoid_: model, drone config, build

**Scenario**:
A deterministic test flight: environment, initial state, pilot script, injected faults and the assertions that decide PASS or FAIL.
_Avoid_: test case, mission

**Pilot script**:
The ordered stick and switch keyframes a scenario feeds the flight controller, held between keyframes.
_Avoid_: input sequence, RC log

**Mass properties**:
The total mass, centre of mass and inertia tensor resolved from every placed part of an airframe.

**Generated artifact**:
A file written by codegen from manifests (firmware constants, simulator model, Renode platform, Studio board layout); it changes only by changing a manifest or a generator.
_Avoid_: build output, cache

**Source hash**:
A short digest of the manifests an artifact was generated from, carried by every artifact and every run so a mismatch is visible.
