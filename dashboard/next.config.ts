import type { NextConfig } from "next";
import path from "path";

const sharedSrc = path.join(import.meta.dirname, "../src");

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, ".."),
  serverExternalPackages: ["yaml"],
  turbopack: {
    resolveAlias: {
      // Map @shared/* imports (no .js extension) to the shared src directory.
      // Trailing-slash form enables sub-path matching in Turbopack.
      "@shared/": "../src/",
      // Map internal relative .js imports inside src/ to their .ts counterparts.
      // Turbopack cannot auto-rewrite .js → .ts for explicit extensions.
      "../schemas/career-schema.js": "../src/schemas/career-schema.ts",
    },
    resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".json"],
  },
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@shared": sharedSrc,
    };
    return config;
  },
};

export default nextConfig;
