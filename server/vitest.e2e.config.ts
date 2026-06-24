import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/e2e/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    testTimeout: 30000,
  },
})
