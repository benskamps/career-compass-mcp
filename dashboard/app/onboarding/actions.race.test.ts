import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { saveProfile, saveTargets } from "./actions";
import { loadCareerData } from "@shared/storage/file-store";

/**
 * Negative control for gauntlet-v2 P1-1 (the lost-update the audit reproduced
 * 20/20). The onboarding Server Actions used to load the profile *outside* the
 * lock and write it back inside — so two concurrent saves both started from the
 * same snapshot and the later write reverted the earlier one, with both
 * reporting success.
 *
 * They now route through `mutateCareerSection`, whose read runs inside the same
 * lock and claim the write holds. This test fires two actions that touch
 * DIFFERENT fields at once; both fields must survive. Revert the actions to
 * load-outside-then-saveCareerSection and this goes red.
 */
describe("onboarding actions — concurrent writes do not lose updates", () => {
  let tmpDir: string;
  const origEnv = process.env.CAREER_DATA_PATH;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-race-"));
    fs.mkdirSync(path.join(tmpDir, "career"), { recursive: true });
    process.env.CAREER_DATA_PATH = tmpDir;
  });

  afterEach(() => {
    process.env.CAREER_DATA_PATH = origEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("keeps both a summary edit and a targets edit written concurrently", async () => {
    // Seed a profile so both actions start from a real section.
    await saveProfile({ name: "Alex", summary: "before" });

    // Two mutations of different fields, fired without awaiting the first —
    // exactly the blur-plus-checkbox gesture the audit named.
    await Promise.all([
      saveProfile({ summary: "after" }),
      saveTargets({ targetRoles: ["PM"], targetIndustries: ["SaaS"], targetCompanySize: ["Series B"] }),
    ]);

    const career = await loadCareerData();
    expect(career).not.toBeNull();
    // The defining symptom of a lost update is two successes, one survivor.
    // Both must be here.
    expect(career!.profile.summary).toBe("after");
    expect(career!.profile.targetRoles).toEqual(["PM"]);
  });
});
