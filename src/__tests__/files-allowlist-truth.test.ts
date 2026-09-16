import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Manifest-truth guard: every `files` entry must actually ship something.
 *
 * npm's `files` field reads like a promise — "these are the things in the
 * package" — but it is only an *allowlist*, and an allowlist is silent when it
 * selects nothing. Two ways an entry can quietly select nothing:
 *
 *   1. **The path is gitignored.** With no `.npmignore`, npm uses `.gitignore`
 *      as its exclusion list, and that exclusion still wins over a `files`
 *      entry. This repo shipped v2.0.0 promising `dashboard/.next/standalone/`
 *      and `dashboard/.next/static/` while `.gitignore` line 4 (`dashboard/.next/`)
 *      guaranteed neither could ever be packed — 23 MB of built dashboard sat
 *      on disk and npm dropped every byte, with no warning, for the entire
 *      life of the release.
 *   2. **The path does not exist.** `dashboard/public/` was listed for a
 *      directory that was never created.
 *
 * Both failures are invisible: `npm pack` exits 0, CI stays green, and the only
 * symptom is a stranger installing the package and finding the advertised
 * feature missing (repo issue #16).
 *
 * This test asks npm itself — via `npm pack --dry-run --json`, the same source
 * of truth the leak guard uses — which files would really be published, and
 * asserts that every positive entry in `files` claims at least one of them.
 * It is deliberately blind to *which* files those are, so it keeps working as
 * the package's contents evolve; it only refuses to let the manifest describe
 * a package that does not exist.
 *
 * Negation entries (`!build/**\/*.test.*`) are exclusions, not promises, and
 * are skipped.
 */

const repoRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../..",
);

interface PackResult {
  files: { path: string }[];
}

function packedFiles(): string[] {
  const raw = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: repoRoot,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "ignore"],
    shell: process.platform === "win32",
  });
  // npm 10 returns an array of pack results; npm 11 returns an object keyed by
  // package name, so `parsed[0]` is undefined there and this read threw
  // "Cannot read properties of undefined (reading 'files')". It surfaced in the
  // v2.9.2 release run, where the publish workflow upgrades npm to >= 11.5.1 for
  // trusted publishing and prepublishOnly then runs this guard. Accept both
  // shapes: the guard has to work on whatever npm the person running it has.
  const parsed = JSON.parse(raw) as PackResult[] | Record<string, PackResult>;
  const result = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
  return result.files.map((f) =>
    f.path.replace(/\\/g, "/"),
  );
}

const pkg = JSON.parse(
  readFileSync(path.join(repoRoot, "package.json"), "utf-8"),
) as { files: string[] };

/**
 * npm treats a bare `dir/` entry as "everything under dir", and a bare filename
 * as that exact file. We normalize both to a prefix test against the real
 * packed set.
 */
function claimsSomething(entry: string, packed: string[]): boolean {
  const normalized = entry.replace(/\/$/, "");
  return packed.some(
    (f) => f === normalized || f.startsWith(`${normalized}/`),
  );
}

describe("files allowlist truth: every promise ships something", () => {
  const packed = packedFiles();

  it("packs a non-trivial file set at all", () => {
    expect(packed.length).toBeGreaterThan(10);
  });

  it("has no `files` entry that selects zero packed files", () => {
    const promises = pkg.files.filter((f) => !f.startsWith("!"));
    const empty = promises.filter((entry) => !claimsSomething(entry, packed));
    expect(
      empty,
      `package.json "files" promises ${empty.join(", ")} but npm packs nothing under it. ` +
        `Either the path is excluded by .gitignore (which wins over "files" when there is no .npmignore), ` +
        `or it does not exist. Remove the entry or fix the path — do not let the manifest advertise ` +
        `something the tarball has never contained.`,
    ).toEqual([]);
  });

  it("does not promise the Next.js dashboard, which .gitignore makes unpackable", () => {
    // Kept as a named regression lock on the specific bug (issue #16): the
    // shipped dashboard is the dependency-free lite one under
    // build/src/dashboard-lite/, which packs normally.
    const nextDashboardPromises = pkg.files.filter((f) =>
      f.startsWith("dashboard/"),
    );
    expect(
      nextDashboardPromises,
      `"files" lists ${nextDashboardPromises.join(", ")}. dashboard/.next/ is gitignored, so npm silently ` +
        `drops it; shipping it would also mean publishing a prerendered build that could bake in real ` +
        `career data (see npm-pack-leak-guard). The npm package's dashboard is build/src/dashboard-lite/.`,
    ).toEqual([]);
    expect(
      packed.some((f) => f.startsWith("build/src/dashboard-lite/")),
      "the lite dashboard must actually ship — it is what `career-compass-mcp dashboard` serves from an npm install",
    ).toBe(true);
  });
});
