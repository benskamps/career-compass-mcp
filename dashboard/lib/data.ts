import { loadCareerData, loadPipeline, getDataDir } from "@shared/storage/file-store";
import { existsSync } from "fs";
import { join } from "path";

// Re-exported from the shared store rather than re-implemented here: the audit
// found this file had its own copy of getDataDir, the exact copy-drift that let
// the two dashboards diverge. One definition, imported.
export { loadCareerData, loadPipeline, getDataDir };

export function hasProfileData(): boolean {
  const profilePath = join(getDataDir(), "career", "profile.yaml");
  return existsSync(profilePath);
}

export type DataStatus = "empty" | "incomplete" | "complete";

export async function getDataStatus(): Promise<DataStatus> {
  if (!hasProfileData()) return "empty";
  const career = await loadCareerData();
  if (!career) return "empty";

  const { profile, experience, skills } = career;
  const hasTargets = profile.targetRoles.length > 0;
  const hasSalary = profile.salaryMin !== undefined && profile.salaryMax !== undefined;
  const hasSkillProficiency = skills.some((s) => s.proficiency !== undefined);
  const hasExperience = experience.length > 0;

  if (!hasTargets || !hasSalary || !hasSkillProficiency || !hasExperience) {
    return "incomplete";
  }
  return "complete";
}
