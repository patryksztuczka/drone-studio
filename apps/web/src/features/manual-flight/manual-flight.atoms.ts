import { Atom } from "effect/reactivity";

import { RESTING_STICKS } from "./stick-mapping.ts";
import type { Sticks } from "./stick-mapping.ts";

export const heldSticks = Atom.make<Sticks>(RESTING_STICKS).pipe(Atom.keepAlive);

export const stickSource = Atom.make("keyboard").pipe(Atom.keepAlive);
