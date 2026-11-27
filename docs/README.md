# Documentation

Find what you need by who you are.

## Product vision & architecture

- [Initial brief](vision/drone-devenv-brief.md): original input brief covering vision, simulator modules, Renode and open questions
- [Platform analysis](vision/drone-platform-analysis.md): feasibility assessment, UX pillars, architecture options and finalized technical decisions
- [M0 + M1 technical blueprint](vision/drone-studio-m0-m1-blueprint.md): reference palm-sized quadcopter (`palm_x4_2in`), monorepo layout, protocols and milestone acceptance criteria

## I use the product

Drone Studio has no user-facing feature yet. Each one gets its page in `user/` when it ships.

## I run the project

The [README](../README.md) has the quickstart. The runbooks:

- [Local development](operations/development.md): the toolchains, the web dev server, ports, environment variables, the desktop app
- [CI](operations/ci.md): the stages and what each one checks
- [Emulation](operations/emulation.md): the STM32H743 firmware, the Renode container, the IMU model and `drone emu smoke`
- [Pull request evidence](operations/pr-evidence.md): upload screenshots and recordings to R2 and paste them into a pull request

## I work on this repository

Start with [AGENTS.md](../AGENTS.md) for the commands, where code goes and the stop rules, and [CODING_STANDARDS.md](../CODING_STANDARDS.md) for where each coding rule lives.

Then the [Context Map](../CONTEXT-MAP.md): it names the bounded contexts, how they relate, and links each one's folder under `internals/`. Each folder holds the context's glossary (`GLOSSARY.md`), its decisions (`adr/`) and, once written, one file per module recording the decisions and traps the code does not show.

- [System-wide ADRs](internals/system/adr): the monorepo, Effect, comments, and the Rust engine with the Electron Studio that replaced the template's server stack (root ADR 0016). The older ones it supersedes stay for their history
- [ADR template](internals/adr-template.md)

How Effect code is written is in the [`effect-best-practices` skill](../.agents/skills/effect-best-practices/SKILL.md). Code carries no comments except `VENDOR:` notes about defects in software we do not own ([root ADR 0004](internals/system/adr/0004-keep-only-comments-about-other-peoples-defects.md)).

## I am an agent

[AGENTS.md](../AGENTS.md) is the law. Skills live in [`.agents/skills/`](../.agents/skills); `.claude/skills/` links to the same folders.

## Where a sentence belongs

Every piece of knowledge has one home, and every other mention links to it. If the home already says it, link; if it says it differently, fix the home.

| Kind of knowledge                                   | Home                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| What a term means inside a bounded context          | `internals/<context>/GLOSSARY.md`                                                     |
| Which contexts exist and how they relate            | [`CONTEXT-MAP.md`](../CONTEXT-MAP.md)                                                 |
| A module's decisions and traps the code cannot show | its module file, `internals/<context>/<module>.md`                                    |
| Why a decision was made and what it cost            | an ADR in `internals/<context>/adr/`, or `internals/system/adr/`                      |
| How Effect code is written                          | the [`effect-best-practices` skill](../.agents/skills/effect-best-practices/SKILL.md) |
| What the product is and where it is going           | [`vision/`](vision)                                                                   |
| Commands, where code goes, what needs sign-off      | [`AGENTS.md`](../AGENTS.md)                                                           |
| How a user does something with the product          | its feature page, `user/<feature>.md`                                                 |
| How to run the project                              | `operations/`; the [README](../README.md) keeps the quickstart                        |
| Where the project came from and what was cut        | the "Origin" section of the [README](../README.md#origin)                             |
| What a package is and how to build, run and test it | that package's README, when it needs more than `AGENTS.md` says                       |
| A workaround for a defect in software we do not own | a `VENDOR:` comment at the workaround                                                 |
| What the code does, and what a test proves          | the code: its names, types and tests                                                  |
| Why a change was made                               | the commit message and the pull request                                               |

## Writing user docs

A page in `user/` helps someone use the product, not build it.

- Give each feature a short page: what it does, how to start, and whatever is not obvious, such as a limit, an expiry or an action that cannot be undone.
- Name the button or the settings path the reader needs. Do not describe icons, layouts, animations or every state of the screen.
- Use the product's voice and the context's glossary words. Leave out code, endpoints, libraries and contributor commands.
- When the way to use a feature changes, rewrite its section in the same change. A small UI tweak needs no entry, and a new control does not need its own page.
- Instructions for running the system go in `operations/`, not here.
