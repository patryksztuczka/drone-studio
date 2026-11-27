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
  "  up          the web app's Vite dev server (default)\n" +
  "  stop        stops a pnpm dev started from this worktree\n" +
  "  status      prints .dev/state.json when pnpm dev is running\n" +
  "  ports       prints the ports and URLs this worktree uses, without starting anything\n" +
  "  desktop ... builds apps/desktop and opens it on this worktree's web dev server, starting one when none runs; arguments after -- go to Electron\n";

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

async function startWeb(root) {
  const { ports, urls, variables } = devEnvironment(root, process.env);

  if (!(await portIsFree(ports.web))) {
    process.stderr.write(
      `dev: port ${String(ports.web)} (web) is taken. Stop what holds it or set ${PORT_VARIABLES.web}.\n`,
    );

    return undefined;
  }

  process.stdout.write(`dev: worktree ${root}\ndev: web ${urls.web}\n`);
  mkdirSync(join(root, ".dev", "logs"), { recursive: true });

  const web = startChild(root, "web", ["--filter", "@drone-studio/web", "run", "dev"], variables);

  const state = {
    status: "starting",
    pid: process.pid,
    root,
    ports,
    urls,
    children: { web: web.pid },
    logs: { web: logPath(root, "web") },
    startedAt: new Date().toISOString(),
  };

  writeState(root, state);

  let stopping = false;

  const shutdown = async () => {
    if (stopping) return;

    stopping = true;
    await stopChildren([web.pid ?? -1]);
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
  });

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

  const web = await startWeb(root);

  if (web === undefined) return 1;

  process.stdout.write(
    `dev: ready. Open ${web.state.urls.web}. State in .dev/state.json, logs in .dev/logs/. Stop with Ctrl-C or pnpm dev:stop.\n`,
  );

  const code = await web.exited;

  if (web.isStopping()) return 0;

  process.stderr.write(`dev: the web dev server exited with code ${String(code)}\n`);
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

  const started = running === undefined ? await startWeb(root) : undefined;
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
