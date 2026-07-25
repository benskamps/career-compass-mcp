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

// ─── Write serialization ──────────────────────────────────────────────────────

/**
 * One promise chain per data file. Everything that mutates a file runs inside
 * `withDataLock` for that file's path, so read-modify-write cycles never
 * interleave.
 *
 * This is a different guarantee from the atomic rename in
 * {@link atomicWriteYaml}. Atomic *writes* stop a reader from ever seeing a
 * half-written file. They do nothing about two overlapping read-modify-write
 * cycles: both load the same snapshot, both mutate their own copy, both write,
 * and whichever renames last wins outright. That is not a theoretical race —
 * an MCP client may dispatch several `tools/call` requests before any resolves
 * (the SDK's stdio transport drains a whole chunk synchronously and dispatches
 * each without awaiting the previous), which is exactly what happens when a
 * user says "add both of these jobs." Before this lock, eight concurrent adds
 * left one application on disk and reported eight successes.
 *
 * Keyed by resolved absolute path rather than by a logical name because
 * `CAREER_DATA_PATH` is read at call time — two different data dirs are
 * genuinely independent and should not serialize against each other.
 *
 * In-process only, which is the right scope: the MCP server is the single
 * writer for a given data dir. It is not a defense against two servers pointed
 * at one directory, and does not claim to be.
 */
const writeChains = new Map<string, Promise<unknown>>();

export function withDataLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = writeChains.get(key) ?? Promise.resolve();
  // Run on both settle paths: one caller's failure must not wedge the chain.
  const run = previous.then(fn, fn);
  // Store a never-rejecting tail so an unhandled rejection can't escape here;
  // `run` itself still rejects to the caller.
  writeChains.set(
    key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

// ─── Path resolution ──────────────────────────────────────────────────────────

/** Absolute path of the directory the Career KB is read from and written to.
 *  Exported so empty-state messages can name the user's real folder instead of
 *  a repo-relative path that exists nowhere on their machine. */
export function getDataDir(): string {
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
  await renameWithRetry(tmpPath, filePath);
}

/**
 * rename(), with a short retry on the transient Windows failures.
 *
 * On Windows a rename over an existing file fails with EPERM/EBUSY/EACCES if
 * anything holds a handle on the destination for even a moment — an indexer, a
 * virus scanner, or the dashboard reading the file. POSIX rename has no such
 * behavior, so this never fires on macOS/Linux. Without it, the failure surfaced
 * to the user as a raw Node error string containing an absolute temp path.
 */
async function renameWithRetry(from: string, to: string, attempts = 5): Promise<void> {
  for (let i = 0; ; i++) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const transient = code === "EPERM" || code === "EBUSY" || code === "EACCES";
      if (!transient || i >= attempts - 1) throw error;
      await new Promise((r) => setTimeout(r, 15 * 2 ** i));
    }
  }
}

// ─── Career data ──────────────────────────────────────────────────────────────

export async function loadCareerData(): Promise<CareerData | null> {
  const dir = careerDir();
  if (!existsSync(dir)) return null;

  const profilePath = join(dir, "profile.yaml");
  if (!existsSync(profilePath)) return null;

  // Load each section and merge
  const raw: Record<string, unknown> = {};

  const sections = ["profile", "experience", "skills", "education", "projects", "testimonials", "journal"];
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

/** The only section names that may become a filename. */
export const CAREER_SECTIONS = [
  "profile", "experience", "skills", "education", "projects", "testimonials",
] as const;
export type CareerSection = (typeof CAREER_SECTIONS)[number];

/**
 * Write one section of the Career KB.
 *
 * `section` becomes a path segment, so it is checked against an allowlist rather
 * than trusted. Before this was reachable from a tool it was only ever called
 * with literals; now that a model can supply the value, `../../.ssh/id_rsa` has
 * to be impossible rather than merely unlikely.
 */
export async function saveCareerSection(section: string, data: unknown): Promise<void> {
  if (!(CAREER_SECTIONS as readonly string[]).includes(section)) {
    throw new Error(
      `Unknown career section "${section}". Expected one of: ${CAREER_SECTIONS.join(", ")}.`,
    );
  }
  const path = join(careerDir(), `${section}.yaml`);
  await withDataLock(path, () => atomicWriteYaml(path, data));
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
  const path = journalPath();
  return withDataLock(path, async () => {
    // The read MUST be inside the lock. Loading outside it means two concurrent
    // appends both start from the same list and the second write drops the
    // first entry — with both calls reporting success.
    const existing = await loadJournal();
    const next = [...existing, entry];
    await atomicWriteYaml(path, next);
    return next;
  });
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

/**
 * Run a read-modify-write cycle against the pipeline as one critical section.
 *
 * This is the only correct way to mutate the pipeline. `loadPipeline()` +
 * mutate + `savePipeline()` written out by hand at a call site is exactly the
 * bug this exists to prevent: the load and the save are two separate awaits, so
 * a second call can slip in between and have its write overwritten wholesale.
 *
 * `mutator` receives the freshly-loaded pipeline, mutates it in place, and
 * returns whatever the caller needs — handlers keep their ordinary return
 * contract, including the no-op branches ("application not found"), rather than
 * signalling through a thrown sentinel.
 *
 * The write is skipped when the mutator left the pipeline structurally
 * unchanged. `savePipeline` stamps a fresh `lastUpdated` and `atomicWriteYaml`
 * copies a full `.bak` on every call, so a no-op branch that wrote anyway would
 * spend a backup and move the clock to record that nothing happened.
 *
 * A CorruptDataError from the load propagates untouched: nothing is written,
 * so an unreadable file is never overwritten.
 */
export async function mutatePipeline<T>(
  mutator: (pipeline: Pipeline) => T | Promise<T>,
): Promise<T> {
  const path = join(pipelineDir(), "applications.yaml");
  return withDataLock(path, async () => {
    const pipeline = await loadPipeline();
    // `lastUpdated` is rewritten on every save, so comparing it would make the
    // dirty check always true. Compare only the applications.
    const before = JSON.stringify(pipeline.applications);
    const result = await mutator(pipeline);
    if (JSON.stringify(pipeline.applications) !== before) {
      await savePipeline(pipeline);
    }
    return result;
  });
}

// ─── Initialization ───────────────────────────────────────────────────────────

export async function ensureDataDirs(): Promise<void> {
  await mkdir(careerDir(), { recursive: true });
  await mkdir(pipelineDir(), { recursive: true });
}
