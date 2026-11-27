import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { StudioPage } from "./studio-page.tsx";

describe("StudioPage", () => {
  it("names the app and says the engine is not connected", () => {
    render(<StudioPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Drone Studio." })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("The engine is not connected yet.");
  });
});
