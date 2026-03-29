import { describe, it, expect } from "vitest";
import { computeAnalytics } from "./analytics";
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
