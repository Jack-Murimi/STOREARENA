import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // The schema suites boot a real PostgreSQL engine in WebAssembly. Two of
    // them at once exhaust the sandbox's memory and the second stalls, so test
    // files run one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
