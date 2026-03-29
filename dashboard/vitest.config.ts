import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "../src"),
      "@": path.resolve(import.meta.dirname),
    },
  },
  test: {
    include: ["**/*.test.ts"],
  },
});
