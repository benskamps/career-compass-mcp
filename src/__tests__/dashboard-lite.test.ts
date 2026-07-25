import { describe, it, expect } from "vitest";
import { renderLiteDashboard, computeStats, deriveNextActions } from "../dashboard-lite/render.js";
import type { Application, Pipeline } from "../schemas/career-schema.js";

/**
 * Unit tests for the zero-build "lite" dashboard renderer.
 *
 * These exercise the pure rendering + derivation logic (no server, no disk) so
 * they run fast and deterministically. The server (server.ts) is a thin HTTP
 * wrapper that calls loadPipeline() + renderLiteDashboard(), both covered
 * elsewhere / here respectively.
 */

function app(over: Partial<Application>): Application {
  return {
    id: over.id ?? "x", company: over.company ?? "Acme", role: over.role ?? "Engineer",
    status: over.status ?? "applied", dateUpdated: over.dateUpdated ?? "2026-03-20T00:00:00.000Z",
    remote: "unknown", contacts: [], interviewRounds: [], notes: [],
    coverLetterGenerated: false, priority: over.priority ?? "medium",
    ...over,
  } as Application;
}

const FIXED_TODAY = new Date("2026-03-25T00:00:00.000Z");

describe("computeStats", () => {
  it("counts totals, active, in-conversation, and offers", () => {
    const apps = [
      app({ status: "discovered" }),
      app({ status: "applied" }),
      app({ status: "screening" }),
      app({ status: "interviewing" }),
      app({ status: "offer" }),
      app({ status: "rejected" }),
    ];
    const s = computeStats(apps);
    expect(s.total).toBe(6);
    expect(s.active).toBe(5); // all except rejected
    expect(s.inConversation).toBe(2); // screening + interviewing
    expect(s.offers).toBe(1);
  });

  it("computes response and ghost rates over applied-or-later apps", () => {
    const apps = [
      app({ status: "applied" }),   // applied, no response
      app({ status: "screening" }), // responded
      app({ status: "ghosted" }),   // ghosted
      app({ status: "discovered" }),// excluded from denominator
    ];
    const s = computeStats(apps);
    // denominator = 3 (applied, screening, ghosted); responded = 1 (screening)
    expect(s.responseRate).toBe(Math.round((1 / 3) * 100));
    expect(s.ghostRate).toBe(Math.round((1 / 3) * 100));
  });

  it("returns zeroed rates for an empty pipeline", () => {
    const s = computeStats([]);
    expect(s).toMatchObject({ total: 0, active: 0, responseRate: 0, ghostRate: 0 });
  });
});

describe("deriveNextActions", () => {
  it("flags overdue follow-ups and sorts them first", () => {
    const apps = [
      app({ company: "Soon", status: "applied", followUpDue: "2026-03-26" }),   // in 1d
      app({ company: "Overdue", status: "applied", followUpDue: "2026-03-20" }), // 5d overdue
    ];
    const actions = deriveNextActions(apps, FIXED_TODAY);
    expect(actions[0].urgency).toBe("overdue");
    expect(actions[0].label).toContain("Overdue");
  });

  it("ignores follow-ups on closed applications", () => {
    const apps = [app({ status: "rejected", followUpDue: "2026-03-01" })];
    expect(deriveNextActions(apps, FIXED_TODAY)).toHaveLength(0);
  });

  it("surfaces upcoming interviews and expiring offers", () => {
    const apps = [
      app({ company: "Interview Co", status: "interviewing", interviewRounds: [{ type: "panel", date: "2026-03-27", interviewers: [], notes: "" }] as any }),
      app({ company: "Offer Co", status: "offer", offer: { baseSalary: 100000, currency: "USD", expiresDate: "2026-03-28" } as any }),
    ];
    const labels = deriveNextActions(apps, FIXED_TODAY).map((a) => a.label);
    expect(labels.some((l) => l.includes("Interview"))).toBe(true);
    expect(labels.some((l) => l.includes("Offer expires"))).toBe(true);
  });
});

describe("renderLiteDashboard", () => {
  it("renders a self-contained HTML document", () => {
    const pipeline: Pipeline = { applications: [app({ company: "Veridian" })], lastUpdated: "2026-03-25T00:00:00.000Z" };
    const html = renderLiteDashboard(pipeline);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("Veridian");
    // Fully inlined — the page must never fetch anything. The claim being
    // tested is "no network request", not "no <link> tag": a data: URI is
    // carried in the document itself, so the inline favicon is exactly as
    // self-contained as the inline <style>. Anything with a real href is not.
    expect(html).not.toMatch(/<script[^>]+src=/i);
    const externalHrefs = [...html.matchAll(/<link[^>]+href="([^"]*)"/gi)]
      .map((m) => m[1])
      .filter((href) => !href.startsWith("data:"));
    expect(
      externalHrefs,
      `these <link> hrefs would hit the network: ${externalHrefs.join(", ")}`,
    ).toEqual([]);
  });

  it("shows the empty state when there are no applications", () => {
    const html = renderLiteDashboard({ applications: [], lastUpdated: "2026-03-25T00:00:00.000Z" });
    expect(html).toContain("Your pipeline is empty");
  });

  it("escapes user-controlled fields to prevent HTML injection", () => {
    const pipeline: Pipeline = {
      applications: [app({ company: "<img src=x onerror=alert(1)>", role: "Dev" })],
      lastUpdated: "2026-03-25T00:00:00.000Z",
    };
    const html = renderLiteDashboard(pipeline);
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
});
