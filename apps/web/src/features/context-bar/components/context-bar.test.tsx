import { EngineConnection, engineLayer } from "@drone-studio/engine-client";
import { RegistryProvider } from "@effect/atom-react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { ContextBar } from "./context-bar.tsx";

const unreachable = [[engineLayer, EngineConnection.layerAt("ws://127.0.0.1:9")]] as const;

describe("ContextBar", () => {
  it("offers the three targets, the speed and the transport", () => {
    render(
      <RegistryProvider initialValues={unreachable}>
        <ContextBar />
      </RegistryProvider>,
    );

    expect(screen.getByRole("radio", { name: "SIM" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "EMU" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "REAL" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Speed" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
  });

  it("says the engine is offline when nothing answers at its URL", async () => {
    render(
      <RegistryProvider initialValues={unreachable}>
        <ContextBar />
      </RegistryProvider>,
    );

    expect(await screen.findByText("engine offline")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("title", "ws://127.0.0.1:9");
  });
});
