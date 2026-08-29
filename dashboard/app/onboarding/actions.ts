"use server";

// This module is the second writer the audit found: four Server Actions in a
// second OS process, writing the same data directory the MCP server owns.
//
// The three profile-updating actions below are read-modify-write: they take the
// current profile, merge a few fields, and write it back. That cycle now runs
// entirely inside `mutateCareerSection` — the load happens *within* the same
// lock and cross-process write claim the write holds, exactly like the MCP
// server's `mutatePipeline`. Doing the load outside (the previous shape) meant
// two concurrent saves — or one racing an MCP `save_career_section` — both
// started from the same snapshot and the later write silently reverted the
// earlier one, with both reporting success. Labelling the claim holder here is
// what makes a refusal legible ("another Career Compass process is writing…").

import { hasProfileData } from "@/lib/data";
import { mutateCareerSection, saveCareerSection } from "@shared/storage/file-store";
import { setClaimHolderLabel } from "@shared/storage/write-claim";
import type { Profile, Skill } from "@shared/schemas/career-schema";

setClaimHolderLabel("dashboard");

// The base a profile is created from when none exists yet. Kept in one place so
// every profile mutator starts from the same shape rather than re-declaring it.
const DEFAULT_PROFILE: Profile = {
  name: "", summary: "", targetRoles: [], targetIndustries: [], targetCompanySize: [],
  salaryCurrency: "USD", openToRemote: true, openToRelocation: false,
};

export async function checkForData(): Promise<boolean> {
  return hasProfileData();
}

export async function saveProfile(profile: Partial<Profile>): Promise<void> {
  await mutateCareerSection("profile", (current) => ({ ...(current ?? DEFAULT_PROFILE), ...profile }));
}

export async function saveTargets(data: {
  targetRoles: string[]; targetIndustries: string[]; targetCompanySize: string[];
}): Promise<void> {
  await mutateCareerSection("profile", (current) => ({ ...(current ?? DEFAULT_PROFILE), ...data }));
}

export async function saveSalaryPrefs(data: {
  salaryMin?: number; salaryMax?: number; salaryCurrency: string;
  openToRemote: boolean; openToRelocation: boolean; noticePeriod?: string;
}): Promise<void> {
  await mutateCareerSection("profile", (current) => ({ ...(current ?? DEFAULT_PROFILE), ...data }));
}

// A whole-section replace, not a read-modify-write: the caller supplies the
// complete skills array, so there is no lost-update window and the locked write
// in saveCareerSection is sufficient.
export async function saveSkills(skills: Skill[]): Promise<void> {
  await saveCareerSection("skills", skills);
}
