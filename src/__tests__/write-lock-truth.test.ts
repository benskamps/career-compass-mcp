import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Gate 3's negative control: the unlocked write path stays unreachable.
 *
 * `file-store.ts` documents at length why `loadPipeline()` + mutate +
 * `save()` written out by hand at a call site is the lost-update bug the lock
 * exists to prevent — and then exported the unlocked writer under the friendly
 * name `savePipeline`, twenty lines above that explanation. Nothing in the type
 * system stopped the next call site from reaching for it.
 *
 * It is now `savePipelineUnlocked`, and this test is what keeps the rule honest:
 * a name that warns is a convention, a test that fails is an invariant.
 *
 * The tests may call it — they need to write a known pipeline without a
 * read-modify-write cycle. Production code may not.
 */

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

/**
 * Read a file with its comments removed.
 *
 * A truth test that greps raw text cannot tell a call from a sentence about a
 * call — `doctor.ts` merely *mentions* `atomicWriteYaml` in a comment
 * explaining what the temp files in the data dir are, and a naive scan reported
 * it as an unlocked writer. A false positive in an invariant test is worse than
 * no test: it trains the next person to add an exception rather than look.
 */
function readCode(file: string): string {
  return readFileSync(file, "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Every .ts/.tsx file under a root, excluding tests and build output. */
function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name === "node_modules" || name === ".next" || name === "build" || name === "__tests__") continue;
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(name)) continue;
      if (/\.test\.tsx?$/.test(name)) continue;
      out.push(full);
    }
  };
  walk(root);
  return out;
}

describe("the unlocked pipeline write stays out of production code", () => {
  const files = [
    ...sourceFiles(path.join(repoRoot, "src")),
    ...sourceFiles(path.join(repoRoot, "bin")),
    ...sourceFiles(path.join(repoRoot, "dashboard/app")),
    ...sourceFiles(path.join(repoRoot, "dashboard/lib")),
    ...sourceFiles(path.join(repoRoot, "dashboard/components")),
  ];

  it("finds source files to check (guards against a silently empty sweep)", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("only file-store.ts itself names savePipelineUnlocked", () => {
    const offenders = files
      .filter((f) => path.resolve(f) !== path.resolve(repoRoot, "src/storage/file-store.ts"))
      .filter((f) => /\bsavePipelineUnlocked\b/.test(readFileSync(f, "utf-8")))
      .map((f) => path.relative(repoRoot, f));

    expect(
      offenders,
      `These files reach the unlocked writer directly. Use mutatePipeline() — it ` +
        `runs the load and the save inside one lock, which is the whole point:\n  ` +
        offenders.join("\n  "),
    ).toEqual([]);
  });

  it("the friendly old name is gone, so nobody imports it by muscle memory", () => {
    const store = readCode(path.join(repoRoot, "src/storage/file-store.ts"));
    expect(store).not.toMatch(/export async function savePipeline\s*\(/);
    expect(store).toMatch(/export async function savePipelineUnlocked\s*\(/);
  });

  it("every pipeline mutation in the tools goes through mutatePipeline", () => {
    for (const f of files.filter((f) => f.includes(path.join("src", "tools")))) {
      const src = readCode(f);
      if (!/loadPipeline/.test(src)) continue;
      // A tool that loads the pipeline and also writes must do both in one lock.
      const writes = /savePipelineUnlocked|atomicWriteYaml/.test(src);
      expect(writes, `${path.relative(repoRoot, f)} writes the pipeline outside mutatePipeline`).toBe(false);
    }
  });
});
