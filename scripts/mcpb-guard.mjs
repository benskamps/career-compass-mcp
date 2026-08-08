#!/usr/bin/env node
/**
 * Pack-time leak guard for the MCPB bundle.
 *
 * The npm tarball is protected by the `files` allowlist in package.json (see
 * src/__tests__/npm-pack-leak-guard.test.ts). The MCPB bundle is NOT: it is
 * assembled from a staging directory that copies `build/` as a tree, so the
 * allowlist never applies. `career-compass-2.2.0.mcpb` shipped with the whole
 * compiled test suite inside it for exactly that reason.
 *
 * This guard is the missing gate. It takes either a staging directory or a
 * packed `.mcpb` file, enumerates every entry, and exits non-zero if any
 * compiled test artifact is present. `scripts/pack-mcpb.mjs` runs it twice —
 * once against the staging tree before packing, once against the finished
 * bundle — so a regression fails the pack instead of shipping.
 *
 * Usage:
 *   node scripts/mcpb-guard.mjs <path-to-.mcpb-or-staging-dir>
 *   node scripts/mcpb-guard.mjs            # auto-discovers, bundle first
 *
 * Exit codes: 0 = clean, 1 = test artifacts found, 2 = could not inspect.
 * Note that "nothing to inspect" is exit 2, never 0 — a guard that passes when
 * it found no target is a guard that stops guarding the day a path changes.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Paths under `node_modules/` are third-party and out of our control — plenty
 * of legitimate packages ship their own tests. The guard is about OUR compiled
 * output leaking into the bundle, so node_modules is excluded from the verdict.
 */
const THIRD_PARTY = /(^|\/)node_modules\//;

/**
 * A compiled test artifact is anything tsc emitted from a `*.test.ts` source,
 * plus anything living in a `__tests__/` directory (fixtures included).
 * Covers .js/.mjs/.cjs, the .d.ts declarations, and both .map flavours.
 */
const TEST_ARTIFACT_PATTERNS = [
  /(^|\/)__tests__\//,
  /(^|\/)__fixtures__\//,
  /\.(test|spec)\.[cm]?[jt]s$/,
  /\.(test|spec)\.[cm]?[jt]s\.map$/,
  /\.(test|spec)\.d\.[cm]?ts$/,
  /\.(test|spec)\.d\.[cm]?ts\.map$/,
];

/** True if `relPath` (forward-slashed, bundle-relative) is a test artifact of ours. */
export function isCompiledTestArtifact(relPath) {
  const p = relPath.replace(/\\/g, "/");
  if (THIRD_PARTY.test(p)) return false;
  return TEST_ARTIFACT_PATTERNS.some((re) => re.test(p));
}

/** Recursively list every file in `dir`, as forward-slashed relative paths. */
function listDirEntries(dir) {
  const out = [];
  const walk = (abs, rel) => {
    for (const name of readdirSync(abs)) {
      const childAbs = path.join(abs, name);
      const childRel = rel ? `${rel}/${name}` : name;
      if (statSync(childAbs).isDirectory()) walk(childAbs, childRel);
      else out.push(childRel);
    }
  };
  walk(dir, "");
  return out;
}

/**
 * List every entry name in a zip by reading its central directory.
 *
 * An `.mcpb` is a zip. Rather than pull in a zip library for a build-time
 * check, we parse the central directory ourselves — it is a fixed-layout
 * record and we only need the names, never the compressed payloads.
 */
export function listZipEntries(buf) {
  const EOCD_SIG = 0x06054b50;
  const EOCD64_LOCATOR_SIG = 0x07064b50;
  const EOCD64_SIG = 0x06064b50;
  const CENTRAL_SIG = 0x02014b50;

  // The end-of-central-directory record is last, but a trailing comment (max
  // 64KB) can push it back from the very end — scan backwards for its signature.
  let eocd = -1;
  const scanFloor = Math.max(0, buf.length - 0xffff - 22);
  for (let i = buf.length - 22; i >= scanFloor; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip archive (no end-of-central-directory record)");

  let entryCount = buf.readUInt16LE(eocd + 10);
  let centralOffset = buf.readUInt32LE(eocd + 16);

  // ZIP64: the 32-bit fields saturate and the real values live in the ZIP64
  // EOCD record, found via a locator that sits immediately before the EOCD.
  if (entryCount === 0xffff || centralOffset === 0xffffffff) {
    const locator = eocd - 20;
    if (locator < 0 || buf.readUInt32LE(locator) !== EOCD64_LOCATOR_SIG) {
      throw new Error("zip claims ZIP64 but has no ZIP64 locator");
    }
    const eocd64 = Number(buf.readBigUInt64LE(locator + 8));
    if (buf.readUInt32LE(eocd64) !== EOCD64_SIG) {
      throw new Error("ZIP64 locator points at a non-ZIP64 record");
    }
    entryCount = Number(buf.readBigUInt64LE(eocd64 + 32));
    centralOffset = Number(buf.readBigUInt64LE(eocd64 + 48));
  }

  const names = [];
  let p = centralOffset;
  for (let i = 0; i < entryCount; i++) {
    if (buf.readUInt32LE(p) !== CENTRAL_SIG) {
      throw new Error(`corrupt central directory at entry ${i}`);
    }
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    names.push(buf.toString("utf8", p + 46, p + 46 + nameLen).replace(/\\/g, "/"));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

/** Enumerate a target that may be either a staging directory or a packed .mcpb. */
export function listBundleEntries(target) {
  if (!existsSync(target)) throw new Error(`no such path: ${target}`);
  if (statSync(target).isDirectory()) return listDirEntries(target);
  return listZipEntries(readFileSync(target));
}

/** @returns {{ entries: string[], offenders: string[] }} */
export function inspect(target) {
  const entries = listBundleEntries(target);
  return { entries, offenders: entries.filter(isCompiledTestArtifact) };
}

/**
 * With no explicit target, prefer the packed bundle over the staging tree —
 * the bundle is the artifact that actually gets uploaded, and it is the one
 * whose version is not knowable from a static npm script string.
 */
function discoverTarget() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const bundles = readdirSync(repoRoot)
    .filter((f) => f.endsWith(".mcpb"))
    .sort();
  if (bundles.length > 0) return path.join(repoRoot, bundles[bundles.length - 1]);
  const staging = path.join(repoRoot, ".mcpb-build");
  if (existsSync(staging)) return staging;
  return null;
}

function main() {
  const target = process.argv[2] ?? discoverTarget();
  if (!target) {
    console.error(
      "mcpb-guard: nothing to inspect — no *.mcpb and no .mcpb-build/ at the " +
        "repo root. Run `npm run pack:mcpb` first, or pass an explicit path.",
    );
    process.exit(2);
  }

  let result;
  try {
    result = inspect(target);
  } catch (err) {
    console.error(`mcpb-guard: could not inspect ${target}: ${err.message}`);
    process.exit(2);
  }

  const { entries, offenders } = result;
  const ours = entries.filter((e) => !THIRD_PARTY.test(e));
  console.log(
    `mcpb-guard: ${target} — ${entries.length} entries ` +
      `(${ours.length} first-party, ${entries.length - ours.length} in node_modules)`,
  );

  if (offenders.length > 0) {
    console.error(
      `\nmcpb-guard: FAIL — ${offenders.length} compiled test artifact(s) in the bundle:`,
    );
    for (const o of offenders.slice(0, 40)) console.error(`  ${o}`);
    if (offenders.length > 40) console.error(`  ... and ${offenders.length - 40} more`);
    console.error(
      "\nThe MCPB staging step copies build/ as a tree, so the package.json " +
        "`files` allowlist does not apply. Fix the staging filter in " +
        "scripts/pack-mcpb.mjs — do not loosen this guard.",
    );
    process.exit(1);
  }

  console.log("mcpb-guard: PASS — 0 compiled test artifacts");
  process.exit(0);
}

// Only run the CLI when invoked directly, so other modules can import the helpers.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
