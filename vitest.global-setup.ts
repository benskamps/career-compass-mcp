import { spawnSync } from "child_process";
import { existsSync, readdirSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Rebuild build/ when it is older than the sources.
 *
 * Several suites run the compiled server or CLI (cli-data-path, cli-version,
 * eval-suite-truth, no-startup-folder, the mcpb guard). After a `git pull`
 * without `npm run build:mcp`, they tested the previous release: on 2.15.0 that
 * read as three real failures (the ~ expansion "missing", a mock "stale") on a
 * machine whose source was fine. CI never saw it because it builds first.
 */

const root = path.dirname(fileURLToPath(import.meta.url));

function newest(dir: string, skip: (name: string) => boolean = () => false): number {
  let latest = 0;
  if (!existsSync(dir)) return latest;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skip(entry.name)) continue;
    const full = path.join(dir, entry.name);
    latest = Math.max(latest, entry.isDirectory() ? newest(full, skip) : statSync(full).mtimeMs);
  }
  return latest;
}

export default function setup(): void {
  const built = path.join(root, "build", "bin", "cli.js");
  const sources = Math.max(
    newest(path.join(root, "src"), (n) => n === "__tests__" || n.endsWith(".test.ts")),
    newest(path.join(root, "bin")),
    statSync(path.join(root, "package.json")).mtimeMs,
  );
  if (existsSync(built) && newest(path.join(root, "build")) >= sources) return;

  console.error(existsSync(built) ? "build/ is older than src/; rebuilding (tsc)…" : "No build/ yet; building (tsc)…");
  const tsc = path.join(root, "node_modules", "typescript", "bin", "tsc");
  const run = spawnSync(process.execPath, [tsc], { cwd: root, stdio: "inherit" });
  if (run.status !== 0) throw new Error("tsc failed; the suites that run build/ would test stale code. Fix the type errors first.");
}
