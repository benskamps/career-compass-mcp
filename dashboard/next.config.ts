import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, ".."),
  serverExternalPackages: ["yaml"],
  turbopack: {
    resolveAlias: {
      "@shared": path.join(import.meta.dirname, "../src"),
    },
  },
};

export default nextConfig;
