import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  SAMPLE_ANCHOR,
  bundledSampleDir,
  freshenSampleDates,
  isBundledSampleDir,
} from "../sample-data.js";
import { loadPipeline, loadJournal, savePipeline } from "../storage/file-store.js";

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

function daysAgo(iso: string, today = new Date()): number {
  const [y, m, d] = iso.split("-").map(Number);
  const midnight = Date.UTC(today.getFullYear(), today.getMonth() + 1 - 1, today.getDate());
  return Math.round((midnight - Date.UTC(y, m - 1, d)) / 86400000);
}

describe("freshenSampleDates", () => {
  // One day after the anchor: every date should move by exactly one day.
  const oneDayOn = new Date(`${SAMPLE_ANCHOR}T12:00:00`);
  oneDayOn.setDate(oneDayOn.getDate() + 1);

  it("shifts date-only fields", () => {
    expect(freshenSampleDates({ followUpDue: "2026-07-26" }, oneDayOn)).toEqual({
      followUpDue: "2026-07-27",
    });
  });

  it("shifts the day of a timestamp and keeps the time", () => {
    expect(freshenSampleDates({ dateUpdated: "2026-06-13T14:22:00.000Z" }, oneDayOn)).toEqual({
      dateUpdated: "2026-06-14T14:22:00.000Z",
    });
  });

  it("shifts dates written inside note text", () => {
    expect(freshenSampleDates(["[2026-06-01] Tailored resume."], oneDayOn)).toEqual([
      "[2026-06-02] Tailored resume.",
    ]);
  });

  it("leaves YYYY-MM employment history alone", () => {
    // Alex started that job in March 2021 and always will have.
    expect(freshenSampleDates({ startDate: "2021-03", endDate: "present" }, oneDayOn)).toEqual({
      startDate: "2021-03",
      endDate: "present",
    });
  });

  it("does not mutate its input", () => {
    const original = { dateApplied: "2026-06-01" };
    freshenSampleDates(original, oneDayOn);
    expect(original.dateApplied).toBe("2026-06-01");
  });

  it("is a no-op on the anchor day itself", () => {
    const onAnchor = new Date(`${SAMPLE_ANCHOR}T12:00:00`);
    expect(freshenSampleDates({ d: "2026-06-01" }, onAnchor)).toEqual({ d: "2026-06-01" });
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

  it("leaves the files on disk untouched", async () => {
    process.env.CAREER_DATA_PATH = bundledSampleDir()!;
    await loadPipeline();
    const raw = readFileSync(join(bundledSampleDir()!, "pipeline", "applications.yaml"), "utf-8");
    expect(raw).toContain("2026-06-14");
  });

  it("refuses to be written to", async () => {
    process.env.CAREER_DATA_PATH = bundledSampleDir()!;
    await expect(
      savePipeline({ applications: [], lastUpdated: "2026-06-14T00:00:00.000Z" }),
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
