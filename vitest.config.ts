import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 5_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: ["src/**/*.ts"],
      // CLI files are exercised through spawned Node processes in integration
      // tests; Vitest's in-process V8 collector cannot attribute that coverage.
      exclude: ["src/types.ts", "src/cli.ts", "src/cli/**"],
      thresholds: {
        statements: 90,
        branches: 75,
        functions: 90,
        lines: 90,
      },
    },
  },
});
