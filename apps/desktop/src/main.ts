import { NodeRuntime, NodeServices } from "@effect/platform-node";
import {
  Config,
  Deferred,
  Effect,
  Exit,
  FileSystem,
  Option,
  Path,
  Predicate,
  Schedule,
  Stream,
} from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { app, BrowserWindow, net, protocol, session, shell } from "electron";
import type { Event, WebContents } from "electron";

import {
  BundleReadError,
  EngineStartError,
  RendererLoadError,
  SmokeError,
} from "./desktop.errors.ts";
import {
  EngineSource,
  engineSource,
  readyUrl,
  STUDIO_READY_PROBE,
  windowPlan,
  withEngine,
} from "./engine-sidecar.ts";
import type { WindowPlan } from "./engine-sidecar.ts";
import { NavigationVerdict, navigationVerdict } from "./navigation.ts";
import {
  appUrl,
  BUNDLE_ORIGIN,
  RendererSource,
  Resolution,
  resolveBundleRequest,
} from "./renderer-source.ts";
import type { Bundle } from "./renderer-source.ts";

const reasonOf = (cause: unknown) => (Predicate.isError(cause) ? cause.message : String(cause));

const notFound = () => new Response(null, { status: 404 });

const rendererSource = Effect.gen(function* () {
  const devServer = yield* Config.URL("DESKTOP_RENDERER_URL").pipe(Config.option);

  if (Option.isSome(devServer))
    return RendererSource.cases.DevServer.make({ url: devServer.value });

  const path = yield* Path.Path;

  return RendererSource.cases.Bundle.make({
    directory: path.resolve(app.getAppPath(), "..", "web", "dist"),
    origin: BUNDLE_ORIGIN,
  });
});

const throughNetwork = (request: Request) =>
  Effect.promise(() => net.fetch(request, { bypassCustomProtocolHandlers: true }));

const serveFile = Effect.fn("Desktop.serveFile")(function* (
  directory: string,
  relativePath: string,
) {
  const path = yield* Path.Path;
  const file = path.resolveWithin(directory, relativePath);

  if (Option.isNone(file)) return notFound();

  const url = yield* path.toFileUrl(file.value).pipe(Effect.option);

  if (Option.isNone(url)) return notFound();

  return yield* Effect.tryPromise({
    try: () => net.fetch(url.value.href),
    catch: (cause) => new BundleReadError({ file: file.value, reason: reasonOf(cause) }),
  }).pipe(Effect.catchTag("BundleReadError", () => Effect.succeed(notFound())));
});

const respond = (bundle: Bundle, request: Request) =>
  Resolution.match(resolveBundleRequest(bundle, new URL(request.url)), {
    File: (resolution) => serveFile(resolution.directory, resolution.relativePath),
    NotFound: () => Effect.succeed(notFound()),
    Network: () => throughNetwork(request),
  });

const serveBundle = (bundle: Bundle) =>
  Effect.gen(function* () {
    const scheme = bundle.origin.protocol.replace(/:$/, "");
    const context = yield* Effect.context<Path.Path>();

    yield* Effect.acquireRelease(
      Effect.sync(() =>
        protocol.handle(scheme, (request) =>
          // BRIDGE: Electron's protocol.handle awaits a Promise<Response> for every request on the app's scheme
          Effect.runPromiseWith(context)(respond(bundle, request)),
        ),
      ),
      () => Effect.sync(() => protocol.unhandle(scheme)),
    );
  });

const denyPermissions = Effect.acquireRelease(
  Effect.sync(() => {
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false),
    );
    session.defaultSession.setPermissionCheckHandler(() => false);
  }),
  () =>
    Effect.sync(() => {
      session.defaultSession.setPermissionRequestHandler(null);
      session.defaultSession.setPermissionCheckHandler(null);
    }),
);

const openExternally = (verdict: NavigationVerdict) =>
  NavigationVerdict.match(verdict, {
    Stay: () => undefined,
    OpenExternal: (external) => void shell.openExternal(external.url.href),
    Block: () => undefined,
  });

const guardNavigation = (contents: WebContents, home: URL) => {
  contents.setWindowOpenHandler((details) => {
    openExternally(navigationVerdict(home, details.url));

    return { action: "deny" };
  });

  contents.on("will-navigate", (event, url) => {
    const verdict = navigationVerdict(home, url);

    if (NavigationVerdict.guards.Stay(verdict)) return;

    event.preventDefault();
    openExternally(verdict);
  });

  contents.on("will-attach-webview", (event) => event.preventDefault());
};

const openMainWindow = Effect.fn("Desktop.openMainWindow")(function* (
  home: URL,
  icon: string,
  plan: WindowPlan,
) {
  const window = yield* Effect.sync(
    () =>
      new BrowserWindow({
        width: 1600,
        height: 1000,
        minWidth: 1180,
        minHeight: 720,
        icon,
        show: false,
        backgroundColor: "#fafafa",
        webPreferences: {
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
          webviewTag: false,
          backgroundThrottling: plan.backgroundThrottling,
        },
      }),
  );

  guardNavigation(window.webContents, home);

  if (plan.showWhenReady) window.once("ready-to-show", () => window.show());

  yield* Effect.tryPromise({
    try: () => window.loadURL(home.href),
    catch: (cause) => new RendererLoadError({ url: home.href, reason: reasonOf(cause) }),
  });

  return window;
});

const engineFailure = (cause: unknown) => new EngineStartError({ reason: reasonOf(cause) });

const buildEngine = Effect.fn("Desktop.buildEngine")(function* (root: string) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

  const code = yield* spawner
    .exitCode(
      ChildProcess.make("cargo", ["build", "--release", "-p", "drone-engine"], {
        cwd: root,
        stdout: "inherit",
        stderr: "inherit",
      }),
    )
    .pipe(Effect.mapError(engineFailure));

  if (code !== 0)
    return yield* new EngineStartError({ reason: `cargo build exited with ${String(code)}` });
});

const ENGINE_READY_WITHIN = "30 seconds";

const spawnEngine = Effect.fn("Desktop.spawnEngine")(function* (root: string, binary: string) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const ready = yield* Deferred.make<URL>();

  const engine = yield* spawner
    .spawn(
      ChildProcess.make(binary, [], {
        cwd: root,
        env: { DRONE_ROOT: root, DRONE_ENGINE_PORT: "0" },
        extendEnv: true,
        stderr: "inherit",
      }),
    )
    .pipe(Effect.mapError(engineFailure));

  yield* Stream.splitLines(Stream.decodeText(engine.stdout)).pipe(
    Stream.runForEach((line) =>
      Option.match(readyUrl(line), {
        onNone: () => Effect.void,
        onSome: (url) => Deferred.succeed(ready, url),
      }),
    ),
    Effect.ignore,
    Effect.forkScoped,
  );

  const url = yield* Deferred.await(ready).pipe(
    Effect.timeoutOrElse({
      duration: ENGINE_READY_WITHIN,
      orElse: () =>
        Effect.fail(
          new EngineStartError({
            reason: `no DRONE_ENGINE_READY line within ${ENGINE_READY_WITHIN}`,
          }),
        ),
    }),
  );

  yield* Effect.logInfo("drone-engine ready").pipe(
    Effect.annotateLogs({ url: url.href, pid: engine.pid }),
  );

  return url;
});

const startEngine = (source: EngineSource) =>
  EngineSource.match(source, {
    Attach: (attach) => Effect.succeed(attach.url),
    Spawn: (spawn) =>
      buildEngine(spawn.root).pipe(Effect.andThen(spawnEngine(spawn.root, spawn.binary))),
  });

const NOT_READY = "the Studio has not reported a connected engine and a rendered frame yet";

const SMOKE_WITHIN = "90 seconds";

const captureSmoke = Effect.fn("Desktop.captureSmoke")(function* (
  window: BrowserWindow,
  file: string,
) {
  const fs = yield* FileSystem.FileSystem;

  yield* Effect.tryPromise({
    try: () => window.webContents.executeJavaScript(STUDIO_READY_PROBE),
    catch: (cause) => new SmokeError({ reason: reasonOf(cause) }),
  }).pipe(
    Effect.flatMap((ready) =>
      ready === true ? Effect.void : Effect.fail(new SmokeError({ reason: NOT_READY })),
    ),
    Effect.retry({
      schedule: Schedule.spaced("250 millis"),
      while: (error) => error.reason === NOT_READY,
    }),
    Effect.timeoutOrElse({
      duration: SMOKE_WITHIN,
      orElse: () => Effect.fail(new SmokeError({ reason: `${NOT_READY} after ${SMOKE_WITHIN}` })),
    }),
  );

  yield* Effect.sleep("1500 millis");

  const image = yield* Effect.tryPromise({
    try: () => window.webContents.capturePage(undefined, { stayHidden: true }),
    catch: (cause) => new SmokeError({ reason: reasonOf(cause) }),
  });

  if (image.isEmpty()) return yield* new SmokeError({ reason: "the captured page is empty" });

  yield* fs
    .writeFile(file, image.toPNG())
    .pipe(Effect.mapError((cause) => new SmokeError({ reason: cause.message })));

  yield* Effect.logInfo("smoke capture written").pipe(Effect.annotateLogs({ file }));
});

const focusMainWindow = () => {
  const [window] = BrowserWindow.getAllWindows();

  if (window === undefined) return;

  if (window.isMinimized()) window.restore();

  window.focus();
};

const reopenOnActivate = (home: URL, icon: string) =>
  Effect.gen(function* () {
    const context = yield* Effect.context<never>();

    const onActivate = () => {
      if (BrowserWindow.getAllWindows().length > 0) return;

      // BRIDGE: Electron emits activate as a plain event; the new window loads in its own fiber
      Effect.runForkWith(context)(
        openMainWindow(home, icon, windowPlan(false)).pipe(
          Effect.catchTag("RendererLoadError", (error) =>
            Effect.logError("window not reopened").pipe(
              Effect.annotateLogs({ reason: error.reason }),
            ),
          ),
        ),
      );
    };

    yield* Effect.acquireRelease(
      Effect.sync(() => app.on("activate", onActivate)),
      () => Effect.sync(() => app.removeListener("activate", onActivate)),
    );
  });

const focusOnSecondInstance = Effect.acquireRelease(
  Effect.sync(() => app.on("second-instance", focusMainWindow)),
  () => Effect.sync(() => app.removeListener("second-instance", focusMainWindow)),
);

const listenForQuit = Effect.gen(function* () {
  const requested = yield* Deferred.make<void>();

  const onBeforeQuit = (event: Event) => {
    event.preventDefault();
    Deferred.doneUnsafe(requested, Exit.void);
  };

  const onAllWindowsClosed = () => {
    if (process.platform !== "darwin") Deferred.doneUnsafe(requested, Exit.void);
  };

  yield* Effect.acquireRelease(
    Effect.sync(() => {
      app.on("before-quit", onBeforeQuit);
      app.on("window-all-closed", onAllWindowsClosed);
    }),
    () =>
      Effect.sync(() => {
        app.removeListener("before-quit", onBeforeQuit);
        app.removeListener("window-all-closed", onAllWindowsClosed);
      }),
  );

  return requested;
});

const showIcon = (icon: string) =>
  Effect.sync(() => {
    if (process.platform === "darwin") app.dock?.setIcon(icon);
  });

interface ShellOptions {
  readonly source: RendererSource;
  readonly icon: string;
  readonly engine: EngineSource;
  readonly smoke: Option.Option<string>;
}

const runShell = (options: ShellOptions) =>
  Effect.gen(function* () {
    const { source, icon, smoke } = options;
    const quitRequested = yield* listenForQuit;

    yield* focusOnSecondInstance;

    const engineUrl = yield* startEngine(options.engine);
    const home = withEngine(appUrl(source), engineUrl);

    yield* Effect.promise(() => app.whenReady());
    yield* showIcon(icon);
    yield* denyPermissions;

    if (RendererSource.guards.Bundle(source)) yield* serveBundle(source);

    if (Option.isSome(smoke)) {
      const window = yield* openMainWindow(home, icon, windowPlan(true));

      yield* captureSmoke(window, smoke.value);

      return;
    }

    yield* reopenOnActivate(home, icon);
    yield* openMainWindow(home, icon, windowPlan(false));
    yield* Deferred.await(quitRequested);
  }).pipe(Effect.scoped);

const APP_NAME = "Drone Studio";

const program = Effect.gen(function* () {
  const path = yield* Path.Path;
  const source = yield* rendererSource;
  const userData = yield* Config.String("DESKTOP_USER_DATA_DIR").pipe(Config.option);
  const smoke = yield* Config.String("DESKTOP_SMOKE").pipe(Config.option);
  const attach = yield* Config.URL("DESKTOP_ENGINE_URL").pipe(Config.option);

  const root = yield* Config.String("DRONE_ROOT").pipe(
    Config.withDefault(path.resolve(app.getAppPath(), "..", "..")),
  );

  const icon = path.resolve(app.getAppPath(), "resources", "icon.png");

  yield* Effect.sync(() => app.setName(APP_NAME));

  if (Option.isSome(userData)) yield* Effect.sync(() => app.setPath("userData", userData.value));

  const isPrimary = yield* Effect.sync(() => app.requestSingleInstanceLock());

  if (isPrimary) yield* runShell({ source, icon, engine: engineSource(attach, root), smoke });

  yield* Effect.sync(() => app.quit());
}).pipe(
  Effect.catchTags({
    EngineStartError: (error) =>
      Effect.logError("drone-engine did not start").pipe(
        Effect.annotateLogs({ reason: error.message }),
        Effect.andThen(Effect.sync(() => app.exit(1))),
      ),
    SmokeError: (error) =>
      Effect.logError("desktop smoke run failed").pipe(
        Effect.annotateLogs({ reason: error.message }),
        Effect.andThen(Effect.sync(() => app.exit(1))),
      ),
  }),
);

program.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
