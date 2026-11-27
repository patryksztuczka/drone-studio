import { EngineConnection, engineLayer } from "@drone-studio/engine-client";
import { RegistryProvider } from "@effect/atom-react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { TopBar } from "./top-bar.tsx";

const unreachable = [[engineLayer, EngineConnection.layerAt("ws://127.0.0.1:9")]] as const;

describe("TopBar", () => {
  it("names the module, the target and the transport", () => {
    render(
      <RegistryProvider initialValues={unreachable}>
        <TopBar />
      </RegistryProvider>,
    );

    expect(screen.getByRole("button", { name: "Module: Workbench" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Target: SIM" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("says the engine is offline when nothing answers at its URL", async () => {
    render(
      <RegistryProvider initialValues={unreachable}>
        <TopBar />
      </RegistryProvider>,
    );

    expect(await screen.findByText("engine offline")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Engine" })).toHaveAttribute(
      "title",
      "ws://127.0.0.1:9",
    );
  });
});
