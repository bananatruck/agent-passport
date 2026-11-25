import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: ".vite",
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 15000,
    maxWorkers: 1,
    fsModuleCache: false,
  },
});
