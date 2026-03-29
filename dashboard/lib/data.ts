import { loadCareerData, loadPipeline } from "@shared/storage/file-store.js";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export { loadCareerData, loadPipeline };

export function getDataDir(): string {
  return process.env.CAREER_DATA_PATH ?? join(homedir(), ".career-compass");
}

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
