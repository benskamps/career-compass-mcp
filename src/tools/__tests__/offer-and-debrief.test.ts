import { describe, it, expect, vi } from "vitest";
import { handleUpdate } from "../pipeline.js";
import { buildTodayDigest } from "../today-digest.js";
import type { Application, Pipeline } from "../../schemas/career-schema.js";
import type { PipelineUpdateArgs } from "../../types/tool-args.js";

vi.mock("../../storage/file-store.js", () => ({
  loadPipeline: vi.fn(),
  mutatePipeline: vi.fn(),
  isCorruptDataError: () => false,
}));

const JUNE_16 = new Date(2026, 5, 16, 9);

function app(over: Partial<Application> = {}): Application {
  return {
    id: "a1", company: "Brightpath", role: "Program Manager", status: "offer", priority: "medium",
    dateUpdated: new Date(2026, 5, 10, 8).toISOString(), remote: "unknown",
    contacts: [], interviewRounds: [], notes: [], coverLetterGenerated: false, ...over,
  } as Application;
}
const pipe = (...apps: Application[]): Pipeline => ({ applications: apps, lastUpdated: "2026-06-16T00:00:00.000Z" });
const update = (p: Pipeline, args: Omit<PipelineUpdateArgs, "action" | "id">) =>
  handleUpdate({ action: "update", id: "a1", ...args } as PipelineUpdateArgs, p);
const digest = (p: Pipeline) => buildTodayDigest(p, JUNE_16).content[0].text;

describe("recording an offer through pipeline_update", () => {
  it("writes the offer, and the digest leads with its deadline", async () => {
    const p = pipe(app());
    const res = await update(p, { offerBaseSalary: 165000, offerExpiresDate: "2026-06-18" });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain("base 165,000 USD");
    expect(res.content[0].text).toContain("answer due 2026-06-18");
    expect(p.applications[0].offer).toMatchObject({ baseSalary: 165000, expiresDate: "2026-06-18", currency: "USD" });
    // Before: no tool could set this, so the digest said "no deadline recorded".
    const start = digest(p).split("## Also today")[0];
    expect(start).toContain("Pending offer");
    expect(start).toContain("expires in 2 days (2026-06-18");
  });

  it("merges into an existing offer instead of replacing it", async () => {
    const p = pipe(app({ offer: { baseSalary: 150000, currency: "USD", benefits: [] } }));
    await update(p, { offerExpiresDate: "2026-06-20" });
    expect(p.applications[0].offer).toMatchObject({ baseSalary: 150000, expiresDate: "2026-06-20" });
  });

  it("refuses a date that isn't YYYY-MM-DD and changes nothing", async () => {
    const p = pipe(app());
    const res = await update(p, { notes: "called", offerExpiresDate: "next Friday" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("offerExpiresDate");
    expect(p.applications[0].offer).toBeUndefined();
    expect(p.applications[0].notes).toEqual([]);
  });
});

describe("round outcomes", () => {
  it("attaches to the round logged in the same call", async () => {
    const p = pipe(app({ status: "interviewing" }));
    await update(p, { interviewType: "panel", interviewDate: "2026-06-12", interviewers: ["Priya"], roundOutcome: "moved to final" });
    expect(p.applications[0].interviewRounds[0]).toMatchObject({ type: "panel", interviewers: ["Priya"], outcome: "moved to final" });
  });

  it("attaches to the latest round when none is logged", async () => {
    const p = pipe(app({ status: "interviewing", interviewRounds: [{ type: "phone_screen", date: "2026-06-01", interviewers: [] }] }));
    await update(p, { roundOutcome: "passed" });
    expect(p.applications[0].interviewRounds[0].outcome).toBe("passed");
  });

  it("refuses an outcome when there is no round to attach it to", async () => {
    const p = pipe(app({ status: "applied" }));
    const res = await update(p, { roundOutcome: "went well" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("interviewType");
  });
});

describe("the day after an interview", () => {
  const yesterday = (over: Partial<Application> = {}) => app({
    status: "interviewing",
    dateUpdated: new Date(2026, 5, 6, 8).toISOString(),
    interviewRounds: [{ type: "panel", date: "2026-06-15", interviewers: [] }],
    ...over,
  });

  it("leads with a debrief and thank-you, not a status chase", () => {
    const out = digest(pipe(yesterday()));
    const start = out.split("## Also today")[0];
    expect(start).toContain("Debrief");
    expect(start).toContain("panel yesterday");
    expect(start).toContain("thank-you");
    expect(out).not.toContain("Check status");
  });

  it("drops the debrief once the round has an outcome", () => {
    const out = digest(pipe(yesterday({ interviewRounds: [{ type: "panel", date: "2026-06-15", interviewers: [], outcome: "moved on" }] })));
    expect(out).not.toContain("Debrief");
  });

  it("still asks for a timeline once the last round is over a week old", () => {
    const out = digest(pipe(yesterday({ interviewRounds: [{ type: "panel", date: "2026-06-05", interviewers: [] }] })));
    expect(out).not.toContain("Debrief");
    expect(out).toContain("Check status");
  });
});
