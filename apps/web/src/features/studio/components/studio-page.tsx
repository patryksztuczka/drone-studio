export const StudioPage = () => (
  <main className="mx-auto flex min-h-svh max-w-[960px] flex-col justify-center gap-5 px-6 py-9">
    <h1 className="font-display text-[56px] leading-[0.95] sm:text-[80px]">
      Drone Studio<span className="text-brand">.</span>
    </h1>
    <p className="max-w-[560px] text-[17px] leading-[27px] text-muted-foreground">
      A workbench for the digital twin of the palm_x4_2in quad.
    </p>
    <p role="status" className="flex items-center gap-2.5 font-mono text-sm text-muted-foreground">
      <span aria-hidden="true" className="size-2 rounded-full bg-muted-foreground" />
      The engine is not connected yet.
    </p>
  </main>
);
