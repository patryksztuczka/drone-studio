import { Option, Schema } from "effect";

const READY = /^DRONE_ENGINE_READY (wss?:\/\/\S+)\s*$/;

export const readyUrl = (line: string): Option.Option<URL> => {
  const match = READY.exec(line.trim());
  const url = match?.[1];

  return url !== undefined && URL.canParse(url) ? Option.some(new URL(url)) : Option.none();
};

export const EngineSource = Schema.TaggedUnion({
  Attach: { url: Schema.URL },
  Spawn: { root: Schema.String, binary: Schema.String },
});

export type EngineSource = typeof EngineSource.Type;

export const engineSource = (configured: Option.Option<URL>, root: string): EngineSource =>
  Option.match(configured, {
    onSome: (url) => EngineSource.cases.Attach.make({ url }),
    onNone: () =>
      EngineSource.cases.Spawn.make({ root, binary: `${root}/target/release/drone-engine` }),
  });

export const withEngine = (home: URL, engine: URL): URL => {
  const url = new URL(home);

  url.searchParams.set("engine", engine.href.replace(/\/$/, ""));

  return url;
};

export interface WindowPlan {
  readonly showWhenReady: boolean;
  readonly backgroundThrottling: boolean;
}

export const windowPlan = (smoke: boolean): WindowPlan =>
  smoke
    ? { showWhenReady: false, backgroundThrottling: false }
    : { showWhenReady: true, backgroundThrottling: true };

export const STUDIO_READY_PROBE = 'document.documentElement.dataset.studioReady === "true"';
