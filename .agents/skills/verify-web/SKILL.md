---
name: verify-web
description: Prove a change works in the running Studio, not only in tests. Use after any change a user could see or hit in apps/web, apps/desktop or packages/ui, before you say it is done, and whenever the user asks to check, click through, smoke test or screenshot the app.
---

# Verify web

Green tests are not proof. In the template this project came from, a form passed typecheck, lint and every unit test while the second submit after a reset did nothing under the React Compiler. A person clicking twice found it in ten seconds. This skill is that person.

Run the four steps in order. A step that fails is the result; do not skip to the next one and report success.

## 1. Launch

```sh
pnpm -s dev:status
```

If it prints a state, reuse that server. Otherwise start one in the background and wait for the line `dev: ready`:

```sh
pnpm dev    # runs until stopped, so start it as a background task
```

`pnpm dev` derives its port from this worktree's path, so two worktrees never share one. Never assume 5173. Read the URL from `.dev/state.json`:

```json
{ "status": "ready", "urls": { "web": "http://localhost:20040" } }
```

`node scripts/dev.mjs ports` prints it without starting anything. `DEV_WEB_PORT` overrides it. To check the desktop window, run `pnpm dev:desktop`; it reuses this server.

## 2. Drive

Open the feature file for what you changed and follow its "Drive" steps:

- [features/studio.md](features/studio.md): the Studio page and the desktop window
- [features/errors.md](features/errors.md): render crashes and recovery

Use the browser you have, in this order:

1. The host's browser tools (in-app preview, Claude in Chrome). Open a new tab on `urls.web`.
2. If they time out or are missing, `agent-browser`, a devDependency of this repo that `pnpm -s browser` runs. It uses the Chrome on the machine; without one, `pnpm -s browser install` downloads Chrome for Testing. Before the first command, load its guide for the installed version with `pnpm -s browser skills get core`. Give the run its own session, so you never drive another agent's browser:

```sh
export AGENT_BROWSER_SESSION="$(pnpm -s browser session id --scope worktree --prefix verify-web)"
WEB="$(node -p 'require("./.dev/state.json").urls.web')"
EVIDENCE="$PWD/.scratch/evidence"

pnpm -s browser open "$WEB/"
pnpm -s browser record start "$EVIDENCE/studio.mp4" --cursor
pnpm -s browser snapshot -i
pnpm -s browser wait '[role="status"]'
pnpm -s browser screenshot "$EVIDENCE/studio.png"
pnpm -s browser record stop
pnpm -s browser errors
pnpm -s browser console
```

Take the refs from your own `snapshot -i`, not from this example, and snapshot again after every change on the page. Give `screenshot` an absolute path: a lone argument that starts with `.` is read as a CSS selector, and the image lands in a temporary directory. `errors` and `console` print the page errors and the console output.

Drive it like a user, not like a test. Type into the field, click the button, wait for what a person would see. Do the thing twice when the feature file says so. Change one thing at a time and look at the screen after each step.

## 3. Evidence

Save screenshots and recordings to `.scratch/evidence/` (gitignored). Name each screenshot of a screen your change alters `<screen>.after.png`, and take a `<screen>.before.png` of the same screen in the same state without your change: before you edit, or from the base commit in its own worktree, where `pnpm dev` gets its own ports. The pull request shows them side by side (the `file-pr` skill). In your final message, quote:

- each step you drove and what you saw, in one line each,
- the screenshot and recording paths, embedded when the host renders them,
- the lines from `.dev/logs/web.log` that cover your requests, and any error or warning there or in `agent-browser errors` and `console`.

For a pull request, upload the same files with `pnpm -s pr-evidence` (the `file-pr` skill). When that upload is not set up, the chat is the only place the user sees them, so embed them there.

If you could not drive a step, say which and why. "Verified" without this evidence is a claim, not a result.

## 4. Cleanup

- Stop a `pnpm dev` you started: `pnpm dev:stop`. Leave one you reused running.
- Close browser tabs you opened, and the `agent-browser` session with `pnpm -s browser close`.

## When the app lies

These hold for any feature. Each feature file ends with "What usually lies" for its own traps; read both before you call a step good.

- **The second submit.** Under the React Compiler, `form.reset()` inside `handleSubmit` plus reading `form.formState` made the first submit work and every later one do nothing, and `reset()` there can leave the fields as they were. Tests that render a form once never see it. Submit twice in a row. Forms read `useFormState` and clear fields with `resetField`.
- **A page that only works in the browser.** The desktop window loads the same URL, but with no permissions, no popups and every outside link sent to the system browser. Check a change that opens, links or asks for a permission in `pnpm dev:desktop` too.

When you find a new one, add it in one line with how to see it: here when it holds for any feature, in the feature file when it does not.
