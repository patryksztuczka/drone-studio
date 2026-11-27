import { onSessionExpired } from "@drone-studio/client-runtime/session";
import type { AtomRegistry } from "effect/reactivity";

export const watchSessionExpiry = (
  registry: AtomRegistry.AtomRegistry,
  expire: () => Promise<void>,
) => onSessionExpired(registry, () => void expire());
