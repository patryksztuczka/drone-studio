import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

const WEB_PORT = Number(process.env["DEV_WEB_PORT"] ?? "5173");

export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
  server: {
    port: WEB_PORT,
    strictPort: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    retry: 0,
    allowOnly: !process.env["CI"],
    passWithNoTests: false,
    fsModuleCachePath: "node_modules/.vitest-cache",
  },
});
