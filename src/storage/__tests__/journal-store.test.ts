import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { loadJournal, appendJournalEntry, isCorruptDataError } from "../file-store.js";
import type { JournalEntry } from "../../schemas/career-schema.js";

/**
 * Storage-level coverage for the career journal — the append-only spine of the
 * "accruing KB". The key contract is fail-closed: an append must never start
 * from [] on top of an unreadable file, or a single new entry would silently
 * erase recoverable history.
 *
 * CAREER_DATA_PATH is pointed at a throwaway temp dir per test; file-store's
 * getDataDir() reads it at call time, so no production change is needed and the
 * repo's real example data is never touched.
 */

const ORIGINAL_PATH = process.env.CAREER_DATA_PATH;
let dataDir: string;
let careerDir: string;

function entry(over: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: over.id ?? Math.random().toString(36).slice(2, 10),
    date: over.date ?? "2026-07-14T00:00:00.000Z",
    type: over.type ?? "note",
    summary: over.summary ?? "a durable takeaway",
    signals: over.signals ?? [],
    source: over.source ?? "manual",
    ...over,
  };
}

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "cc-journal-"));
  careerDir = join(dataDir, "career");
  process.env.CAREER_DATA_PATH = dataDir;
});

afterEach(async () => {
  if (ORIGINAL_PATH === undefined) delete process.env.CAREER_DATA_PATH;
  else process.env.CAREER_DATA_PATH = ORIGINAL_PATH;
  await rm(dataDir, { recursive: true, force: true });
});

describe("loadJournal", () => {
  it("returns [] when no journal file exists (normal empty state)", async () => {
    expect(await loadJournal()).toEqual([]);
  });

  it("round-trips valid entries in append order", async () => {
    await appendJournalEntry(entry({ id: "aaa", summary: "first" }));
    await appendJournalEntry(entry({ id: "bbb", summary: "second" }));
    const loaded = await loadJournal();
    expect(loaded.map((e) => e.summary)).toEqual(["first", "second"]);
  });

  it("throws CorruptDataError when the file exists but is invalid (fail closed)", async () => {
    await mkdir(careerDir, { recursive: true });
    // Schema-invalid: a list whose entry is missing required fields.
    await writeFile(join(careerDir, "journal.yaml"), "- summary: 123\n  nope: true\n", "utf-8");
    const err = await loadJournal().then(() => null, (e) => e);
    expect(isCorruptDataError(err)).toBe(true);
  });
});

describe("appendJournalEntry", () => {
  it("creates journal.yaml on first append and returns the full list", async () => {
    const all = await appendJournalEntry(entry({ summary: "hello world" }));
    expect(all).toHaveLength(1);
    expect(all[0].summary).toBe("hello world");
    expect(await loadJournal()).toHaveLength(1);
  });

  it("appends without dropping earlier entries", async () => {
    await appendJournalEntry(entry({ summary: "one" }));
    await appendJournalEntry(entry({ summary: "two" }));
    const all = await appendJournalEntry(entry({ summary: "three" }));
    expect(all.map((e) => e.summary)).toEqual(["one", "two", "three"]);
  });

  it("writes a timestamped .bak backup when overwriting an existing file", async () => {
    await appendJournalEntry(entry({ summary: "one" })); // creates, no prior file → no bak
    await appendJournalEntry(entry({ summary: "two" })); // overwrites → bak of the 1-entry file
    const baks = (await readdir(careerDir)).filter((f) => /journal\.yaml\..*\.bak$/.test(f));
    expect(baks.length).toBeGreaterThanOrEqual(1);
  });

  it("fails closed on a corrupt file instead of clobbering it", async () => {
    await mkdir(careerDir, { recursive: true });
    const corrupt = "- summary: 123\n  nope: true\n";
    await writeFile(join(careerDir, "journal.yaml"), corrupt, "utf-8");

    const err = await appendJournalEntry(entry({ summary: "new" })).then(() => null, (e) => e);
    expect(isCorruptDataError(err)).toBe(true);
    // The unreadable file must be left exactly as-is (not replaced by [new]).
    const { readFile } = await import("fs/promises");
    expect(await readFile(join(careerDir, "journal.yaml"), "utf-8")).toBe(corrupt);
  });
});
