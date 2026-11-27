import { Button } from "@drone-studio/ui/components/button";

export const AppErrorPage = () => (
  <main className="mx-auto flex min-h-svh max-w-[768px] flex-col items-center justify-center gap-6 px-6 py-9 text-center">
    <h1 className="font-display text-[44px] leading-[0.97] sm:text-[60px]">
      Drone Studio stopped<span className="text-blue">.</span>
    </h1>
    <p className="max-w-[460px] text-[17px] leading-[27px] text-muted-foreground">
      Something in the window failed. Reload it to start again.
    </p>
    <Button
      type="button"
      className="h-11 rounded-[10px] px-[22px] text-[15px] font-semibold"
      onClick={() => globalThis.location.reload()}
    >
      Reload
    </Button>
  </main>
);
