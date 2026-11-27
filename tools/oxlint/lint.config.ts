import type { OxlintConfig } from "vite-plus/lint";

const skill = ".agents/skills/effect-best-practices/references";

const clientStateMessage =
  "Client state lives in Effect atoms from @drone-studio/client-runtime (root ADR 0010), not React Query.";

const antiSlopRules = {
  "anti-slop/no-array-filter-map": "error",
  "anti-slop/no-chained-type-assertions": "error",
  "anti-slop/no-conditional-empty-object-spread": "error",
  "anti-slop/no-known-value-widening": "error",
  "anti-slop/no-module-mocking": "error",
  "anti-slop/no-object-parameters": "error",
  "anti-slop/no-reduce-accumulator-copy": "error",
  "anti-slop/no-reflect-apply": "error",
  "anti-slop/no-reflect-get": "error",
  "anti-slop/no-runtime-typeof": "error",
  "anti-slop/no-shape-in-symbol-names": "error",
  "anti-slop/no-unknown-parameters": "error",
  "anti-slop/no-unknown-returns": "error",
  "anti-slop/no-unknown-type-aliases": "error",
  "anti-slop/no-unsafe-dictionary-type": "error",
  "anti-slop/no-widen-then-assert": "error",
  "anti-slop/require-readable-spacing": "error",
  "anti-slop/require-safety-comment-for-type-assertion": "error",
  "anti-slop-effect/no-manual-effect-error-tag": "error",
  "anti-slop-effect/no-manual-tag-comparison": "error",
  "anti-slop-effect/no-manual-tagged-construction": "error",
  "anti-slop-effect/no-service-constructor-imports": "error",
  "anti-slop-effect/prefer-effect-match": "error",
} satisfies OxlintConfig["rules"];

const effectRules = {
  "@drone-studio/effect/branded-ids": "error",
  "@drone-studio/effect/config-in-env-schema": "error",
  "@drone-studio/effect/effect-fn-name": "error",
  "@drone-studio/effect/layer-config-only-in-roots": [
    "error",
    {
      allow: [
        "apps/api/src/server.ts",
        "apps/api/src/app.layer.ts",
        "apps/infra/src/worker.ts",
        "apps/cli/src/main.ts",
        "apps/cli/src/commands/*.ts",
        "apps/desktop/src/main.ts",
      ],
    },
  ],
  "@drone-studio/effect/layer-naming": "error",
  "@drone-studio/effect/log-literal-message": "error",
  "@drone-studio/effect/module-boundaries": [
    "error",
    {
      sourceRoot: "packages/core/src",
      indexOnly: ["packages/*/src/**"],
      rootFiles: ["apps/*/src/*"],
    },
  ],
  "@drone-studio/effect/no-decode-sync": "error",
  "@drone-studio/effect/no-domain-adapters": "error",
  "@drone-studio/effect/no-domain-sql": "error",
  "@drone-studio/effect/no-error-instanceof": "error",
  "@drone-studio/effect/no-error-subclass": "error",
  "@drone-studio/effect/no-new-promise": "error",
  "@drone-studio/effect/no-store-fakes": "error",
  "@drone-studio/effect/no-throw-in-effect": "error",
  "@drone-studio/effect/no-try-in-tests": "error",
  "@drone-studio/effect/no-untyped-failure": "error",
  "@drone-studio/effect/redacted-secrets": "error",
  "@drone-studio/effect/retry-requires-while": "error",
  "@drone-studio/effect/run-only-in-entry-points": [
    "error",
    {
      allow: [
        "apps/api/src/server.ts",
        "apps/cli/src/main.ts",
        "apps/desktop/src/main.ts",
        "**/vitest.global-setup.ts",
      ],
    },
  ],
  "@drone-studio/effect/service-explicit-shape": "error",
  "@drone-studio/effect/service-id-matches-path": [
    "error",
    {
      prefix: "drone-studio/core",
      sourceRoot: "packages/core/src",
      extraRoots: {
        "packages/*/src": "drone-studio/*",
      },
      idSource: "class",
    },
  ],
  "@drone-studio/effect/tagged-error-naming": ["error", { filePattern: "\\.errors\\.ts$" }],
  "@drone-studio/effect/try-requires-catch": "error",
} satisfies OxlintConfig["rules"];

const testHygieneRules = {
  "@drone-studio/test-hygiene/no-polling-loop-in-tests": "error",
  "@drone-studio/test-hygiene/no-real-time-wait-in-tests": "error",
  "@drone-studio/test-hygiene/no-test-timeout-or-unreasoned-skip": "error",
  "vitest/no-disabled-tests": "off",
  "vitest/no-focused-tests": "off",
} satisfies OxlintConfig["rules"];

const lint = {
  options: { typeAware: true, denyWarnings: true, reportUnusedDisableDirectives: "error" },
  plugins: ["typescript", "oxc", "import", "promise", "vitest"],
  jsPlugins: [
    { name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" },
    { name: "anti-slop-effect", specifier: "./tools/oxlint/anti-slop/effect/index.ts" },
    { name: "@drone-studio/effect", specifier: "./tools/oxlint/drone-studio/effect/index.ts" },
    {
      name: "@drone-studio/no-comments",
      specifier: "./tools/oxlint/drone-studio/no-comments/index.ts",
    },
    {
      name: "@drone-studio/suppressions",
      specifier: "./tools/oxlint/drone-studio/suppressions/index.ts",
    },
    {
      name: "@drone-studio/test-hygiene",
      specifier: "./tools/oxlint/drone-studio/test-hygiene/index.ts",
    },
    { name: "@drone-studio/frontend", specifier: "./tools/oxlint/drone-studio/frontend/index.ts" },
  ],
  categories: { correctness: "error" },
  env: { builtin: true, es2024: true },
  rules: {
    ...antiSlopRules,
    "@drone-studio/no-comments/no-comments": "error",
    "@drone-studio/suppressions/require-suppression-reason": "error",
    "no-alert": "error",
    "no-debugger": "error",
    "no-unused-vars": "off",
    "typescript/no-unused-vars": "error",
    "import/no-cycle": "error",
    "oxc/no-accumulating-spread": "error",
    "vitest/no-restricted-vi-methods": [
      "error",
      {
        useFakeTimers: `Use TestClock (see ${skill}/01-default-services.md).`,
        setSystemTime: `Use TestClock (see ${skill}/01-default-services.md).`,
      },
    ],
  },
  overrides: [
    {
      files: ["**/*.test.ts", "**/*.test.tsx"],
      rules: testHygieneRules,
    },
    {
      files: ["apps/web/**", "apps/mobile/**", "packages/ui/**"],
      plugins: ["react"],
      env: { browser: true },
    },
    {
      files: ["apps/web/src/**"],
      rules: {
        "@drone-studio/frontend/feature-boundaries": [
          "error",
          {
            featuresRoot: "apps/web/src/features",
            layers: ["apps/web/src/shared", "apps/web/src/features", "apps/web/src/app"],
            roots: ["apps/web/src/runtime.ts"],
          },
        ],
      },
    },
    {
      files: ["apps/mobile/src/**"],
      rules: {
        "@drone-studio/frontend/feature-boundaries": [
          "error",
          {
            featuresRoot: "apps/mobile/src/features",
            layers: ["apps/mobile/src/shared", "apps/mobile/src/features", "apps/mobile/src/app"],
            roots: ["apps/mobile/src/runtime.ts"],
          },
        ],
        "@drone-studio/frontend/accessible-controls": "error",
      },
    },
    {
      files: ["apps/**", "packages/**"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [{ name: "@tanstack/react-query", message: clientStateMessage }],
            patterns: [{ group: ["@tanstack/react-query/*"], message: clientStateMessage }],
          },
        ],
      },
    },
    {
      files: ["apps/api/**", "apps/cli/**", "apps/desktop/**", "apps/infra/**", "packages/**"],
      rules: effectRules,
    },
    {
      files: [
        "apps/api/**",
        "apps/cli/**",
        "apps/desktop/**",
        "apps/infra/**",
        "packages/auth/**",
        "packages/database/**",
        "packages/mail/**",
        "scripts/**",
        "tools/**",
        "*.config.ts",
      ],
      env: { node: true },
    },
    {
      files: ["tools/oxlint/**"],
      rules: { "anti-slop/no-runtime-typeof": "off" },
    },
  ],
  ignorePatterns: [
    "**/dist/**",
    "**/node_modules/**",
    "**/coverage/**",
    "tools/oxlint/anti-slop/**",
    "apps/web/src/paraglide/**",
    "apps/mobile/src/paraglide/**",
    "apps/mobile/uniwind-types.d.ts",
    ".agents/**",
    ".claude/**",
    ".scratch/**",
  ],
} satisfies OxlintConfig;

export default lint;
