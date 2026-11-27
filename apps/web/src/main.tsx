import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "@drone-studio/ui/globals.css";
import { RegistryProvider } from "@effect/atom-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ErrorBoundary } from "./app/error-boundary.tsx";
import { StudioPage } from "./features/studio/index.ts";
import { studioInitialValues } from "./runtime.ts";

const container = document.querySelector("#root");

if (container !== null) {
  createRoot(container).render(
    <StrictMode>
      <ErrorBoundary>
        <RegistryProvider initialValues={studioInitialValues}>
          <StudioPage />
        </RegistryProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}
