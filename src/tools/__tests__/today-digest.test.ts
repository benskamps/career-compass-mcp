import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parse } from "yaml";
import { buildTodayDigest } from "../today-digest.js";
import { clockNow } from "../../clock.js";
import type { Application, Pipeline } from "../../schemas/career-schema.js";

const sample = parse(readFileSync(join(__dirname, "../../../data/example/pipeline/applications.yaml"), "utf-8")) as Pipeline;
const text = (p: Pipeline, now: Date) => buildTodayDigest(p, now).content[0].text;

function app(over: Partial<Application>): Application {
  return {
    id: "x", company: "Acme", role: "Engineer", status: "applied", priority: "medium",
    dateUpdated: new Date(2026, 5, 16, 8).toISOString(), remote: "unknown",
    contacts: [], interviewRounds: [], notes: [], coverLetterGenerated: false, ...over,
  } as Application;
}
const pipe = (...apps: Application[]): Pipeline => ({ applications: apps, lastUpdated: "2026-06-16T00:00:00.000Z" });
const JUNE_16 = new Date(2026, 5, 16, 9);

describe("today digest on the sample pipeline, as written (2026-06-16)", () => {
  const out = text(sample, JUNE_16);

  it("starts with the panel tomorrow", () => {
    const start = out.split("## Also today")[0];
    expect(start).toContain("## Start here");
    expect(start).toContain("Veridian Health / Director of Operations: panel tomorrow (2026-06-17");
    expect(start).toContain("prep me for my Veridian Health panel");
  });

  it("lists the overdue follow-up with who to nudge, and the offer with its deadline", () => {
    expect(out).toContain("Meridian Logistics Group / Head of Customer Success: due 2026-06-12, 4 days ago");
    expect(out).toContain("Send Marcus Chen a two-line check-in");
    expect(out).toContain("Brightpath Health / Sr. Program Manager: expires in 11 days (2026-06-27");
  });

  it("puts tomorrow's follow-up under Coming up, and names each application once", () => {
    expect(out.split("## Coming up")[1]).toContain("Follow-up due tomorrow — Stratos Cloud");
    for (const id of ["demo-001", "demo-002", "demo-005", "demo-006"]) {
      expect(out.split(`ID: ${id}`).length - 1, id).toBe(1);
    }
    // Closed or too early to chase: rejected, withdrawn, applied 3 days ago.
    for (const id of ["demo-003", "demo-007", "demo-008"]) expect(out).not.toContain(`ID: ${id}`);
  });
});

describe("today digest on the same pipeline four months on", () => {
  const out = text(sample, new Date(2026, 9, 4, 9));

  it("leads with the expired offer, not a stale follow-up", () => {
    const start = out.split("## Also today")[0];
    expect(start).toContain("Offer deadline passed");
    expect(start).toContain("Brightpath Health");
  });

  it("groups month-long silences into one decision and offers to mark them ghosted", () => {
    const quiet = out.split("\n").filter((l) => l.includes("Gone quiet"));
    expect(quiet).toHaveLength(1);
    expect(quiet[0]).toContain("4 applications");
    expect(out).toContain("mark the rest ghosted");
    expect(out).not.toContain("Overdue follow-up");
  });

  it("surfaces a discovered role left unapplied", () => {
    expect(out).toContain("Not applied yet — Canopy Analytics");
  });
});

describe("today digest edge cases", () => {
  it("an offer expiring in two days outranks an interview next week", () => {
    const out = text(pipe(
      app({ id: "iv", status: "interviewing", interviewRounds: [{ type: "final", date: "2026-06-21", interviewers: [] }] }),
      app({ id: "of", status: "offer", offer: { expiresDate: "2026-06-18", currency: "USD", benefits: [] } }),
    ), JUNE_16);
    expect(out.split("## Also today")[0]).toContain("ID: of");
    expect(out).toContain("final in 5 days");
  });

  it("a follow-up date in the future holds off the silence nag", () => {
    const old = new Date(2026, 5, 6).toISOString();
    expect(text(pipe(app({ id: "w", dateUpdated: old, followUpDue: "2026-06-25" })), JUNE_16)).not.toContain("ID: w");
    expect(text(pipe(app({ id: "n", dateUpdated: old })), JUNE_16)).toContain("applied 10d ago");
  });

  it("says plainly when nothing is due, with a forward move", () => {
    const out = text(pipe(app({ id: "fresh" })), JUNE_16);
    expect(out).toContain("Nothing needs you today. Your 1 active application is inside normal wait windows.");
    expect(out).toContain("**Start here:**");
  });

  it("nudges an empty pipeline toward its first application", () => {
    const out = text(pipe(), JUNE_16);
    expect(out).toContain("Nothing tracked yet");
    expect(out).toContain("track this");
  });
});

describe("clockNow", () => {
  afterEach(() => { delete process.env.CAREER_COMPASS_TODAY; });
  it("is pinned by CAREER_COMPASS_TODAY and ignores anything that is not a date", () => {
    process.env.CAREER_COMPASS_TODAY = "2026-06-16";
    expect(clockNow().getDate()).toBe(16);
    expect(clockNow().getMonth()).toBe(5);
    process.env.CAREER_COMPASS_TODAY = "soon";
    expect(Math.abs(clockNow().getTime() - Date.now())).toBeLessThan(5000);
  });
});
