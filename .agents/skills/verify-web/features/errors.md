# Error screen

`ErrorBoundary` around the Studio page in `main.tsx` catches render failures and shows `AppErrorPage`, which needs no other provider.

## Drive

1. In a browser-only harness, render a child that throws inside the real `ErrorBoundary`. It shows "Drone Studio stopped." and "Reload". No exception details appear. Do not leave a crash route in the app.
2. Click "Reload". The Studio page loads normally again.
3. Repeat at a phone viewport. The message and the button fit without horizontal scrolling.

## What usually lies

- **A static error preview.** It proves the screen renders, not that a thrown exception reaches the boundary. Trigger a real render failure too.
- **A hidden details element.** Even collapsed details disclose the exception. The screen never renders the exception or stack.
