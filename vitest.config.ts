import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Rebuilds build/ when it is older than the sources; see the file.
    globalSetup: ["./vitest.global-setup.ts"],
  },
});
