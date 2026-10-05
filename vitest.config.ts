import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // The schema suite boots a real PostgreSQL engine in WebAssembly.
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
