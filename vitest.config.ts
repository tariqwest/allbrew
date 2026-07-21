import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "integration",
          include: ["tests/integration/**/*.int.test.ts"],
          environment: "node",
          testTimeout: 30_000,
        },
      },
      {
        test: {
          name: "e2e",
          include: ["tests/e2e/**/*.e2e.test.ts"],
          environment: "node",
          testTimeout: 300_000,
        },
      },
      {
        test: {
          name: "e2e-tap",
          include: ["tests/e2e-tap/**/*.e2e-tap.test.ts"],
          environment: "node",
          testTimeout: 600_000,
          hookTimeout: 120_000,
          teardownTimeout: 60_000,
          pool: "forks",
          singleFork: true,
          fileParallelism: false,
          globalSetup: ["tests/e2e-tap/globalSetup.ts"],
        },
      },
    ],
  },
});
