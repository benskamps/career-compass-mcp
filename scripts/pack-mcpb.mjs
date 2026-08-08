#!/usr/bin/env node
/**
 * Build the Claude Desktop extension (`.mcpb`) from the current working tree.
 *
 * The bundle is a zip of a staging directory, packed by `@anthropic-ai/mcpb`.
 * Staging is explicit: every path that ends up in the bundle is named in
 * BUNDLE_CONTENTS below, and `build/` is copied through a filter that drops
 * compiled test output. That filter is the fix for the 2.2.0 bundle, which
 * copied `build/` wholesale and shipped the entire compiled test suite.
 *
 * Nothing here derives from the package.json `files` allowlist — that governs
 * the npm tarball only and has never applied to this path. The two guards are
 * deliberately separate:
 *   npm tarball  -> `files` allowlist, asserted by npm-pack-leak-guard.test.ts
 *   mcpb bundle  -> this staging filter, asserted by scripts/mcpb-guard.mjs
 *
 * Usage:
 *   node scripts/pack-mcpb.mjs            # build/ must already be compiled
 *   npm run pack:mcpb                     # compiles first, then packs
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isCompiledTestArtifact } from "./mcpb-guard.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stagingDir = path.join(repoRoot, ".mcpb-build");
const guardScript = path.join(repoRoot, "scripts", "mcpb-guard.mjs");
const manifestToolsScript = path.join(repoRoot, "scripts", "gen-manifest-tools.mjs");
const smokeScript = path.join(repoRoot, "scripts", "mcpb-smoke.mjs");

/**
 * Everything the bundle ships, and nothing else.
 *
 * `package.json` + `package-lock.json` are here because the staging directory
 * gets its own production-only `npm ci` (see installProductionDeps) — the
 * bundle has to carry its runtime dependencies, and it should carry only those.
 */
const BUNDLE_CONTENTS = [
  { from: "manifest.json", required: true },
  { from: "icon.png", required: true },
  { from: "package.json", required: true },
  { from: "package-lock.json", required: true },
  { from: "README.md", required: true },
  { from: "LICENSE", required: true },
  { from: "PRIVACY.md", required: false },
  { from: "build", required: true, filtered: true },
  { from: "data/example", required: true },
];

/**
 * The images README.md points at, derived from the README itself.
 *
 * The bundled README embeds four dashboard screenshots and the bundle carried
 * none of them, so the first page a reviewer opens showed four broken images.
 * Read out of the file rather than listed here: a hardcoded list is the same
 * hand-maintained mirror that let the manifest's tool descriptions drift, and
 * these are ~290KB against a 3.5MB bundle — cheap enough that the answer is
 * "ship what the README references", whatever that turns out to be.
 *
 * Marked required, so a README pointing at a file that does not exist fails the
 * pack rather than shipping another broken image.
 */
function readmeImages() {
  const readme = readFileSync(path.join(repoRoot, "README.md"), "utf-8");
  const referenced = [...readme.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]);
  const local = [...new Set(referenced.filter((r) => !/^[a-z]+:/i.test(r)))];
  return local.map((from) => ({ from, required: true }));
}

function fail(message) {
  console.error(`\npack-mcpb: ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
    ...options,
  });
}

/**
 * The bundle version is whatever package.json says; manifest.json has to agree
 * or Claude Desktop will advertise a version the server does not report. Both
 * are read at pack time — no version literal lives in this script.
 */
function resolveVersion() {
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf-8"));
  const manifest = JSON.parse(readFileSync(path.join(repoRoot, "manifest.json"), "utf-8"));

  if (pkg.version !== manifest.version) {
    fail(
      `version mismatch: package.json is ${pkg.version}, manifest.json is ` +
        `${manifest.version}. They must agree before packing.`,
    );
  }

  const entry = manifest.server?.entry_point;
  if (!entry) fail("manifest.json has no server.entry_point");
  if (!existsSync(path.join(repoRoot, entry))) {
    fail(`manifest server.entry_point does not exist: ${entry} (run \`npm run build:mcp\`)`);
  }

  return { version: pkg.version, name: pkg.name, entry };
}

function stage() {
  // Staging is rebuilt from nothing on every pack, never updated in place.
  // That is what makes a stale tree impossible by construction rather than by
  // vigilance: whatever a previous pack — or the old hand-staging — left behind
  // is gone before the first file is copied, so the bundle can only contain
  // what BUNDLE_CONTENTS names from the current working tree.
  rmSync(stagingDir, { recursive: true, force: true });
  mkdirSync(stagingDir, { recursive: true });

  for (const { from, required, filtered } of [...BUNDLE_CONTENTS, ...readmeImages()]) {
    const src = path.join(repoRoot, from);
    if (!existsSync(src)) {
      if (required) fail(`missing required bundle input: ${from}`);
      continue;
    }
    const dest = path.join(stagingDir, from);
    mkdirSync(path.dirname(dest), { recursive: true });

    cpSync(src, dest, {
      recursive: true,
      // The whole point: compiled test output never reaches staging. cpSync's
      // filter runs per path, so returning false on a directory prunes the
      // subtree — which is how `__tests__/` and its fixtures get dropped.
      filter: filtered
        ? (srcPath) => {
            const rel = path.relative(repoRoot, srcPath).replace(/\\/g, "/");
            return !isCompiledTestArtifact(rel);
          }
        : undefined,
    });
  }
}

/** Every file under `dir`, recursively, as absolute paths. */
function filesUnder(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(full);
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

const SOURCE_MAP_REF = /^\/\/# sourceMappingURL=/;

/**
 * Remove sourcemap comments from the staged build.
 *
 * tsc emits `//# sourceMappingURL=x.js.map` on every file, and the mcpb packer
 * does not carry `.map` files into the bundle — so all 21 first-party modules
 * shipped pointing at a file that is not there. Harmless at runtime, and
 * exactly the kind of thing a reviewer opens the bundle and sees.
 *
 * Stripped here rather than by turning `sourceMap` off in tsconfig, because the
 * maps are worth having locally and the npm tarball ships them alongside the
 * code, where the reference resolves.
 */
function stripSourceMapRefs() {
  let stripped = 0;
  for (const file of filesUnder(path.join(stagingDir, "build"))) {
    if (!/\.(js|cjs|mjs|ts)$/.test(file)) continue;
    const lines = readFileSync(file, "utf-8").split("\n");
    const kept = lines.filter((l) => !SOURCE_MAP_REF.test(l.trim()));
    if (kept.length === lines.length) continue;
    writeFileSync(file, kept.join("\n"), "utf-8");
    stripped++;
  }

  // Assert rather than trust: if the comment format ever changes, this should
  // fail the pack instead of quietly going back to shipping dangling refs.
  const remaining = filesUnder(path.join(stagingDir, "build")).filter(
    (f) => /\.(js|cjs|mjs|ts)$/.test(f) &&
      readFileSync(f, "utf-8").split("\n").some((l) => SOURCE_MAP_REF.test(l.trim())),
  );
  if (remaining.length > 0) {
    fail(`sourcemap references survived the strip in ${remaining.length} file(s)`);
  }
  console.log(`pack-mcpb: stripped dangling sourcemap references from ${stripped} file(s)`);
}

/**
 * Drop upstream test suites from the bundled dependencies.
 *
 * `npm ci --omit=dev` installs each dependency as published, and several
 * publish their own tests: zod and qs alone account for ~163KB across 229
 * files that every user downloads and no code path reaches. Only directories
 * named for tests are removed — never individual files, whose names are a much
 * worse signal (`test.js` is a plausible module) — and mcpb-smoke then loads
 * the server against the pruned tree, so a package that genuinely needed one
 * fails the pack rather than the install.
 */
function pruneDependencyTests() {
  const nodeModules = path.join(stagingDir, "node_modules");
  if (!existsSync(nodeModules)) return;

  const TEST_DIRS = new Set(["test", "tests", "__tests__", "spec", "__mocks__"]);
  let removed = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (TEST_DIRS.has(entry.name)) {
        rmSync(full, { recursive: true, force: true });
        removed++;
        continue;
      }
      walk(full);
    }
  };
  walk(nodeModules);
  console.log(`pack-mcpb: pruned ${removed} upstream test director${removed === 1 ? "y" : "ies"}`);
}

/** Prove the staged tree can actually load its own server. */
function smokeTest() {
  console.log("\npack-mcpb: loading the staged server against the bundle's own dependencies...");
  try {
    process.stdout.write(run("node", [smokeScript, stagingDir]));
  } catch (err) {
    process.stdout.write(err.stdout ?? "");
    process.stderr.write(err.stderr ?? "");
    fail("the staged server would not load — refusing to ship this bundle");
  }
}

/**
 * Install runtime dependencies into the staging tree.
 *
 * The 2.2.0 bundle copied the repo's `node_modules/` as-is, so it shipped
 * vitest, playwright, the TypeScript compiler and the dashboard's React tree.
 * A production-only `npm ci` in staging gives the bundle the three packages the
 * server actually imports. `--ignore-scripts` is safe here: all three runtime
 * deps are pure JavaScript with no install hooks.
 */
function installProductionDeps() {
  console.log("pack-mcpb: installing production dependencies into staging...");
  run("npm", ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: stagingDir,
    stdio: ["ignore", "inherit", "inherit"],
  });
}

function guard(target, label) {
  console.log(`\npack-mcpb: guarding ${label}...`);
  try {
    process.stdout.write(run("node", [guardScript, target]));
  } catch (err) {
    process.stdout.write(err.stdout ?? "");
    process.stderr.write(err.stderr ?? "");
    fail(`leak guard failed on ${label} — refusing to ship this bundle`);
  }
}

/**
 * Bring manifest.json's tool descriptions back in line with the server.
 *
 * Those descriptions are the only copy a stranger reads before installing, and
 * being hand-maintained they drifted: five of seventeen were a generation
 * behind by 2.3.0. Deriving them here means the bundle cannot ship a
 * description the code has moved past. The rewrite lands in the working tree,
 * not just in staging, so what ships and what is committed are the same file —
 * manifest-truth.test.ts then fails on any difference, which is what makes this
 * a check rather than a silent repair at pack time.
 */
function generateManifestTools() {
  console.log("\npack-mcpb: syncing manifest tool descriptions with the server...");
  process.stdout.write(run("node", [manifestToolsScript]));
}

function main() {
  generateManifestTools();
  const { version, name } = resolveVersion();
  const outputPath = path.join(repoRoot, `career-compass-${version}.mcpb`);

  console.log(`pack-mcpb: packing ${name}@${version}`);
  // Drop any previous bundle before doing anything else. If this run fails,
  // the only thing worse than having no bundle is having a stale one sitting
  // there looking freshly built — `pack:mcpb:guard` would happily pass it.
  rmSync(outputPath, { force: true });

  stage();
  stripSourceMapRefs();
  installProductionDeps();
  pruneDependencyTests();
  smokeTest();
  guard(stagingDir, "staging directory");

  console.log("\npack-mcpb: packing bundle...");
  run("npx", ["--yes", "@anthropic-ai/mcpb", "pack", stagingDir, outputPath], {
    stdio: ["ignore", "inherit", "inherit"],
  });

  if (!existsSync(outputPath)) fail("mcpb pack produced no output file");

  // Guard the finished artifact too, not just the tree it was built from —
  // the assertion that matters is about the file that gets uploaded.
  guard(outputPath, "packed bundle");

  const sizeMb = (statSync(outputPath).size / 1024 / 1024).toFixed(2);
  console.log(`\npack-mcpb: OK — ${path.basename(outputPath)} (${sizeMb} MB)`);
}

main();
