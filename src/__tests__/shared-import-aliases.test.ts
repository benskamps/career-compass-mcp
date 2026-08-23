import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Gate 1's other negative control: the dashboard can still resolve `src/`.
 *
 * `src/` compiles with `module: "Node16"`, so its internal imports must carry
 * the `.js` extension the emitted MCP server actually loads at runtime —
 * `../sample-data.js`, `./write-claim.js`. Turbopack resolves those literally,
 * finds no such file beside the `.ts`, and fails the build. `next.config.ts`
 * therefore keeps one `resolveAlias` entry per specifier.
 *
 * That list is exactly the kind of thing that rots: adding one import to a
 * shared module breaks a build in a different directory. It rotted already —
 * `next build` was failing on `main` at dc823a4 with
 * `Can't resolve '../sample-data.js'`, and nothing said so, because CI never
 * built the dashboard and `bin/cli.ts` silently falls back to the lite
 * dashboard whenever the standalone build is missing. A build nobody runs is a
 * build that does not work.
 *
 * CI now builds the dashboard, which is the real fix. This test is the fast one:
 * it fails in four seconds with the exact line to add, instead of after a
 * multi-minute build with a stack trace.
 */

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

/** Relative specifiers ending in .js, from real import/export statements. */
function relativeJsSpecifiers(file: string): string[] {
  const code = readFileSync(file, "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  return [...code.matchAll(/\bfrom\s+["'](\.[^"']*\.js)["']/g)].map((m) => m[1]);
}

/** Walk the shared-module graph the dashboard actually reaches. */
function reachableFromDashboard(): { files: Set<string>; specifiers: Set<string> } {
  const files = new Set<string>();
  const specifiers = new Set<string>();

  // Entry points: every `@shared/...` import anywhere under dashboard/.
  const entries = new Set<string>();
  const walkDash = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".next") continue;
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) {
        walkDash(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(name)) continue;
      const code = readFileSync(full, "utf-8");
      for (const m of code.matchAll(/from\s+["']@shared\/([^"']+)["']/g)) {
        entries.add(path.join(repoRoot, "src", `${m[1]}.ts`));
      }
    }
  };
  walkDash(path.join(repoRoot, "dashboard"));

  const queue = [...entries];
  while (queue.length) {
    const file = queue.pop()!;
    if (files.has(file) || !existsSync(file)) continue;
    files.add(file);
    for (const spec of relativeJsSpecifiers(file)) {
      specifiers.add(spec);
      const resolved = path.resolve(path.dirname(file), spec.replace(/\.js$/, ".ts"));
      if (existsSync(resolved)) queue.push(resolved);
    }
  }
  return { files, specifiers };
}

describe("the dashboard can resolve every shared module it imports", () => {
  const config = readFileSync(path.join(repoRoot, "dashboard/next.config.ts"), "utf-8");
  const { files, specifiers } = reachableFromDashboard();

  it("finds the shared modules the dashboard reaches", () => {
    expect(files.size, "no @shared imports found — the sweep is broken, not clean").toBeGreaterThan(2);
  });

  it("every relative .js specifier in that graph has a Turbopack alias", () => {
    const missing = [...specifiers].filter((s) => !config.includes(`"${s}"`));
    expect(
      missing,
      `next.config.ts is missing a turbopack.resolveAlias entry for:\n` +
        missing.map((s) => `  "${s}": "../src/<path>.ts",`).join("\n") +
        `\nWithout it, \`next build\` fails with "Can't resolve ${missing[0]}".`,
    ).toEqual([]);
  });

  it("the @shared prefix alias is present", () => {
    expect(config).toContain('"@shared/": "../src/"');
  });
});
