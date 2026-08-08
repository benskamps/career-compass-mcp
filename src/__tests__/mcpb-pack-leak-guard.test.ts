import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, existsSync } from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Leak guard for the MCPB bundle (Claude Desktop extension).
 *
 * The sibling guard (npm-pack-leak-guard.test.ts) protects the npm tarball,
 * which is governed by the `files` allowlist in package.json. The MCPB bundle
 * is a different shipping path with no such protection: it is a zip of a
 * staging directory, and that staging step copies `build/` as a tree, so the
 * allowlist never gets a vote. `career-compass-2.2.0.mcpb` shipped the entire
 * compiled test suite for exactly that reason — 76 test artifacts that npm had
 * been quietly blocking all along.
 *
 * The fix is a staging filter in scripts/pack-mcpb.mjs plus an assertion in
 * scripts/mcpb-guard.mjs that the pack script runs against both the staging
 * tree and the finished bundle. This test is the assertion's own test: it
 * proves the guard goes red on a planted test file (negative control) and
 * green without one, so a future refactor cannot quietly defang it.
 *
 * It also inspects any real staging dir / packed bundle sitting in the repo,
 * which is where the zip-parsing path gets exercised.
 */

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const guardScript = path.join(repoRoot, "scripts", "mcpb-guard.mjs");

function runGuard(target: string) {
  const r = spawnSync(process.execPath, [guardScript, target], { encoding: "utf-8" });
  return { status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

/** Minimal stand-in for a staged bundle: the files a real one would carry. */
function writeCleanStaging(root: string) {
  mkdirSync(path.join(root, "build", "src", "tools"), { recursive: true });
  mkdirSync(path.join(root, "build", "bin"), { recursive: true });
  writeFileSync(path.join(root, "manifest.json"), "{}");
  writeFileSync(path.join(root, "build", "src", "index.js"), "// server entry");
  writeFileSync(path.join(root, "build", "src", "index.d.ts"), "export {};");
  writeFileSync(path.join(root, "build", "src", "tools", "pipeline.js"), "// tool");
  writeFileSync(path.join(root, "build", "bin", "cli.js"), "// cli");
}

describe("mcpb bundle leak guard", () => {
  let tmp: string;

  beforeAll(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), "mcpb-guard-"));
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("passes a staging tree with no compiled test output (positive control)", () => {
    const root = path.join(tmp, "clean");
    mkdirSync(root, { recursive: true });
    writeCleanStaging(root);

    const { status, out } = runGuard(root);
    expect(status, `guard should pass a clean tree:\n${out}`).toBe(0);
    expect(out).toContain("PASS");
  });

  // The negative control. Each of these is a shape tsc actually emits from a
  // `*.test.ts` source, and every one of them was present in the 2.2.0 bundle.
  it.each([
    ["a __tests__ directory", "build/src/__tests__/server-e2e.test.js"],
    ["a test fixture beside its spec", "build/src/__tests__/fixtures/sample.yaml"],
    ["a compiled test outside __tests__", "build/src/storage/paths.test.js"],
    ["a test declaration file", "build/src/storage/paths.test.d.ts"],
    ["a test source map", "build/src/storage/paths.test.js.map"],
  ])("fails when the bundle contains %s", (_label, leaked) => {
    const root = path.join(tmp, `leak-${leaked.replace(/[^a-z0-9]/gi, "-")}`);
    mkdirSync(root, { recursive: true });
    writeCleanStaging(root);

    const abs = path.join(root, leaked);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, "// leaked test artifact");

    const { status, out } = runGuard(root);
    expect(status, `guard should have rejected ${leaked}:\n${out}`).toBe(1);
    expect(out).toContain(leaked);
  });

  it("ignores test files inside node_modules (third-party, not ours to police)", () => {
    const root = path.join(tmp, "third-party");
    mkdirSync(root, { recursive: true });
    writeCleanStaging(root);

    const dep = path.join(root, "node_modules", "yaml", "__tests__");
    mkdirSync(dep, { recursive: true });
    writeFileSync(path.join(dep, "parse.test.js"), "// upstream's own test");

    const { status, out } = runGuard(root);
    expect(status, `node_modules should not trip the guard:\n${out}`).toBe(0);
  });

  it("exits 2 rather than 0 when the target does not exist", () => {
    // A guard that silently passes on a bad path is worse than no guard: the
    // pack script would read it as "clean" after a staging-dir rename.
    const { status } = runGuard(path.join(tmp, "does-not-exist"));
    expect(status).toBe(2);
  });

  it("the staging dir in this repo, if present, is clean", () => {
    const staging = path.join(repoRoot, ".mcpb-build");
    if (!existsSync(staging)) return; // nothing staged locally — nothing to assert
    const { status, out } = runGuard(staging);
    expect(status, out).toBe(0);
  });

  it("any packed bundle in this repo is clean", () => {
    const bundles = readdirSync(repoRoot).filter((f) => f.endsWith(".mcpb"));
    if (bundles.length === 0) return; // no bundle built locally — nothing to assert
    for (const bundle of bundles) {
      const { status, out } = runGuard(path.join(repoRoot, bundle));
      expect(status, `${bundle} is not clean:\n${out}`).toBe(0);
    }
  });
});
