import "@fontsource-variable/archivo/wdth.css";
import "@fontsource-variable/jetbrains-mono";
import "@drone-studio/ui/globals.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ErrorBoundary } from "./app/error-boundary.tsx";
import { StudioPage } from "./features/studio/index.ts";

const container = document.querySelector("#root");

if (container !== null) {
  createRoot(container).render(
    <StrictMode>
      <ErrorBoundary>
        <StudioPage />
      </ErrorBoundary>
    </StrictMode>,
  );
}
