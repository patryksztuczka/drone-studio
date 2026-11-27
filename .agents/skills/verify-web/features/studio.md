# Studio page

`apps/web/src/features/studio/` is the page the Studio window shows at `/`. Until `drone-engine` speaks to it, it names the app and says the engine is not connected.

## Drive

1. Open `urls.web`. The page is dark, shows the heading "Drone Studio." and the status line "The engine is not connected yet."
2. Run `pnpm dev:desktop` and check the window shows the same page. Quit the window.
3. Repeat at a phone viewport. The heading and the status line fit without horizontal scrolling.

## What usually lies

- **A browser in light mode.** The page is dark because `index.html` sets the `dark` class, not because of the system theme. Check it with the system set to light.
