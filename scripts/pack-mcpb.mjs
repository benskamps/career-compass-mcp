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
  rmSync,
  statSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isCompiledTestArtifact } from "./mcpb-guard.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stagingDir = path.join(repoRoot, ".mcpb-build");
const guardScript = path.join(repoRoot, "scripts", "mcpb-guard.mjs");

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

  for (const { from, required, filtered } of BUNDLE_CONTENTS) {
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

function main() {
  const { version, name } = resolveVersion();
  const outputPath = path.join(repoRoot, `career-compass-${version}.mcpb`);

  console.log(`pack-mcpb: packing ${name}@${version}`);
  // Drop any previous bundle before doing anything else. If this run fails,
  // the only thing worse than having no bundle is having a stale one sitting
  // there looking freshly built — `pack:mcpb:guard` would happily pass it.
  rmSync(outputPath, { force: true });

  stage();
  installProductionDeps();
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
