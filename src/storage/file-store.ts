import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { CareerData, Pipeline } from "../schemas/career-schema.js";
import type { z } from "zod";

// ─── Path resolution ──────────────────────────────────────────────────────────

function getDataDir(): string {
  return process.env.CAREER_DATA_PATH ?? join(process.cwd(), "data");
}

function careerDir(): string { return join(getDataDir(), "career"); }
function pipelineDir(): string { return join(getDataDir(), "pipeline"); }

// ─── YAML helpers ─────────────────────────────────────────────────────────────

async function readYaml<T>(filePath: string, schema: z.ZodType<T>): Promise<T | null> {
  if (!existsSync(filePath)) return null;
  const raw = await readFile(filePath, "utf-8");
  const parsed = parseYaml(raw);
  return schema.parse(parsed);
}

async function writeYaml(filePath: string, data: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, stringifyYaml(data, { lineWidth: 120 }), "utf-8");
}

// ─── Career data ──────────────────────────────────────────────────────────────

export async function loadCareerData(): Promise<CareerData | null> {
  const dir = careerDir();
  if (!existsSync(dir)) return null;

  const profilePath = join(dir, "profile.yaml");
  if (!existsSync(profilePath)) return null;

  // Load each section and merge
  const raw: Record<string, unknown> = {};

  const sections = ["profile", "experience", "skills", "education", "projects", "testimonials"];
  await Promise.all(sections.map(async (section) => {
    const path = join(dir, `${section}.yaml`);
    if (existsSync(path)) {
      const content = await readFile(path, "utf-8");
      const parsed = parseYaml(content);
      if (section === "profile") {
        raw.profile = parsed;
      } else {
        raw[section] = Array.isArray(parsed) ? parsed : (parsed?.[section] ?? []);
      }
    } else {
      if (section !== "profile") raw[section] = [];
    }
  }));

  return CareerData.parse(raw);
}

export async function saveCareerSection(section: string, data: unknown): Promise<void> {
  const path = join(careerDir(), `${section}.yaml`);
  await writeYaml(path, data);
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export async function loadPipeline(): Promise<Pipeline> {
  const path = join(pipelineDir(), "applications.yaml");
  if (!existsSync(path)) {
    return { applications: [], lastUpdated: new Date().toISOString() };
  }
  const raw = await readFile(path, "utf-8");
  const parsed = parseYaml(raw);
  return Pipeline.parse(parsed);
}

export async function savePipeline(pipeline: Pipeline): Promise<void> {
  const path = join(pipelineDir(), "applications.yaml");
  await writeYaml(path, { ...pipeline, lastUpdated: new Date().toISOString() });
}

// ─── Initialization ───────────────────────────────────────────────────────────

export async function ensureDataDirs(): Promise<void> {
  await mkdir(careerDir(), { recursive: true });
  await mkdir(pipelineDir(), { recursive: true });
}
