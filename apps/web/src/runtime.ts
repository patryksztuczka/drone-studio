import { DEFAULT_ENGINE_URL, EngineConnection, engineLayer } from "@drone-studio/engine-client";

import { resolveEngineUrl } from "./shared/engine-url.ts";

export const engineUrl = resolveEngineUrl(
  globalThis.location.search,
  import.meta.env.VITE_DRONE_ENGINE_URL,
  DEFAULT_ENGINE_URL,
);

export const studioInitialValues = [[engineLayer, EngineConnection.layerAt(engineUrl)]] as const;
