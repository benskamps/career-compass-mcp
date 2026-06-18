import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Data-exposure guard for `npm publish` (BURNDOWN/SAFETY lane).
 *
 * Career Compass is local-first: real career history lives under
 * `CAREER_DATA_PATH` (default `~/.career-compass`) and, when kept in-repo,
 * under the git-ignored `data/career/` + `data/pipeline/` directories. The
 * only career data that is *meant* to ship is the fictional "Alex Rivera"
 * sample under `data/example/`.
 *
 * The npm tarball is governed solely by the `files` allowlist in
 * package.json (there is no .npmignore). That allowlist intentionally
 * includes the prerendered dashboard output (`dashboard/.next/standalone/`,
 * `dashboard/.next/static/`). A stale *local* dashboard build produced with a
 * real `CAREER_DATA_PATH` could bake real career values into those static
 * files — and because `.next/` is git-ignored, that leak would be invisible
 * to code review and slip straight into the published package.
 *
 * This test runs `npm pack --dry-run --json` (the exact set of files npm
 * would publish) and asserts:
 *   1. No path under a real-data dir (`data/career/`, `data/pipeline/`) ships.
 *   2. No YAML ships from anywhere except `data/example/`.
 *   3. No packed file *content* contains a real-career sentinel string
 *      (catches prerendered dashboard JSON/HTML that baked in real values).
 *   4. The intended example fixtures DO still ship (positive lock).
 *   5. No compiled test files ship (they are bloat AND a self-poison vector:
 *      this very test file mentions the real-data sentinels as regex literals,
 *      so a published `build/**\/*.test.js` would trip the content check #3
 *      against itself — see the `!build/**\/*.test.*` negation in the
 *      package.json `files` allowlist).
 *
 * It is intentionally provider-agnostic and reads the published file set from
 * npm itself rather than re-deriving the allowlist, so it stays correct if the
 * `files` field changes.
 */

const repoRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../..",
);

interface PackEntry {
  path: string;
}
interface PackResult {
  files: PackEntry[];
}

function packedFiles(): string[] {
  // `npm pack --dry-run --json` prints the exact file set that would be
  // published. We normalize separators so the assertions are OS-independent.
  const raw = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: repoRoot,
    encoding: "utf-8",
    // npm may emit a notice on stderr; we only parse stdout.
    stdio: ["ignore", "pipe", "ignore"],
    shell: process.platform === "win32",
  });
  const parsed = JSON.parse(raw) as PackResult[];
  return parsed[0].files.map((f) => f.path.replace(/\\/g, "/"));
}

/**
 * Real-career sentinel strings. These MUST NOT appear in any of Ben's real
 * career YAML / a real prerendered dashboard. They are deliberately NOT
 * present in the synthetic `data/example/` fixtures, so finding any of them
 * in a packed file means real data leaked.
 *
 * Kept generic on purpose: we assert the *example* persona's identifying
 * fields and a few real-world markers that would indicate Ben's own data.
 */
const REAL_DATA_SENTINELS: RegExp[] = [
  /benjamin\.schippers/i,
  /\bbeschipp\b/i,
  /brknbrnhdev/i,
  /microsoft.{0,40}senior\s+(program|product)\s+manager/i,
];
// NOTE: ".career-compass" is deliberately NOT a sentinel — it is the literal
// default-directory NAME documented in the README and hard-coded in the
// source/CLI, not a leaked value. The sentinels above are Ben's real PII
// markers, which must never appear in source, docs, samples, or a build.

describe("npm publish data-exposure guard", () => {
  const files = packedFiles();

  it("publishes a non-empty, parseable file set", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("never ships real-data dirs (data/career/, data/pipeline/)", () => {
    const realDataPaths = files.filter(
      (p) => p.startsWith("data/career/") || p.startsWith("data/pipeline/"),
    );
    expect(
      realDataPaths,
      `REAL CAREER DATA in the npm tarball: ${realDataPaths.join(", ")}`,
    ).toEqual([]);
  });

  it("never ships compiled test files (bloat + self-poison vector)", () => {
    // Test files have no business in the published package, and this file in
    // particular embeds the real-data sentinels as regex literals — shipping
    // its compiled `.test.js` would make the content guard below flag itself.
    const testFiles = files.filter(
      (p) => /(^|\/)__tests__\//.test(p) || /\.test\.[cm]?[jt]s(\.map)?$/.test(p),
    );
    expect(
      testFiles,
      `compiled test files in the npm tarball: ${testFiles.join(", ")}`,
    ).toEqual([]);
  });

  it("ships YAML only from data/example/", () => {
    const strayYaml = files.filter(
      (p) =>
        (p.endsWith(".yaml") || p.endsWith(".yml")) &&
        !p.startsWith("data/example/"),
    );
    expect(
      strayYaml,
      `YAML outside data/example/ in the npm tarball: ${strayYaml.join(", ")}`,
    ).toEqual([]);
  });

  it("never ships a file whose contents contain a real-career sentinel", () => {
    const offenders: string[] = [];
    for (const rel of files) {
      // Test files legitimately contain the sentinel strings as regex literals.
      // They are asserted out of the tarball by the dedicated test above; here
      // we skip them so this content check measures only real payload files and
      // can never false-positive on a guard's own source.
      if (/(^|\/)__tests__\//.test(rel) || /\.test\.[cm]?[jt]s/.test(rel)) {
        continue;
      }
      const abs = path.join(repoRoot, rel);
      if (!existsSync(abs)) continue; // some allowlisted dirs may be absent locally
      let text: string;
      try {
        text = readFileSync(abs, "utf-8");
      } catch {
        continue; // binary / unreadable — skip
      }
      for (const re of REAL_DATA_SENTINELS) {
        if (re.test(text)) {
          offenders.push(`${rel} (matched ${re})`);
          break;
        }
      }
    }
    expect(
      offenders,
      `Packed files contain real-career data (likely a stale dashboard build ` +
        `baked with a real CAREER_DATA_PATH): ${offenders.join("; ")}`,
    ).toEqual([]);
  });

  it("still ships the intended example fixtures (positive lock)", () => {
    const expected = [
      "data/example/career/profile.yaml",
      "data/example/career/experience.yaml",
      "data/example/career/skills.yaml",
      "data/example/career/testimonials.yaml",
      "data/example/pipeline/applications.yaml",
    ];
    for (const e of expected) {
      expect(files, `expected example fixture missing from tarball: ${e}`).toContain(
        e,
      );
    }
  });

  it("the example fixtures are sentinel-free (so the content check is meaningful)", () => {
    // If a sentinel ever shows up in the synthetic sample, the content guard
    // above becomes a false-positive trap. Lock the samples clean.
    const sample = path.join(repoRoot, "data", "example");
    const sampleFiles = files.filter((p) => p.startsWith("data/example/"));
    for (const rel of sampleFiles) {
      const abs = path.join(repoRoot, rel);
      if (!existsSync(abs)) continue;
      const text = readFileSync(abs, "utf-8");
      for (const re of REAL_DATA_SENTINELS) {
        expect(
          re.test(text),
          `example fixture ${rel} unexpectedly matched real-data sentinel ${re}`,
        ).toBe(false);
      }
    }
    expect(existsSync(sample)).toBe(true);
  });
});
