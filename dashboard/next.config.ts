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
      // Turbopack cannot auto-rewrite .js → .ts for explicit extensions, and
      // `src/` is compiled with module:Node16, so those extensions are mandatory
      // there — they are what the emitted MCP server actually imports at runtime.
      //
      // This list must cover EVERY relative .js specifier reachable from a
      // module the dashboard imports. It is enforced by
      // `src/__tests__/shared-import-aliases.test.ts`, because the failure mode
      // is a build that nobody runs: `next build` was already broken on main at
      // dc823a4 with `Can't resolve '../sample-data.js'`, and CI never built the
      // dashboard, so nothing said so.
      "../schemas/career-schema.js": "../src/schemas/career-schema.ts",
      "../sample-data.js": "../src/sample-data.ts",
      "./write-claim.js": "../src/storage/write-claim.ts",
      // Same module, different relative form — `sample-data.ts` sits one level
      // up from `storage/`, so it reaches the schema as "./schemas/…". Turbopack
      // keys on the literal specifier, so both spellings need an entry.
      "./schemas/career-schema.js": "../src/schemas/career-schema.ts",
      "./serialize.js": "../src/storage/serialize.ts",
    },
    resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".json"],
  },
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@shared": sharedSrc,
    };
    // `src/` is NodeNext TypeScript, so its internal imports carry the `.js`
    // extension the emitted JavaScript will use — `./write-claim.js`,
    // `../sample-data.js`. webpack resolves those literally, finds no such file
    // next to the `.ts`, and fails the build.
    //
    // This was not a latent risk: `next build` was already failing on `main` at
    // dc823a4 with `Can't resolve '../sample-data.js'`. Nothing caught it,
    // because CI never built the dashboard and `bin/cli.ts` silently falls back
    // to the lite dashboard when the standalone build is absent — which it
    // always was. A build nobody runs is a build that does not work.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
