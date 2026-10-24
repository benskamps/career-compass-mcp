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
    include: ["**/*.test.ts", "**/*.test.tsx"],
    // `next build` copies lib/ into .next/standalone/, tests and all, so an
    // unfiltered sweep collected every lib test twice — once from source and
    // once from build output. It went unnoticed because `next build` had never
    // succeeded in this repo, so `.next/standalone/` never existed. Running a
    // stale copy of a test is worse than not running it: it reports green for
    // code that is no longer the code.
    exclude: ["**/node_modules/**", "**/.next/**", "**/storybook-static/**"],
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
