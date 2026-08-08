import { describe, it, expect } from "vitest";
import { renderLiteDashboard, deriveNextActions } from "../dashboard-lite/render.js";
import { computeStats } from "../pipeline-stats.js";
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

  it("does not announce an interview on an application that reached offer", () => {
    // Rounds were filtered by date alone, so a future-dated round left on the
    // record kept producing "Interview in 2d" next to an offer under review.
    // The process moved past that round; it is a leftover, not a plan.
    const rounds = [{ type: "panel", date: "2026-03-27", interviewers: [], notes: "" }] as any;
    const offered = app({
      company: "Offer Co", status: "offer", interviewRounds: rounds,
      offer: { baseSalary: 100000, currency: "USD", expiresDate: "2026-03-28" } as any,
    });

    const labels = deriveNextActions([offered], FIXED_TODAY).map((a) => a.label);
    expect(labels.some((l) => l.includes("Interview"))).toBe(false);
    // The offer line still has to come through — this narrows one signal, it
    // does not silence the application.
    expect(labels.some((l) => l.includes("Offer expires"))).toBe(true);
  });

  it("negative control: the same round on the same day does show while interviewing", () => {
    const rounds = [{ type: "panel", date: "2026-03-27", interviewers: [], notes: "" }] as any;
    const live = app({ company: "Offer Co", status: "interviewing", interviewRounds: rounds });
    expect(
      deriveNextActions([live], FIXED_TODAY).some((a) => a.label.includes("Interview")),
    ).toBe(true);
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

  /**
   * The page has no build step and no browser in CI, so its layout is only ever
   * as safe as the CSS it emits. These assert the two declarations that stop a
   * long unbreakable company name from blowing the page off the right edge —
   * the failure the pre-submission audit caught at 1512px, where the rails went
   * 1263px/175px and the chart track collapsed to 3px.
   */
  describe("the two-column grid cannot be blown out by long content", () => {
    const html = renderLiteDashboard({
      applications: [app({ company: "Veridian" })],
      lastUpdated: "2026-03-25T00:00:00.000Z",
    });

    it("sizes every .grid2 track with minmax(0,1fr), never a bare 1fr", () => {
      // A grid item's default min-width is auto — its min-content — so a bare
      // `1fr` is a floor, not a cap. The item grows past its share and the
      // sibling rail gets whatever is left.
      const blocks = [...html.matchAll(/\.grid2\s*\{([^}]*)\}/g)].map((m) => m[1]);
      expect(blocks.length, "no .grid2 rule found in the emitted CSS").toBeGreaterThan(0);

      const templates = blocks
        .map((b) => /grid-template-columns\s*:\s*([^;}]+)/.exec(b)?.[1])
        .filter((t): t is string => t != null);
      expect(templates.length, "no .grid2 grid-template-columns found").toBeGreaterThan(0);

      for (const cols of templates) {
        expect(cols).toMatch(/minmax\(\s*0\s*,\s*1fr\s*\)/);
        // Any `1fr` left once the minmax() groups are removed is a bare track.
        const bare = cols.replace(/minmax\([^)]*\)/g, "");
        expect(bare, `bare 1fr track in "${cols}" — use minmax(0,1fr)`).not.toMatch(/1fr/);
      }
    });

    it("lets grid children shrink below their own content", () => {
      expect(html, ".grid2/.board children need min-width:0 to be shrinkable")
        .toMatch(/\.grid2\s*>\s*\*[^{]*\{[^}]*min-width\s*:\s*0/);
      expect(html).toMatch(/\.board\s*>\s*\*[^{]*\{[^}]*min-width\s*:\s*0/);
    });

    it("wraps unbreakable tokens instead of letting them escape their card", () => {
      // min-width:0 stops the *box* from growing; without this the glyphs
      // still spill past the card edge.
      expect(html).toMatch(/\.jc\s+\.co[^{]*\{[^}]*overflow-wrap\s*:\s*anywhere/);
    });
  });

  describe("the footer names the folder actually being served", () => {
    const pipeline: Pipeline = {
      applications: [app({ company: "Veridian" })],
      lastUpdated: "2026-03-25T00:00:00.000Z",
    };

    it("prints the data directory it was given", () => {
      // It printed `~/.career-compass` unconditionally, so anyone running with
      // CAREER_DATA_PATH set was told their data lived somewhere it did not —
      // on the one line of the page that is about where the data lives.
      const html = renderLiteDashboard(pipeline, "D:\\work\\career-data");
      expect(html).toContain("D:\\work\\career-data");
      expect(html).not.toContain("~/.career-compass");
    });

    it("negative control: names no folder when it was not told one", () => {
      // Guessing the default here is what produced the false statement.
      const html = renderLiteDashboard(pipeline);
      expect(html).toContain("Data stays local");
      expect(html).not.toContain("~/.career-compass");
    });

    it("escapes the path like any other untrusted string", () => {
      const html = renderLiteDashboard(pipeline, "/tmp/<script>alert(1)</script>");
      expect(html).not.toContain("<script>alert(1)</script>");
      expect(html).toContain("&lt;script&gt;");
    });
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
