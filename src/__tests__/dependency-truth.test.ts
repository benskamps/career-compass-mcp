import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { builtinModules } from "module";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Dependency-truth guard: what we *declare* must equal what we *ship*.
 *
 * Career Compass is two programs in one repo. The MCP server (`src/`, `bin/`)
 * is what npm publishes; the Next.js dashboard (`dashboard/`) is a separate
 * package with its own `package.json` and its own lockfile, built from source
 * and never included in the tarball.
 *
 * Because both live here, it is very easy for a dashboard-only package to
 * drift into the *root* `dependencies` block. That mistake is silent — nothing
 * fails, no test goes red, `tsc` is happy — and the only symptom is that every
 * stranger who runs `npm i career-compass-mcp` downloads it. That is exactly
 * what happened before this test existed: `next` + `react` + `react-dom` sat in
 * the root runtime dependencies while *zero* shipped code imported them,
 * turning a 24 MB install into a 353 MB one (166 MB of it Next.js alone) and a
 * 5-second install into a 38-second one.
 *
 * This test derives both sides from reality rather than from a hand-kept list:
 *
 *   - "what we ship" = every bare import found in the compiled output under
 *     `build/`, which is precisely the code the `files` allowlist publishes.
 *   - "what we declare" = the `dependencies` block of the root package.json.
 *
 * and locks them together in both directions:
 *
 *   1. **No undeclared imports.** Anything `build/` imports must be declared,
 *      or the published package crashes on a clean install (`ERR_MODULE_NOT_FOUND`)
 *      even though it worked locally off a hoisted dev tree.
 *   2. **No unused declarations.** Anything declared must actually be imported,
 *      or strangers pay download + disk + install time for nothing.
 *
 * Rule of thumb when this test goes red: a package the *dashboard* needs belongs
 * in `dashboard/package.json`. A package only the *build or tests* need belongs
 * in root `devDependencies`. Root `dependencies` is reserved for what the
 * published server imports at runtime — nothing else.
 */

const repoRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../..",
);
const buildDir = path.join(repoRoot, "build");

/** Node builtins, with and without the `node:` prefix. */
const BUILTINS = new Set<string>([
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".js")) out.push(full);
  }
  return out;
}

/**
 * `@scope/pkg/deep/path.js` -> `@scope/pkg`; `pkg/deep.js` -> `pkg`.
 * Subpath imports (the MCP SDK is used exclusively this way) must resolve back
 * to the installable package name, not the subpath.
 */
function packageNameOf(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

/**
 * Every bare (non-relative, non-builtin) module the compiled output depends on.
 * Covers static `import`/`export ... from`, dynamic `import()`, and `require()`
 * so a future CommonJS interop shim can't sneak past.
 */
function shippedImports(): Set<string> {
  const found = new Set<string>();
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const file of walk(buildDir)) {
    // Compiled test output is excluded from the tarball via the `files`
    // negations, so its imports are not part of the shipped surface.
    if (/\.test\.js$/.test(file) || file.includes("__tests__")) continue;
    const src = readFileSync(file, "utf-8");
    for (const re of patterns) {
      for (const m of src.matchAll(re)) {
        const spec = m[1];
        if (spec.startsWith(".") || spec.startsWith("/")) continue;
        // A specifier holding a template interpolation is not an import: it is
        // prose inside a template literal that happens to contain `from "…"`.
        // The CLI's `(resolved from "${configured}" against …)` message is one,
        // and this read it as a package named "${configured}". A real static
        // specifier can never contain `${`, so nothing is hidden — the
        // unused-dependency test below still proves the scanner sees zod, yaml
        // and the SDK.
        if (spec.includes("${")) continue;
        if (BUILTINS.has(spec)) continue;
        found.add(packageNameOf(spec));
      }
    }
  }
  return found;
}

const pkg = JSON.parse(
  readFileSync(path.join(repoRoot, "package.json"), "utf-8"),
) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

describe("dependency truth: declared runtime deps == shipped imports", () => {
  it("has a compiled build/ to inspect (run `npm run build:mcp` first)", () => {
    expect(
      existsSync(buildDir),
      "build/ is missing — this test reads the compiled output, so CI must run build:mcp before test:mcp",
    ).toBe(true);
  });

  it("declares every package the shipped code imports", () => {
    const declared = new Set(Object.keys(pkg.dependencies));
    const undeclared = [...shippedImports()].filter((p) => !declared.has(p));
    expect(
      undeclared,
      `build/ imports ${undeclared.join(", ")} but package.json does not declare it in "dependencies". ` +
        `A clean install would fail with ERR_MODULE_NOT_FOUND even though it works locally off a hoisted tree.`,
    ).toEqual([]);
  });

  it("ships no runtime dependency the code never imports", () => {
    const imported = shippedImports();
    const unused = Object.keys(pkg.dependencies).filter((d) => !imported.has(d));
    expect(
      unused,
      `package.json declares ${unused.join(", ")} in "dependencies" but no shipped file imports it. ` +
        `Every stranger downloads it for nothing. Dashboard-only packages belong in dashboard/package.json; ` +
        `build/test-only packages belong in root devDependencies.`,
    ).toEqual([]);
  });

  it("keeps dashboard-only packages out of the root manifest entirely", () => {
    // The dashboard declares these itself. Root copies are pure install weight:
    // the root tsconfig only includes src/** and bin/**, with types: ["node"].
    const dashboardOnly = [
      "next",
      "react",
      "react-dom",
      "@types/react",
      "@types/react-dom",
      "tailwindcss",
      "@tailwindcss/postcss",
    ];
    const rootManifest = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };
    const leaked = dashboardOnly.filter((d) => d in rootManifest);
    expect(
      leaked,
      `${leaked.join(", ")} leaked into the root package.json. These belong to dashboard/package.json, ` +
        `which has its own lockfile and node_modules.`,
    ).toEqual([]);
  });
});
