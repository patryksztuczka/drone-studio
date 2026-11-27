import { spawn } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { devEnvironment, PORT_VARIABLES, repositoryRoot } from "./dev-ports.mjs";

const READY_TIMEOUT_MS = 180_000;

const STOP_GRACE_MS = 5_000;

const USAGE =
  "Usage: node scripts/dev.mjs [up|stop|status|ports|desktop]\n" +
  "  up          the web app's Vite dev server and drone-engine (default)\n" +
  "  stop        stops a pnpm dev started from this worktree\n" +
  "  status      prints .dev/state.json when pnpm dev is running\n" +
  "  ports       prints the ports and URLs this worktree uses, without starting anything\n" +
  "  desktop ... builds apps/desktop and opens it on this worktree's web dev server, starting one when none runs; the window starts its own drone-engine; arguments after -- go to Electron\n";

const statePath = (root) => join(root, ".dev", "state.json");

const logPath = (root, name) => join(root, ".dev", "logs", `${name}.log`);

function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;

  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
}

function readState(root) {
  const path = statePath(root);

  if (!existsSync(path)) return undefined;

  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

const runningState = (root) => {
  const state = readState(root);

  return state !== undefined && isAlive(state.pid) ? state : undefined;
};

const writeState = (root, state) =>
  writeFileSync(statePath(root), `${JSON.stringify(state, undefined, 2)}\n`);

const portIsFree = (port) =>
  new Promise((resolvePort) => {
    const server = createServer();

    server.once("error", () => resolvePort(false));
    server.listen({ port, host: "localhost", exclusive: true }, () => {
      server.close(() => resolvePort(true));
    });
  });

const delay = (milliseconds) =>
  new Promise((resolveDelay) => {
    setTimeout(resolveDelay, milliseconds);
  });

function prefixLines(prefix, stream, target, log) {
  let pending = "";

  stream.on("data", (chunk) => {
    const text = chunk.toString("utf8");

    log.write(text);

    const lines = `${pending}${text}`.split("\n");

    pending = lines.pop() ?? "";

    for (const line of lines) target.write(`${prefix} ${line}\n`);
  });

  stream.on("end", () => {
    if (pending !== "") target.write(`${prefix} ${pending}\n`);
  });
}

function startChild(root, name, args, variables) {
  const log = createWriteStream(logPath(root, name), { flags: "w" });

  const child = spawn("pnpm", args, {
    cwd: root,
    env: { ...process.env, ...variables },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  prefixLines(`[${name}]`, child.stdout, process.stdout, log);
  prefixLines(`[${name}]`, child.stderr, process.stderr, log);

  return child;
}

const engineBinary = (root) => join(root, "target", "release", "drone-engine");

function buildEngine(root) {
  const log = createWriteStream(logPath(root, "engine-build"), { flags: "w" });

  process.stdout.write("dev: cargo build --release -p drone-engine\n");

  return new Promise((resolveBuild) => {
    const cargo = spawn("cargo", ["build", "--release", "-p", "drone-engine"], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });

    cargo.stdout.pipe(log);
    cargo.stderr.pipe(log);
    cargo.on("error", () => resolveBuild(false));
    cargo.on("exit", (code) => resolveBuild(code === 0));
  });
}

function startEngine(root, port) {
  const log = createWriteStream(logPath(root, "engine"), { flags: "w" });

  const child = spawn(engineBinary(root), [], {
    cwd: root,
    env: { ...process.env, DRONE_ROOT: root, DRONE_ENGINE_PORT: String(port) },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  prefixLines("[engine]", child.stdout, process.stdout, log);
  prefixLines("[engine]", child.stderr, process.stderr, log);

  const ready = new Promise((resolveReady) => {
    let seen = "";

    child.stdout.on("data", (chunk) => {
      seen += chunk.toString("utf8");

      const match = /DRONE_ENGINE_READY (\S+)/.exec(seen);

      if (match !== null) resolveReady(match[1]);
    });
    child.on("exit", () => resolveReady(undefined));
  });

  return { child, ready };
}

function signalGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch {
    return false;
  }

  return true;
}

async function stopChildren(pids) {
  const running = pids.filter(isAlive);

  for (const pid of running) signalGroup(pid, "SIGTERM");

  const deadline = Date.now() + STOP_GRACE_MS;

  while (Date.now() < deadline && running.some(isAlive)) await delay(100);

  for (const pid of running) signalGroup(pid, "SIGKILL");
}

async function answers(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });

    return response.ok;
  } catch {
    return false;
  }
}

async function waitUntilReady(urls, children) {
  const deadline = Date.now() + READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (children.some((child) => child.exitCode !== null)) return false;

    if (await answers(urls.web)) return true;

    await delay(500);
  }

  return false;
}

async function portsAreFree(ports, services) {
  for (const service of services) {
    if (!(await portIsFree(ports[service]))) {
      process.stderr.write(
        `dev: port ${String(ports[service])} (${service}) is taken. Stop what holds it or set ${PORT_VARIABLES[service]}.\n`,
      );

      return false;
    }
  }

  return true;
}

async function startWeb(root, { withEngine }) {
  const { ports, urls, variables } = devEnvironment(root, process.env);

  if (!(await portsAreFree(ports, withEngine ? ["web", "engine"] : ["web"]))) return undefined;

  process.stdout.write(`dev: worktree ${root}\ndev: web ${urls.web}\n`);
  mkdirSync(join(root, ".dev", "logs"), { recursive: true });

  if (withEngine && !(await buildEngine(root))) {
    process.stderr.write(
      `dev: cargo could not build drone-engine; see ${logPath(root, "engine-build")}\n`,
    );

    return undefined;
  }

  const engine = withEngine ? startEngine(root, ports.engine) : undefined;
  const web = startChild(root, "web", ["--filter", "@drone-studio/web", "run", "dev"], variables);

  const children =
    engine === undefined ? { web: web.pid } : { web: web.pid, engine: engine.child.pid };

  const state = {
    status: "starting",
    pid: process.pid,
    root,
    ports,
    urls: engine === undefined ? { web: urls.web } : urls,
    children,
    logs:
      engine === undefined
        ? { web: logPath(root, "web") }
        : { web: logPath(root, "web"), engine: logPath(root, "engine") },
    startedAt: new Date().toISOString(),
  };

  writeState(root, state);

  let stopping = false;

  const shutdown = async () => {
    if (stopping) return;

    stopping = true;
    await stopChildren(Object.values(children).map((pid) => pid ?? -1));
    rmSync(statePath(root), { force: true });
  };

  const exitWith = async (code) => {
    await shutdown();
    process.exit(code);
  };

  process.on("SIGINT", () => void exitWith(130));
  process.on("SIGTERM", () => void exitWith(143));

  const exited = new Promise((resolveExit) => {
    web.on("exit", (code) => resolveExit(code ?? 1));
    engine?.child.on("exit", (code) => resolveExit(code ?? 1));
  });

  if (engine !== undefined && (await engine.ready) === undefined) {
    process.stderr.write(
      `dev: drone-engine exited before it was ready; see ${logPath(root, "engine")}\n`,
    );
    await shutdown();

    return undefined;
  }

  if (!(await waitUntilReady(urls, [web]))) {
    process.stderr.write(`dev: the web dev server did not answer ${urls.web} in time\n`);
    await shutdown();

    return undefined;
  }

  const ready = { ...state, status: "ready" };

  writeState(root, ready);

  return { state: ready, exited, shutdown, isStopping: () => stopping };
}

async function up(root) {
  const running = runningState(root);

  if (running !== undefined) {
    process.stdout.write(
      `dev: already running (pid ${String(running.pid)}): web ${running.urls.web}\n`,
    );

    return 0;
  }

  const web = await startWeb(root, { withEngine: true });

  if (web === undefined) return 1;

  process.stdout.write(
    `dev: ready. Open ${web.state.urls.web} (engine ${web.state.urls.engine}). State in .dev/state.json, logs in .dev/logs/. Stop with Ctrl-C or pnpm dev:stop.\n`,
  );

  const code = await web.exited;

  if (web.isStopping()) return 0;

  process.stderr.write(
    `dev: the web dev server or drone-engine exited with code ${String(code)}\n`,
  );
  await web.shutdown();

  return 1;
}

async function stop(root) {
  const state = readState(root);

  if (state === undefined) {
    process.stdout.write("dev: not running\n");

    return 0;
  }

  if (isAlive(state.pid)) process.kill(state.pid, "SIGTERM");

  await stopChildren(Object.values(state.children ?? {}));

  const deadline = Date.now() + STOP_GRACE_MS;

  while (Date.now() < deadline && isAlive(state.pid)) await delay(100);

  rmSync(statePath(root), { force: true });
  process.stdout.write("dev: stopped\n");

  return 0;
}

function runPnpm(root, args, environment) {
  return new Promise((resolveRun) => {
    const child = spawn("pnpm", args, { cwd: root, stdio: "inherit", env: environment });

    child.on("error", () => resolveRun(1));
    child.on("exit", (code) => resolveRun(code ?? 1));
  });
}

async function desktop(root, args) {
  const running = runningState(root);

  if (running !== undefined && running.status !== "ready") {
    process.stderr.write("dev: the web dev server of this checkout is still starting; try again\n");

    return 1;
  }

  const started = running === undefined ? await startWeb(root, { withEngine: false }) : undefined;
  const url = running?.urls.web ?? started?.state.urls.web;

  if (url === undefined) return 1;

  try {
    const build = await runPnpm(
      root,
      ["--silent", "--filter", "@drone-studio/desktop", "run", "build"],
      process.env,
    );

    if (build !== 0) return build;

    const { ELECTRON_RUN_AS_NODE: _runAsNode, ...environment } = process.env;

    return await runPnpm(
      root,
      ["--silent", "--filter", "@drone-studio/desktop", "exec", "electron", ".", ...args],
      {
        ...environment,
        DESKTOP_RENDERER_URL: url,
        DESKTOP_USER_DATA_DIR: join(root, ".dev", "desktop"),
      },
    );
  } finally {
    await started?.shutdown();
  }
}

async function main(argv) {
  const root = repositoryRoot();
  const task = argv[0] ?? "up";

  if (task === "up") return up(root);

  if (task === "stop") return stop(root);

  if (task === "status") {
    const state = runningState(root);

    process.stdout.write(
      state === undefined ? "dev: not running\n" : `${JSON.stringify(state, undefined, 2)}\n`,
    );

    return state === undefined ? 1 : 0;
  }

  if (task === "ports") {
    process.stdout.write(`${JSON.stringify(devEnvironment(root, process.env), undefined, 2)}\n`);

    return 0;
  }

  if (task === "desktop") {
    return desktop(
      root,
      argv.slice(1).filter((argument) => argument !== "--"),
    );
  }

  process.stderr.write(USAGE);

  return 1;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`dev: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
