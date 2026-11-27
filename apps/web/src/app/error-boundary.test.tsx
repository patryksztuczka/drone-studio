import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { ErrorBoundary } from "./error-boundary.tsx";

const Crash = (): ReactNode => {
  throw new Error("private engine state");
};

describe("ErrorBoundary", () => {
  it("replaces a crashed window with a reload screen that hides the exception", () => {
    const report = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <ErrorBoundary>
        <Crash />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("heading", { name: "Drone Studio stopped." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(screen.queryByText(/private engine state/)).not.toBeInTheDocument();
    report.mockRestore();
  });

  it("renders its children while nothing fails", () => {
    render(
      <ErrorBoundary>
        <p>studio</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText("studio")).toBeInTheDocument();
  });
});
