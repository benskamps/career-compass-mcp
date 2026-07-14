import { readFile, writeFile, mkdir, rename, copyFile } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname, basename } from "path";
import { homedir } from "os";
import { randomUUID } from "crypto";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { CareerData, Pipeline, JournalSection } from "../schemas/career-schema.js";
import type { JournalEntry } from "../schemas/career-schema.js";
import type { z } from "zod";

// ─── Typed errors ─────────────────────────────────────────────────────────────

/**
 * Thrown when a data file exists on disk but cannot be parsed or fails schema
 * validation. This is the fail-closed signal: callers MUST NOT proceed to
 * mutate/overwrite the store, because doing so would replace recoverable
 * (but currently invalid) user data with empty/fallback data — silent loss.
 *
 * A *missing* file is NOT an error: that is the normal "empty store" state and
 * the loaders return empty/null for it.
 */
export class CorruptDataError extends Error {
  readonly filePath: string;
  readonly cause?: unknown;
  constructor(filePath: string, cause?: unknown) {
    super(
      `Data file exists but is unreadable or invalid: ${filePath}. ` +
        `Refusing to continue so it cannot be overwritten. ` +
        `Fix the file or restore a .bak backup, then retry.`,
    );
    this.name = "CorruptDataError";
    this.filePath = filePath;
    this.cause = cause;
  }
}

export function isCorruptDataError(e: unknown): e is CorruptDataError {
  return e instanceof CorruptDataError;
}

// ─── Path resolution ──────────────────────────────────────────────────────────

function getDataDir(): string {
  return process.env.CAREER_DATA_PATH ?? join(homedir(), ".career-compass");
}

function careerDir(): string { return join(getDataDir(), "career"); }
function pipelineDir(): string { return join(getDataDir(), "pipeline"); }

// ─── YAML helpers ─────────────────────────────────────────────────────────────

/**
 * Read + parse + validate a YAML file.
 *
 * - Missing file        → returns null (normal empty state).
 * - Exists but invalid  → throws CorruptDataError (fail closed).
 */
async function readYaml<T>(filePath: string, schema: z.ZodType<T>): Promise<T | null> {
  if (!existsSync(filePath)) return null;
  try {
    const raw = await readFile(filePath, "utf-8");
    const parsed = parseYaml(raw);
    return schema.parse(parsed);
  } catch (error) {
    console.error(`Failed to parse ${filePath}:`, error);
    throw new CorruptDataError(filePath, error);
  }
}

/**
 * Back up (if the target exists) then write atomically.
 *
 * 1. If the destination already exists, copy it to a timestamped `.bak` so a
 *    bad write is always recoverable.
 * 2. Write to a unique temp file in the same directory, then rename it over the
 *    destination. rename() is atomic on the same filesystem, so a reader never
 *    observes a half-written file.
 */
async function atomicWriteYaml(filePath: string, data: unknown): Promise<void> {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });

  if (existsSync(filePath)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = join(dir, `${basename(filePath)}.${stamp}.bak`);
    await copyFile(filePath, backupPath);
  }

  const tmpPath = join(dir, `.${basename(filePath)}.${randomUUID()}.tmp`);
  const serialized = stringifyYaml(data, { lineWidth: 120 });
  await writeFile(tmpPath, serialized, "utf-8");
  await rename(tmpPath, filePath);
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
    if (!existsSync(path)) {
      if (section !== "profile") raw[section] = [];
      return;
    }
    let parsed: unknown;
    try {
      const content = await readFile(path, "utf-8");
      parsed = parseYaml(content);
    } catch (error) {
      console.error(`Failed to parse ${section}.yaml:`, error);
      // The profile is required and load-bearing: a corrupt profile must fail
      // closed so it can't be overwritten. Optional sections degrade to empty.
      if (section === "profile") {
        throw new CorruptDataError(path, error);
      }
      raw[section] = [];
      return;
    }
    if (section === "profile") {
      raw.profile = parsed;
    } else {
      raw[section] = Array.isArray(parsed) ? parsed : ((parsed as Record<string, unknown> | null)?.[section] ?? []);
    }
  }));

  try {
    return CareerData.parse(raw);
  } catch (error) {
    console.error("Career data validation failed:", error);
    // Files exist (profile is present) but the merged document is schema-invalid.
    // Fail closed rather than returning null, which a caller could overwrite.
    throw new CorruptDataError(profilePath, error);
  }
}

export async function saveCareerSection(section: string, data: unknown): Promise<void> {
  const path = join(careerDir(), `${section}.yaml`);
  await atomicWriteYaml(path, data);
}

// ─── Career journal (append-only signals) ──────────────────────────────────────

function journalPath(): string { return join(careerDir(), "journal.yaml"); }

/**
 * Load the career journal.
 *
 * - Missing file       → [] (normal empty state; the journal is optional).
 * - Exists but invalid → throws CorruptDataError (fail closed).
 *
 * The fail-closed behavior is load-bearing for {@link appendJournalEntry}: an
 * append must never silently start from [] on top of an unreadable file, or it
 * would overwrite recoverable history with a single new entry.
 */
export async function loadJournal(): Promise<JournalEntry[]> {
  const parsed = await readYaml(journalPath(), JournalSection);
  return parsed ?? [];
}

/**
 * Append one entry to the journal and persist it (atomic write + .bak backup,
 * via {@link atomicWriteYaml}). Returns the full updated list.
 *
 * Reads fail-closed first: if journal.yaml exists but is corrupt, this throws
 * CorruptDataError rather than clobbering it.
 */
export async function appendJournalEntry(entry: JournalEntry): Promise<JournalEntry[]> {
  const existing = await loadJournal();
  const next = [...existing, entry];
  await atomicWriteYaml(journalPath(), next);
  return next;
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export async function loadPipeline(): Promise<Pipeline> {
  const path = join(pipelineDir(), "applications.yaml");
  if (!existsSync(path)) {
    return { applications: [], lastUpdated: new Date().toISOString() };
  }
  try {
    const raw = await readFile(path, "utf-8");
    const parsed = parseYaml(raw);
    return Pipeline.parse(parsed);
  } catch (error) {
    console.error("Failed to parse pipeline:", error);
    // The file exists but is unreadable/invalid. Fail closed: returning an
    // empty pipeline here would let a subsequent savePipeline() destroy the
    // user's real (recoverable) applications.yaml.
    throw new CorruptDataError(path, error);
  }
}

export async function savePipeline(pipeline: Pipeline): Promise<void> {
  const path = join(pipelineDir(), "applications.yaml");
  await atomicWriteYaml(path, { ...pipeline, lastUpdated: new Date().toISOString() });
}

// ─── Initialization ───────────────────────────────────────────────────────────

export async function ensureDataDirs(): Promise<void> {
  await mkdir(careerDir(), { recursive: true });
  await mkdir(pipelineDir(), { recursive: true });
}
