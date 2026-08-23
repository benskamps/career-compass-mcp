import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  bundledSampleDir,
  freshenSampleDates,
  isBundledSampleDir,
  sampleAnchor,
} from "../sample-data.js";
import { loadPipeline, loadJournal, savePipelineUnlocked } from "../storage/file-store.js";
import { deriveNextActions } from "../dashboard-lite/render.js";
import { handleNextActions } from "../tools/pipeline.js";

/**
 * Guard: the bundled sample never goes stale, and never gets written to.
 *
 * Every date in data/example/ was typed by hand in June 2026 — a panel three
 * days out, a follow-up due next month. Nothing aged them, so the one populated
 * demo a stranger can look at decays into an abandoned search: interviews that
 * already happened, follow-ups months overdue. They are now shifted at read
 * time relative to today, which fixes it permanently rather than until the next
 * time someone remembers to re-date the YAML.
 */

const ORIGINAL_PATH = process.env.CAREER_DATA_PATH;
const tempDirs: string[] = [];

afterEach(async () => {
  if (ORIGINAL_PATH === undefined) delete process.env.CAREER_DATA_PATH;
  else process.env.CAREER_DATA_PATH = ORIGINAL_PATH;
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function tempDataDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "cc-sample-"));
  tempDirs.push(dir);
  return dir;
}

/** Every YYYY-MM-DD in a parsed document, wherever it sits. */
function datesIn(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    for (const m of value.matchAll(/\d{4}-\d{2}-\d{2}/g)) out.push(m[0]);
  } else if (Array.isArray(value)) {
    value.forEach((v) => datesIn(v, out));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((v) => datesIn(v, out));
  }
  return out;
}

/**
 * Fields whose value records something that has already happened, per document.
 *
 * Split by document because the key `date` means opposite things in the two:
 * a journal entry's `date` is when it was captured, an interview round's is
 * when the round is (often ahead). Note prefixes — `[2026-06-01] Applied…` —
 * are log lines and always past, whatever field they sit in.
 */
const PIPELINE_PAST_KEYS = new Set(["dateUpdated", "dateApplied", "dateDiscovered", "lastUpdated"]);
const JOURNAL_PAST_KEYS = new Set(["date"]);

interface DateHit { key: string; date: string }

function pastDatesIn(
  value: unknown,
  keys: Set<string>,
  key: string | null = null,
  out: DateHit[] = [],
): DateHit[] {
  if (typeof value === "string") {
    if (key !== null && keys.has(key) && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      out.push({ key, date: value.slice(0, 10) });
    }
    for (const m of value.matchAll(/\[(\d{4}-\d{2}-\d{2})\]/g)) {
      out.push({ key: `${key ?? "?"} note`, date: m[1] });
    }
  } else if (Array.isArray(value)) {
    value.forEach((v) => pastDatesIn(v, keys, key, out));
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([k, v]) => pastDatesIn(v, keys, k, out));
  }
  return out;
}

function daysAgo(iso: string, today = new Date()): number {
  const [y, m, d] = iso.split("-").map(Number);
  const midnight = Date.UTC(today.getFullYear(), today.getMonth() + 1 - 1, today.getDate());
  return Math.round((midnight - Date.UTC(y, m - 1, d)) / 86400000);
}

describe("freshenSampleDates", () => {
  // A fixed anchor, passed explicitly, so these stay about the shift arithmetic
  // rather than about whatever dates the fixture happens to carry today.
  const ANCHOR = "2026-06-16";
  // One day after the anchor: every date should move by exactly one day.
  const oneDayOn = new Date(`${ANCHOR}T12:00:00`);
  oneDayOn.setDate(oneDayOn.getDate() + 1);

  it("shifts date-only fields", () => {
    expect(freshenSampleDates({ followUpDue: "2026-07-26" }, oneDayOn, ANCHOR)).toEqual({
      followUpDue: "2026-07-27",
    });
  });

  it("shifts the day of a timestamp and keeps the time", () => {
    expect(
      freshenSampleDates({ dateUpdated: "2026-06-13T14:22:00.000Z" }, oneDayOn, ANCHOR),
    ).toEqual({ dateUpdated: "2026-06-14T14:22:00.000Z" });
  });

  it("shifts dates written inside note text", () => {
    expect(freshenSampleDates(["[2026-06-01] Tailored resume."], oneDayOn, ANCHOR)).toEqual([
      "[2026-06-02] Tailored resume.",
    ]);
  });

  it("leaves YYYY-MM employment history alone", () => {
    // Alex started that job in March 2021 and always will have.
    expect(
      freshenSampleDates({ startDate: "2021-03", endDate: "present" }, oneDayOn, ANCHOR),
    ).toEqual({ startDate: "2021-03", endDate: "present" });
  });

  it("does not mutate its input", () => {
    const original = { dateApplied: "2026-06-01" };
    freshenSampleDates(original, oneDayOn, ANCHOR);
    expect(original.dateApplied).toBe("2026-06-01");
  });

  it("is a no-op on the anchor day itself", () => {
    const onAnchor = new Date(`${ANCHOR}T12:00:00`);
    expect(freshenSampleDates({ d: "2026-06-01" }, onAnchor, ANCHOR)).toEqual({ d: "2026-06-01" });
  });
});

describe("sampleAnchor is read off the fixture, not declared", () => {
  it("is the newest dateUpdated/lastUpdated in data/example/", () => {
    // The whole B2 failure was a constant that disagreed with the file it
    // claimed to describe. Recompute it here by a different route — raw regex
    // over the YAML text rather than a keyed walk of the parsed tree — so the
    // two have to agree on the same fixture.
    const raw = readFileSync(
      join(bundledSampleDir()!, "pipeline", "applications.yaml"),
      "utf-8",
    );
    const written = [...raw.matchAll(/(?:dateUpdated|lastUpdated):\s*"?(\d{4}-\d{2}-\d{2})/g)].map(
      (m) => m[1],
    );
    expect(written.length).toBeGreaterThan(5);
    expect(sampleAnchor()).toBe(written.reduce((a, b) => (a > b ? a : b)));
  });

  it("negative control: a forward-looking field cannot become the anchor", () => {
    // followUpDue and an offer's expiresDate are *supposed* to sit past the
    // anchor. If either were collected, the shift would drag the demo into the
    // past — the abandoned-search look the shift exists to prevent.
    const raw = readFileSync(
      join(bundledSampleDir()!, "pipeline", "applications.yaml"),
      "utf-8",
    );
    const forwardLooking = [
      ...raw.matchAll(/(?:followUpDue|expiresDate|startDate):\s*"(\d{4}-\d{2}-\d{2})"/g),
    ].map((m) => m[1]);
    const latestForward = forwardLooking.reduce((a, b) => (a > b ? a : b));
    expect(latestForward > sampleAnchor()).toBe(true);
  });
});

/** Nothing in the demo may look older than this, however long since release. */
const STALE_AFTER_DAYS = 60;

describe("the bundled sample, read through the store", () => {
  it("contains no date older than two months", async () => {
    process.env.CAREER_DATA_PATH = bundledSampleDir()!;
    const pipeline = await loadPipeline();
    const journal = await loadJournal();

    const all = [...datesIn(pipeline), ...datesIn(journal)];
    expect(all.length).toBeGreaterThan(10);
    const oldest = all.reduce((a, b) => (a < b ? a : b));
    expect(
      daysAgo(oldest),
      `oldest date in the bundled sample is ${oldest}, ${daysAgo(oldest)} days old`,
    ).toBeLessThan(STALE_AFTER_DAYS);
  });

  it("is only inside that window because of the shift", async () => {
    // The live negative control. The YAML on disk is already past the window
    // and gets further past it every day, so the assertion above can only pass
    // while the read-time shift is doing its job — it cannot quietly start
    // passing for the wrong reason.
    const raw = parseYaml(
      readFileSync(join(bundledSampleDir()!, "pipeline", "applications.yaml"), "utf-8"),
    );
    const onDisk = datesIn(raw).reduce((a, b) => (a < b ? a : b));
    expect(
      daysAgo(onDisk),
      `the fixture's own oldest date is ${onDisk}; if this is not yet stale the guard above proves nothing`,
    ).toBeGreaterThan(STALE_AFTER_DAYS);
  });

  it("still has work in the future to do", async () => {
    // The point of the demo is a live search: something upcoming, not a museum.
    process.env.CAREER_DATA_PATH = bundledSampleDir()!;
    const pipeline = await loadPipeline();
    const future = datesIn(pipeline).filter((d) => daysAgo(d) < 0);
    expect(future.length).toBeGreaterThan(0);
  });

  it("puts no record of the past in the future", async () => {
    // The B2 blocker. Shifting by (today − 2026-06-14) when the fixture's own
    // newest dates were 2026-07-24/08-02 pushed them past today: the dashboard
    // header read "last write 9/17/2026" and cards read "Updated tomorrow".
    // Forward-looking fields are excluded on purpose — an upcoming panel and a
    // live offer deadline are the demo working, not the demo broken.
    process.env.CAREER_DATA_PATH = bundledSampleDir()!;
    const seen = [
      ...pastDatesIn(await loadPipeline(), PIPELINE_PAST_KEYS),
      ...pastDatesIn(await loadJournal(), JOURNAL_PAST_KEYS),
    ];
    expect(seen.length, "nothing was inspected, so this proves nothing").toBeGreaterThan(20);

    const future = seen.filter((d) => daysAgo(d.date) < 0);
    expect(
      future.map((d) => `${d.key}=${d.date}`),
      `these record something that already happened but land in the future`,
    ).toEqual([]);
  });

  it("negative control: an anchor set too early does push them into the future", async () => {
    // Proves the assertion above is the anchor's doing and not a detector that
    // never fires. The fixture's oldest date stands in for a mis-set anchor,
    // which is the exact shape of the bug: a constant behind the file.
    process.env.CAREER_DATA_PATH = bundledSampleDir()!;
    const pipeline = await loadPipeline();
    const oldest = datesIn(pipeline).reduce((a, b) => (a < b ? a : b));
    const overShifted = freshenSampleDates(pipeline, new Date(), oldest);
    expect(
      pastDatesIn(overShifted, PIPELINE_PAST_KEYS).filter((d) => daysAgo(d.date) < 0).length,
    ).toBeGreaterThan(0);
  });

  it("yields at least one overdue follow-up, on both surfaces", async () => {
    // The README advertises "a next-actions panel (overdue follow-ups, upcoming
    // interviews, expiring offers)". Every follow-up in the fixture used to sit
    // weeks ahead of its own application, so the overdue tier never rendered
    // and the advertised panel could not be reached from the demo.
    process.env.CAREER_DATA_PATH = bundledSampleDir()!;
    const pipeline = await loadPipeline();

    const overdue = deriveNextActions(pipeline.applications).filter((a) => a.urgency === "overdue");
    expect(overdue.map((a) => a.label), "lite dashboard shows no overdue action").not.toEqual([]);

    const text = handleNextActions(pipeline).content[0].text;
    expect(text, "pipeline_view next_actions shows no overdue follow-up").toContain(
      "Overdue follow-up",
    );
  });

  it("negative control: a pipeline whose follow-ups are all ahead shows none", () => {
    // Both detectors must be able to stay silent, or the assertion above is a
    // tautology. Same shapes, follow-up a week out instead of a week past.
    const ahead = new Date();
    ahead.setDate(ahead.getDate() + 7);
    const iso = ahead.toISOString().slice(0, 10);
    const app = {
      id: "ctrl-001", company: "Nowhere", role: "Nobody", status: "applied" as const,
      remote: "unknown" as const, dateUpdated: new Date().toISOString(), followUpDue: iso,
      priority: "medium" as const, contacts: [], interviewRounds: [], notes: [],
      coverLetterGenerated: false,
    };
    const pipeline = { applications: [app], lastUpdated: new Date().toISOString() };

    expect(deriveNextActions(pipeline.applications).filter((a) => a.urgency === "overdue")).toEqual([]);
    expect(handleNextActions(pipeline).content[0].text).not.toContain("Overdue follow-up");
  });

  it("leaves the files on disk untouched", async () => {
    process.env.CAREER_DATA_PATH = bundledSampleDir()!;
    await loadPipeline();
    const raw = readFileSync(join(bundledSampleDir()!, "pipeline", "applications.yaml"), "utf-8");
    expect(raw).toContain("2026-06-14");
  });

  it("refuses to be written to", async () => {
    process.env.CAREER_DATA_PATH = bundledSampleDir()!;
    await expect(
      savePipelineUnlocked({ applications: [], lastUpdated: "2026-06-14T00:00:00.000Z" }),
    ).rejects.toThrow(/read-only demo/);
  });
});

describe("a user's own data is never touched", () => {
  it("loads real dates exactly as written", async () => {
    const dir = await tempDataDir();
    await mkdir(join(dir, "pipeline"), { recursive: true });
    await writeFile(
      join(dir, "pipeline", "applications.yaml"),
      [
        "applications:",
        "  - id: mine-001",
        "    company: RealCo",
        "    role: Engineer",
        "    status: applied",
        '    dateApplied: "2024-01-02"',
        '    dateUpdated: "2024-01-02T00:00:00.000Z"',
        'lastUpdated: "2024-01-02T00:00:00.000Z"',
      ].join("\n"),
    );
    process.env.CAREER_DATA_PATH = dir;

    const pipeline = await loadPipeline();
    // Old, and it stays old — this is a record of what happened, not a demo.
    expect(pipeline.applications[0].dateApplied).toBe("2024-01-02");
  });

  it("is not mistaken for the sample just because it was copied from it", async () => {
    const dir = await tempDataDir();
    expect(isBundledSampleDir(dir)).toBe(false);
  });
});
