import { defineConfig } from "vite-plus";

import lint from "./tools/oxlint/lint.config.ts";

export default defineConfig({
  lint,
  fmt: {
    printWidth: 100,
    sortPackageJson: true,
    sortImports: {},
    ignorePatterns: ["tools/oxlint/anti-slop/**", ".scratch/**", "pnpm-lock.yaml"],
  },
  staged: {
    "*": "vp check --fix",
  },
});
