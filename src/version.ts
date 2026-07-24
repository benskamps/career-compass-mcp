import { readFileSync, existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

/**
 * Single source of truth for the package version.
 *
 * There used to be three: `package.json`, a string literal in `src/server.ts`
 * (reported to every MCP client in the `initialize` handshake), and an
 * assertion literal in `src/__tests__/server-e2e.test.ts`. Nothing tied them
 * together, so bumping the package silently left the server introducing itself
 * with the previous version — a lie a client has no way to detect — while the
 * e2e test went red for a reason unrelated to any real defect and pushed you
 * toward "just update the literal."
 *
 * Both the CLI and the MCP server now resolve the version from package.json at
 * runtime, and version-truth.test.ts locks the handshake to it.
 *
 * Returns "unknown" only when package.json is genuinely missing or unreadable,
 * which in a published install would mean a corrupt tarball.
 */
export function readPkgVersion(fromDir: string): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(fromDir, "..", "..", "package.json"), "utf-8"),
    ) as { version?: unknown };
    return typeof pkg.version === "string" ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Find the package.json that owns a given directory by walking up.
 *
 * A fixed `../../package.json` hop is not safe here: this module is imported
 * both from `build/src/version.js` (two levels below the package root) and,
 * under vitest, straight from `src/version.ts` (one level below). A hardcoded
 * hop silently resolves to the *parent* directory's package.json in one of
 * those layouts — which is how this returned "unknown" the first time.
 * Walking up is correct in both, and in a published install under node_modules.
 */
function findPkgVersion(startDir: string): string {
  let dir = resolve(startDir);
  for (;;) {
    const candidate = join(dir, "package.json");
    if (existsSync(candidate)) {
      try {
        const pkg = JSON.parse(readFileSync(candidate, "utf-8")) as {
          name?: unknown;
          version?: unknown;
        };
        // Guard against stopping at a nested package.json that isn't ours.
        if (pkg.name === "career-compass-mcp" && typeof pkg.version === "string") {
          return pkg.version;
        }
      } catch {
        // Unreadable/!JSON — keep walking rather than give up at this level.
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return "unknown";
    dir = parent;
  }
}

/**
 * The version of this install. Resolved once at import time.
 */
export const PKG_VERSION = findPkgVersion(
  fileURLToPath(new URL(".", import.meta.url)),
);
