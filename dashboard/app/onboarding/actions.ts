"use server";

// This module is the second writer the audit found: four Server Actions in a
// second OS process, writing the same data directory the MCP server owns.
// It now takes the cross-process write claim through saveCareerSection like
// everyone else; labelling it here is what makes a refusal legible ("another
// Career Compass process is writing…, pid N").

import { hasProfileData, loadCareerData } from "@/lib/data";
import { saveCareerSection } from "@shared/storage/file-store";
import { setClaimHolderLabel } from "@shared/storage/write-claim";
import type { Profile, Skill } from "@shared/schemas/career-schema";

setClaimHolderLabel("dashboard");

export async function checkForData(): Promise<boolean> {
  return hasProfileData();
}

export async function saveProfile(profile: Partial<Profile>): Promise<void> {
  const career = await loadCareerData();
  const existing = career?.profile ?? {
    name: "", summary: "", targetRoles: [], targetIndustries: [], targetCompanySize: [],
    salaryCurrency: "USD", openToRemote: true, openToRelocation: false,
  };
  await saveCareerSection("profile", { ...existing, ...profile });
}

export async function saveTargets(data: {
  targetRoles: string[]; targetIndustries: string[]; targetCompanySize: string[];
}): Promise<void> {
  const career = await loadCareerData();
  if (!career) return;
  await saveCareerSection("profile", { ...career.profile, ...data });
}

export async function saveSalaryPrefs(data: {
  salaryMin?: number; salaryMax?: number; salaryCurrency: string;
  openToRemote: boolean; openToRelocation: boolean; noticePeriod?: string;
}): Promise<void> {
  const career = await loadCareerData();
  if (!career) return;
  await saveCareerSection("profile", { ...career.profile, ...data });
}

export async function saveSkills(skills: Skill[]): Promise<void> {
  await saveCareerSection("skills", skills);
}
