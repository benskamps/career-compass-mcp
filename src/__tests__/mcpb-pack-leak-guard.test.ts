import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
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
 * compiled test suite for exactly that reason — test artifacts npm had been
 * quietly blocking all along.
 *
 * DIVISION OF LABOR — this file tests the guard, never the shipped artifact.
 *
 * Every fixture below is built in a temp directory and torn down. Nothing here
 * reads `.mcpb-build/` or `*.mcpb` from the checkout, on purpose: both are
 * gitignored build output, so letting them decide the verdict makes suite
 * greenness depend on untracked local state. An earlier version of this file
 * did exactly that and it bit — a `.mcpb-build/` left behind by the old
 * hand-staged pack, two weeks older than the commit under test, turned
 * `npm run test:mcp` red on a checkout whose code was fine. The inverse was
 * worse: those cases early-returned when the paths were absent, so on CI, where
 * nothing is ever staged, they asserted nothing at all while looking like
 * coverage.
 *
 * Guarding the real staging tree and the real bundle is `npm run pack:mcpb`'s
 * job, and it already does it — two explicit `scripts/mcpb-guard.mjs`
 * invocations, one against staging before packing and one against the finished
 * `.mcpb`, either of which fails the pack. That is the right place for it: it
 * runs when an artifact actually exists and is about to ship, rather than
 * asking every `npm test` to have an opinion about build leftovers.
 *
 * So what this file owns is that the guard is not a no-op: planted artifacts
 * must turn it red, a clean tree must leave it green, and both of its input
 * modes — a directory tree and a real zip — must work.
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

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/**
 * Write a real zip (stored, no compression) from `entries`.
 *
 * The guard reads a bundle's entry names straight out of the zip central
 * directory rather than taking a dependency on a zip library, so that parser
 * needs its own coverage. Building the fixture here — instead of reaching for
 * whatever `.mcpb` happens to be lying in the checkout — keeps that coverage
 * unconditional: it runs on CI, where no bundle has ever been packed.
 */
function writeZip(file: string, entries: Record<string, string>): void {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(entries)) {
    const nameBuf = Buffer.from(name, "utf8");
    const data = Buffer.from(content, "utf8");
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 8); // method: stored
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); // compressed size
    local.writeUInt32LE(data.length, 22); // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // central directory header signature
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 10); // method: stored
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42); // offset of local header
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + data.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  eocd.writeUInt16LE(Object.keys(entries).length, 8); // entries on this disk
  eocd.writeUInt16LE(Object.keys(entries).length, 10); // entries total
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16); // central directory offset

  writeFileSync(file, Buffer.concat([...locals, centralBuf, eocd]));
}

const CLEAN_ZIP_ENTRIES = {
  "manifest.json": "{}",
  "build/src/index.js": "// server entry",
  "build/bin/cli.js": "// cli",
  "node_modules/yaml/index.js": "// dep",
};

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
  ])("fails when the staging tree contains %s", (_label, leaked) => {
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

  it("reads a real zip and passes one with no compiled test output", () => {
    const bundle = path.join(tmp, "clean.mcpb");
    writeZip(bundle, CLEAN_ZIP_ENTRIES);

    const { status, out } = runGuard(bundle);
    expect(status, `guard should pass a clean bundle:\n${out}`).toBe(0);
    expect(out).toContain("4 entries");
  });

  it("fails on a zip carrying a compiled test file (the artifact that ships)", () => {
    // The .mcpb is what gets uploaded, so the zip path is the one that matters
    // most. Planting into the archive proves the central-directory parser is
    // reading real entry names and not just trusting the directory walk.
    const bundle = path.join(tmp, "leaky.mcpb");
    writeZip(bundle, {
      ...CLEAN_ZIP_ENTRIES,
      "build/src/__tests__/server-e2e.test.js": "// leaked into the archive",
    });

    const { status, out } = runGuard(bundle);
    expect(status, `guard should have rejected the leaky bundle:\n${out}`).toBe(1);
    expect(out).toContain("build/src/__tests__/server-e2e.test.js");
  });

  it("exits 2 rather than 0 when the target does not exist", () => {
    // A guard that silently passes on a bad path is worse than no guard: the
    // pack script would read it as "clean" after a staging-dir rename.
    const { status } = runGuard(path.join(tmp, "does-not-exist"));
    expect(status).toBe(2);
  });
});
