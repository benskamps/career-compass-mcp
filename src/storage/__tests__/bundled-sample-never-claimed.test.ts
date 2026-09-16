import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { bundledSampleDir } from "../../sample-data.js";

/**
 * A refused write must not touch the package's own directory.
 *
 * `atomicWriteYaml` has always refused to write into the demo that ships inside
 * the package. The refusal happened one layer too deep: the write claim was
 * taken FIRST, so a refused write still created `.write-claim` inside
 * `data/example/` and removed it a moment later. In a global install that is a
 * write into node_modules — the exact thing the refusal exists to prevent — and
 * on a read-only install (root-owned node_modules, a container image, a cached
 * CI layer) creating it fails with a permission error, replacing the one
 * sentence that explains the situation with one that does not.
 *
 * It also produced a test flake (#56). The scaffold fixtures `cp` the bundled
 * sample into a throwaway directory; a copy taken inside that window inherited a
 * live claim, and the next writer was correctly refused for a reason that had
 * nothing to do with the test under it.
 *
 * Both assertions below fail if the guard moves back inside `atomicWriteYaml`:
 * the claim module is never reached at all when the store is the bundled sample.
 */

// The path is inlined because vi.mock is hoisted above const declarations.
vi.mock("../write-claim.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../write-claim.js")>();
  return { ...actual, withWriteClaim: vi.fn(actual.withWriteClaim) };
});

describe("a refused bundled-sample write never reaches the claim", () => {
  let original: string | undefined;
  let sampleDir: string;

  beforeEach(() => {
    original = process.env.CAREER_DATA_PATH;
    const found = bundledSampleDir();
    // If the sample cannot be located the premise is gone and a pass here would
    // be vacuous, so say so rather than quietly succeeding.
    expect(found, "bundled sample dir not found — this test cannot prove anything").not.toBeNull();
    sampleDir = found as string;
    process.env.CAREER_DATA_PATH = sampleDir;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.CAREER_DATA_PATH;
    else process.env.CAREER_DATA_PATH = original;
    vi.clearAllMocks();
  });

  it("refuses with ReadOnlyStoreError without ever taking the claim", async () => {
    const { saveCareerSection } = await import("../file-store.js");
    const { isReadOnlyStore } = await import("../read-only-error.js");
    const { withWriteClaim } = await import("../write-claim.js");

    const err = await saveCareerSection("skills", [
      { name: "WMS rollout", category: "Technical" },
    ]).then(() => null, (e: unknown) => e);

    expect(isReadOnlyStore(err), `expected a ReadOnlyStoreError, got: ${String(err)}`).toBe(true);

    // The point of the fix: the refusal happens BEFORE the claim, so the claim
    // primitive is never invoked and nothing is written into the package.
    expect(
      vi.mocked(withWriteClaim),
      "the claim was taken for a write that was always going to be refused",
    ).not.toHaveBeenCalled();
  });

  it("leaves no .write-claim behind in the package directory", async () => {
    const { appendJournalEntry } = await import("../file-store.js");
    const claimPath = join(sampleDir, ".write-claim");

    expect(existsSync(claimPath), "a stale claim was already there before the test").toBe(false);

    await appendJournalEntry({
      date: "2026-09-15",
      type: "note",
      content: "refused write",
    } as never).catch(() => undefined);

    expect(
      existsSync(claimPath),
      "a refused write left a claim file inside the package's own data/example",
    ).toBe(false);
  });
});
