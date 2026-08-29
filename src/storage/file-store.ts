import { readFile, writeFile, mkdir, rename, copyFile, readdir, rm } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname, basename } from "path";
import { homedir } from "os";
import { randomUUID } from "crypto";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  CareerData,
  Pipeline,
  JournalSection,
  Profile,
  Experience,
  Skill,
  Education,
  Project,
  Testimonial,
} from "../schemas/career-schema.js";
import { freshenSampleDates, isBundledSampleDir } from "../sample-data.js";
import type { JournalEntry } from "../schemas/career-schema.js";
import { z } from "zod";
import { withWriteClaim } from "./write-claim.js";
import { serializeOn } from "./serialize.js";

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
 * In-process only, by design. The cross-process half of the problem — this repo
 * ships a second writer in the Next dashboard's Server Actions, and one MCP
 * server can be registered in both Claude Desktop and Claude Code — is handled
 * by {@link withWriteClaim} in ./write-claim.ts, which every mutation below
 * takes *outside* this lock. Two layers, two different races:
 *
 *   withDataLock   two awaits in this process interleaving
 *   withWriteClaim two processes believing they own the directory
 */
export function withDataLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  return serializeOn(key, fn);
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

/**
 * Is the store currently pointed at the demo that ships inside this package?
 *
 * Only true for `data/example/` in our own install — never for a user's data
 * dir, even one they populated by copying the sample. It gates two things: the
 * read-time date shift that keeps the demo from curdling, and the refusal to
 * write into a directory that belongs to the package rather than the user.
 */
function servingBundledSample(): boolean {
  return isBundledSampleDir(getDataDir());
}

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
 * How many timestamped `.bak` files to keep per data file.
 *
 * Backups exist so a bad write is recoverable, and recovery in practice means
 * "the version from a few writes ago" — nobody restores the 180th. Keeping
 * every one of them turned a normal search session into 224 files and 23.7 MB
 * of dead weight in the user's data directory, on a tool whose pitch is that
 * the data is plain files you can read.
 */
export const BACKUP_RETENTION = 5;

/** Matches only the backups {@link atomicWriteYaml} writes: `<file>.<ISO>.bak`. */
function backupPattern(base: string): RegExp {
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}\\.\\d{4}-\\d{2}-\\d{2}T[\\d-]+Z\\.bak$`);
}

/**
 * Delete all but the newest {@link BACKUP_RETENTION} backups of one file.
 *
 * Names carry an ISO timestamp with `:` and `.` swapped for `-`, so they are
 * fixed-width and sort lexicographically in chronological order — no stat() per
 * candidate. Only names matching that exact shape are considered: a `.bak` a
 * user made by hand before editing is theirs, not ours to garbage-collect.
 *
 * Best-effort by design. A backup we cannot delete (locked by a scanner on
 * Windows, say) is not a reason to fail the write that already succeeded.
 */
async function pruneBackups(dir: string, base: string): Promise<void> {
  try {
    const pattern = backupPattern(base);
    const ours = (await readdir(dir)).filter((n) => pattern.test(n)).sort();
    const stale = ours.slice(0, Math.max(0, ours.length - BACKUP_RETENTION));
    await Promise.all(
      stale.map((n) => rm(join(dir, n), { force: true }).catch(() => {})),
    );
  } catch {
    // Housekeeping only — never surfaced to the caller.
  }
}

/**
 * Back up (if the target exists) then write atomically.
 *
 * 1. If the destination already exists, copy it to a timestamped `.bak` so a
 *    bad write is always recoverable, then prune older backups to
 *    {@link BACKUP_RETENTION}.
 * 2. Write to a unique temp file in the same directory, then rename it over the
 *    destination. rename() is atomic on the same filesystem, so a reader never
 *    observes a half-written file.
 */
async function atomicWriteYaml(filePath: string, data: unknown): Promise<void> {
  // The bundled sample lives inside the installed package and is read at a
  // shifted date (see sample-data.ts). Writing to it would bake one session's
  // shifted dates into the demo everyone else sees, and in a global install it
  // means editing node_modules. It is a demo, not a store.
  if (servingBundledSample()) {
    throw new Error(
      `${filePath} is inside the bundled sample data, which is a read-only demo. ` +
        `Point CAREER_DATA_PATH at your own directory (or unset it to use ~/.career-compass) before saving.`,
    );
  }
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });

  if (existsSync(filePath)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = join(dir, `${basename(filePath)}.${stamp}.bak`);
    await copyFile(filePath, backupPath);
    await pruneBackups(dir, basename(filePath));
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
    const parsed = CareerData.parse(raw);
    // Only full YYYY-MM-DD dates move, which in the KB means journal entries.
    // Employment history is YYYY-MM and stays exactly where Alex left it.
    return servingBundledSample() ? freshenSampleDates(parsed) : parsed;
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
  await withDataLock(path, () =>
    withWriteClaim(getDataDir(), () => atomicWriteYaml(path, data)),
  );
}

/**
 * The value type stored under each Career KB section.
 *
 * `profile` is a single object; every other section is a list. This is the
 * contract {@link mutateCareerSection} hands its mutator, so a caller (the Next
 * dashboard's onboarding Server Actions in particular) gets the section it asked
 * for, correctly typed, without reaching for the whole `CareerData` document.
 */
export interface CareerSectionValueMap {
  profile: Profile;
  experience: Experience[];
  skills: Skill[];
  education: Education[];
  projects: Project[];
  testimonials: Testimonial[];
}

/** Fail-closed validation schema for each section, keyed by name. */
const CAREER_SECTION_SCHEMA: { readonly [K in CareerSection]: z.ZodType<CareerSectionValueMap[K]> } = {
  profile: Profile,
  experience: z.array(Experience),
  skills: z.array(Skill),
  education: z.array(Education),
  projects: z.array(Project),
  testimonials: z.array(Testimonial),
};

/**
 * Read one Career KB section, validated, or null if the file does not exist.
 *
 * Fail-closed like the rest of the store: a section file that exists but does
 * not parse or validate throws {@link CorruptDataError} rather than degrading to
 * an empty value a caller could then overwrite. This is stricter than
 * {@link loadCareerData}, which lets an optional section degrade to `[]` — that
 * is safe for a read-only merge, but this loader sits inside a read-modify-write
 * cycle, so degrading here would clobber a recoverable file.
 *
 * Array sections are accepted either bare (`- …`) or wrapped (`{section: [ … ]}`),
 * the same two on-disk shapes {@link loadCareerData} tolerates.
 */
async function readCareerSection<S extends CareerSection>(
  section: S,
): Promise<CareerSectionValueMap[S] | null> {
  const filePath = join(careerDir(), `${section}.yaml`);
  if (!existsSync(filePath)) return null;

  let parsed: unknown;
  try {
    parsed = parseYaml(await readFile(filePath, "utf-8"));
  } catch (error) {
    console.error(`Failed to parse ${section}.yaml:`, error);
    throw new CorruptDataError(filePath, error);
  }

  const candidate =
    section === "profile"
      ? parsed
      : Array.isArray(parsed)
        ? parsed
        : ((parsed as Record<string, unknown> | null)?.[section] ?? []);

  try {
    return CAREER_SECTION_SCHEMA[section].parse(candidate) as CareerSectionValueMap[S];
  } catch (error) {
    console.error(`Career section "${section}" failed validation:`, error);
    throw new CorruptDataError(filePath, error);
  }
}

/**
 * Run a read-modify-write cycle against one Career KB section as a single
 * critical section — the mirror of {@link mutatePipeline} for the Career KB.
 *
 * The load, the mutation, and the save all run INSIDE both `withDataLock` (this
 * process's per-file serialization) and `withWriteClaim` (the cross-process
 * claim), exactly as {@link appendJournalEntry} keeps its read inside the lock.
 * That is the whole point of this door: the Next dashboard's onboarding Server
 * Actions today do `loadCareerData()` OUTSIDE any lock, mutate a copy, then call
 * {@link saveCareerSection} — so two concurrent edits both start from the same
 * snapshot and the later write silently drops the earlier field, with both
 * reporting success. Routing those writes through here closes that lost update.
 *
 * `mutator` receives the section's current value (or `null` when the section
 * file does not exist yet — the caller supplies its own default) and returns the
 * next value to persist. {@link saveCareerSection} stays for callers that truly
 * replace a whole section without needing to read it first.
 *
 * A CorruptDataError from the read propagates untouched: nothing is written, so
 * an unreadable section is never overwritten. A WriteClaimUnavailableError
 * likewise propagates before the read runs.
 */
export async function mutateCareerSection<S extends CareerSection>(
  section: S,
  mutator: (
    current: CareerSectionValueMap[S] | null,
  ) => CareerSectionValueMap[S] | Promise<CareerSectionValueMap[S]>,
): Promise<CareerSectionValueMap[S]> {
  if (!(CAREER_SECTIONS as readonly string[]).includes(section)) {
    throw new Error(
      `Unknown career section "${section}". Expected one of: ${CAREER_SECTIONS.join(", ")}.`,
    );
  }
  const path = join(careerDir(), `${section}.yaml`);
  return withDataLock(path, () =>
    withWriteClaim(getDataDir(), async () => {
      // The read MUST be inside both the lock and the claim — same contract as
      // appendJournalEntry. Loading the section outside is exactly the bug this
      // exists to prevent.
      const current = await readCareerSection(section);
      const next = await mutator(current);
      await atomicWriteYaml(path, next);
      return next;
    }),
  );
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
  if (!parsed) return [];
  return servingBundledSample() ? freshenSampleDates(parsed) : parsed;
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
  return withDataLock(path, () =>
    withWriteClaim(getDataDir(), async () => {
      // The read MUST be inside both the lock and the claim. Loading outside
      // means two concurrent appends both start from the same list and the
      // second write drops the first entry — with both calls reporting success.
      const existing = await loadJournal();
      const next = [...existing, entry];
      await atomicWriteYaml(path, next);
      return next;
    }),
  );
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
    const pipeline = Pipeline.parse(parsed);
    // The bundled demo is dated relative to today so its interviews are still
    // upcoming and its follow-ups are not months overdue. Nothing on disk moves.
    return servingBundledSample() ? freshenSampleDates(pipeline) : pipeline;
  } catch (error) {
    console.error("Failed to parse pipeline:", error);
    // The file exists but is unreadable/invalid. Fail closed: returning an
    // empty pipeline here would let a subsequent write destroy the
    // user's real (recoverable) applications.yaml.
    throw new CorruptDataError(path, error);
  }
}

/**
 * Write the pipeline. **Takes no lock — see the name.**
 *
 * The safe door is {@link mutatePipeline}, which is the only production caller.
 * This one is exported for the storage tests, which need to write a known
 * pipeline without a read-modify-write cycle around it.
 *
 * It used to be called `savePipeline`, and the rule that it must never be called
 * by hand lived in a comment twenty lines below it — which is exactly the shape
 * of invariant this audit went looking for. `write-lock-truth.test.ts` now
 * asserts that no non-test source file imports this name, so the rule is checked
 * rather than remembered.
 */
export async function savePipelineUnlocked(pipeline: Pipeline): Promise<void> {
  const path = join(pipelineDir(), "applications.yaml");
  await atomicWriteYaml(path, { ...pipeline, lastUpdated: new Date().toISOString() });
}

/**
 * Run a read-modify-write cycle against the pipeline as one critical section.
 *
 * This is the only correct way to mutate the pipeline. `loadPipeline()` +
 * mutate + `savePipelineUnlocked()` written out by hand at a call site is exactly the
 * bug this exists to prevent: the load and the save are two separate awaits, so
 * a second call can slip in between and have its write overwritten wholesale.
 *
 * `mutator` receives the freshly-loaded pipeline, mutates it in place, and
 * returns whatever the caller needs — handlers keep their ordinary return
 * contract, including the no-op branches ("application not found"), rather than
 * signalling through a thrown sentinel.
 *
 * The write is skipped when the mutator left the pipeline structurally
 * unchanged. `savePipelineUnlocked` stamps a fresh `lastUpdated` and `atomicWriteYaml`
 * copies a full `.bak` on every call, so a no-op branch that wrote anyway would
 * spend a backup and move the clock to record that nothing happened.
 *
 * A CorruptDataError from the load propagates untouched: nothing is written,
 * so an unreadable file is never overwritten. A WriteClaimUnavailableError
 * likewise propagates before the load runs — another process owns this
 * directory, so the honest outcome is "unavailable", not a second writer.
 */
export async function mutatePipeline<T>(
  mutator: (pipeline: Pipeline) => T | Promise<T>,
): Promise<T> {
  const path = join(pipelineDir(), "applications.yaml");
  return withDataLock(path, () =>
    withWriteClaim(getDataDir(), async () => {
      const pipeline = await loadPipeline();
      // `lastUpdated` is rewritten on every save, so comparing it would make the
      // dirty check always true. Compare only the applications.
      const before = JSON.stringify(pipeline.applications);
      const result = await mutator(pipeline);
      if (JSON.stringify(pipeline.applications) !== before) {
        await savePipelineUnlocked(pipeline);
      }
      return result;
    }),
  );
}

// ─── Initialization ───────────────────────────────────────────────────────────

export async function ensureDataDirs(): Promise<void> {
  await mkdir(careerDir(), { recursive: true });
  await mkdir(pipelineDir(), { recursive: true });
}
