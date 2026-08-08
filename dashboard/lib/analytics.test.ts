import { describe, it, expect } from "vitest";
import { computeAnalytics } from "./analytics";
import { computeStats } from "@shared/dashboard-lite/render";
import type { Application } from "@shared/schemas/career-schema";

const makeApp = (overrides: Partial<Application>): Application => ({
  id: "test", company: "TestCo", role: "Tester", status: "applied",
  dateUpdated: "2026-03-20T00:00:00.000Z", contacts: [], interviewRounds: [],
  notes: [], coverLetterGenerated: false, remote: "unknown", priority: "medium",
  ...overrides,
});

describe("computeAnalytics", () => {
  it("returns zeros for empty pipeline", () => {
    const result = computeAnalytics([]);
    expect(result.totalApplications).toBe(0);
    expect(result.responseRate).toBe(0);
    expect(result.activeCount).toBe(0);
  });

  it("computes response rate correctly", () => {
    const apps = [
      makeApp({ id: "1", status: "applied" }),
      makeApp({ id: "2", status: "screening" }),
      makeApp({ id: "3", status: "interviewing" }),
      makeApp({ id: "4", status: "rejected" }),
    ];
    const result = computeAnalytics(apps);
    expect(result.totalApplications).toBe(4);
    expect(result.responseRate).toBe(75);
  });

  /**
   * The fixture that caught the bug: a pipeline where "every row" and "the ones
   * I actually sent" are different numbers, and where one application went
   * unanswered. Divide by 5 instead of 4 and this reads 40%; count the ghost as
   * a reply and it reads 75%.
   */
  const MIXED: Application[] = [
    makeApp({ id: "1", status: "discovered" }),   // bookmarked, never sent
    makeApp({ id: "2", status: "applied" }),      // sent, no reply yet
    makeApp({ id: "3", status: "ghosted" }),      // sent, never answered
    makeApp({ id: "4", status: "screening" }),    // sent, replied
    makeApp({ id: "5", status: "interviewing" }), // sent, replied
  ];

  it("divides responses by applications sent, not by every row in the pipeline", () => {
    // sent = 4 (everything but `discovered`); responded = 2 (screening,
    // interviewing). `ghosted` is silence, not an answer.
    expect(computeAnalytics(MIXED).responseRate).toBe(50);
  });

  it("agrees with the lite dashboard on the same pipeline", () => {
    // These two surfaces ship the same stat under the same label and used to
    // print 63% and 71% side by side. Whichever number is right, one of them
    // was lying to somebody — so they are pinned to each other here.
    expect(computeAnalytics(MIXED).responseRate).toBe(computeStats(MIXED).responseRate);
  });

  it("excludes never-sent applications from per-source response rates too", () => {
    const apps = [
      makeApp({ id: "1", source: "LinkedIn", status: "discovered" }),
      makeApp({ id: "2", source: "LinkedIn", status: "applied" }),
      makeApp({ id: "3", source: "LinkedIn", status: "screening" }),
    ];
    const linkedin = computeAnalytics(apps).sourceStats.find((s) => s.source === "LinkedIn");
    expect(linkedin?.count).toBe(3);   // the card still shows all three
    expect(linkedin?.responseRate).toBe(50); // but the rate is 1 of the 2 sent
  });

  it("counts active applications correctly", () => {
    const apps = [
      makeApp({ id: "1", status: "applied" }),
      makeApp({ id: "2", status: "rejected" }),
      makeApp({ id: "3", status: "interviewing" }),
      makeApp({ id: "4", status: "ghosted" }),
    ];
    const result = computeAnalytics(apps);
    expect(result.activeCount).toBe(2);
  });

  it("groups by source correctly", () => {
    const apps = [
      makeApp({ id: "1", source: "LinkedIn", status: "screening" }),
      makeApp({ id: "2", source: "LinkedIn", status: "applied" }),
      makeApp({ id: "3", source: "Referral", status: "interviewing" }),
    ];
    const result = computeAnalytics(apps);
    expect(result.sourceStats).toHaveLength(2);
    const linkedin = result.sourceStats.find((s) => s.source === "LinkedIn");
    expect(linkedin?.count).toBe(2);
    expect(linkedin?.responseRate).toBe(50);
  });
});
