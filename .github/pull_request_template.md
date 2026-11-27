<!--
Use a Conventional Commit title in plain language, such as
"fix(sim): keep the battery voltage from going negative under a long sag". A squash merge puts the title on
master, and the PR title check accepts only the types in scripts/conventional-commit.mjs.
Write every section from the final diff, not from the branch's commit history. Solve one
underlying problem; split independent fixes into their own pull requests.
-->

## Problem

<!-- What is wrong or missing, in a sentence or two, and why it matters. For a bug, include the
expected behavior and how the failure shows up: reproduction steps, the environment, the log line. -->

## Change

<!-- How this solves the problem: the behavior it introduces and the tradeoffs a reviewer should
weigh. If it spans apps, packages or infrastructure, say why each part is needed for the same
problem. Name the ADR it records or follows. List anything that must happen around the merge:
a regenerated file, a new manifest field, a toolchain bump. -->

## Verification

<!-- Evidence, not a claim. Paste each command you ran with the lines of its output that show the
result, and for a UI change the verify-web evidence (screenshot, log excerpt). Write
"inconclusive" next to anything you could not run, and say why. "Tests pass" alone is not evidence,
and pnpm verify does not replace checking the affected behavior. Say whether you ran
pnpm check:rust. Upload screenshots and recordings with pnpm -s pr-evidence <files> and paste
the Markdown it prints, or drag them into this description. Put screenshots in a table, before on
the left and after on the right, one row per screen. Never commit them. Show synthetic data
only. Example:

$ cargo test -p drone-sim
test result: ok. 12 passed; 0 failed
$ verify-web: Studio page shows the engine status -> before/after screenshots below
$ drone emu smoke: inconclusive, Docker was not running

| Screen | Before | After |
| ------ | ------ | ----- |
| Studio | ![studio before](…) | ![studio after](…) |
-->
