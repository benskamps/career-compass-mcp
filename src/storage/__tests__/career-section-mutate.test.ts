import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  mutateCareerSection,
  saveCareerSection,
  loadCareerData,
  isCorruptDataError,
} from "../file-store.js";
import type { Profile } from "../../schemas/career-schema.js";

/**
 * Storage-level coverage for {@link mutateCareerSection} — the locked
 * read-modify-write door for the Career KB, the mirror of `mutatePipeline`.
 *
 * The load-bearing contract is that the load, the mutation, and the save all run
 * inside `withDataLock` + `withWriteClaim`. The Next dashboard's onboarding
 * Server Actions today load OUTSIDE any lock, mutate a copy, and call
 * `saveCareerSection` — so two concurrent field edits both start from the same
 * snapshot and the later write drops the earlier field, with both reporting
 * success. This is the door WP-5 routes those writes through.
 *
 * CAREER_DATA_PATH is pointed at a throwaway temp dir per test; getDataDir()
 * reads it at call time, so no production change is needed and the repo's real
 * example data is never touched.
 */

const ORIGINAL_PATH = process.env.CAREER_DATA_PATH;
let dataDir: string;
let careerDir: string;

const base: Profile = { name: "Ben", summary: "original", targetRoles: [], targetIndustries: [], targetCompanySize: [], salaryCurrency: "USD" };

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "cc-secmut-"));
  careerDir = join(dataDir, "career");
  process.env.CAREER_DATA_PATH = dataDir;
});

afterEach(async () => {
  if (ORIGINAL_PATH === undefined) delete process.env.CAREER_DATA_PATH;
  else process.env.CAREER_DATA_PATH = ORIGINAL_PATH;
  await rm(dataDir, { recursive: true, force: true });
});

describe("mutateCareerSection", () => {
  it("hands the mutator null when the section file does not exist yet", async () => {
    let seen: unknown = "unset";
    const result = await mutateCareerSection("profile", (current) => {
      seen = current;
      return { ...base, summary: "first" };
    });
    expect(seen).toBeNull();
    expect(result.summary).toBe("first");
    expect((await loadCareerData())?.profile.summary).toBe("first");
  });

  it("hands the mutator the section's current value on a subsequent edit", async () => {
    await saveCareerSection("profile", base);
    const result = await mutateCareerSection("profile", (current) => {
      expect(current?.name).toBe("Ben");
      return { ...(current as Profile), summary: "revised" };
    });
    expect(result.summary).toBe("revised");
    expect((await loadCareerData())?.profile.summary).toBe("revised");
  });

  it("round-trips an array section (experience)", async () => {
    const next = await mutateCareerSection("experience", (current) => [
      ...(current ?? []),
      { role: "PM", company: "Acme", startDate: "2020-01", endDate: "present", achievements: [], tags: [] },
    ]);
    expect(next).toHaveLength(1);
    // Read back through the same door (loadCareerData needs a profile.yaml, which
    // this test never wrote). The mutator returns the persisted value unchanged.
    const reloaded = await mutateCareerSection("experience", (c) => c ?? []);
    expect(reloaded[0].company).toBe("Acme");
  });

  // ── THE NEGATIVE CONTROL ──────────────────────────────────────────────────
  //
  // Two concurrent mutateCareerSection("profile", …) calls, each setting a
  // DIFFERENT field. Because the read is inside the lock, the second call loads
  // the first's result and both fields survive. Move the read OUTSIDE the lock
  // (as the dashboard's saveProfile does today) and both start from the same
  // snapshot: the later write drops the other's field and this fails.

  it("two concurrent mutations on different fields BOTH survive (read inside the lock)", async () => {
    const RUNS = 25;
    for (let i = 0; i < RUNS; i++) {
      await saveCareerSection("profile", base); // reset to a known baseline
      await Promise.all([
        mutateCareerSection("profile", (c) => ({ ...(c ?? base), summary: "SET-BY-A" })),
        mutateCareerSection("profile", (c) => ({ ...(c ?? base), targetRoles: ["PM"] })),
      ]);
      const after = (await loadCareerData())?.profile;
      expect(after?.summary, `run ${i}: A's field was dropped`).toBe("SET-BY-A");
      expect(after?.targetRoles, `run ${i}: B's field was dropped`).toEqual(["PM"]);
    }
  });

  // ── fail-closed: never overwrite an unreadable section ────────────────────

  it("throws CorruptDataError and does not clobber a corrupt section", async () => {
    await mkdir(careerDir, { recursive: true });
    const corrupt = "name: 123\nsummary: [not, a, string]\n:::bad";
    await writeFile(join(careerDir, "profile.yaml"), corrupt, "utf-8");

    const err = await mutateCareerSection("profile", () => base).then(() => null, (e) => e);
    expect(isCorruptDataError(err)).toBe(true);
    // The unreadable file is left exactly as-is, not replaced.
    expect(await readFile(join(careerDir, "profile.yaml"), "utf-8")).toBe(corrupt);
  });

  it("refuses an unknown section name (path-traversal allowlist)", async () => {
    await expect(
      // @ts-expect-error — deliberately off-allowlist to prove the runtime guard.
      mutateCareerSection("../../etc/passwd", () => base),
    ).rejects.toThrow(/Unknown career section/);
  });
});
