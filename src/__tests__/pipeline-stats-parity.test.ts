import { describe, it, expect } from "vitest";
import { handleStats } from "../tools/pipeline.js";
import { renderLiteDashboard } from "../dashboard-lite/render.js";
import { computeStats } from "../pipeline-stats.js";
import type { Application, ApplicationStatus, Pipeline } from "../schemas/career-schema.js";

/**
 * One pipeline, one response rate, whichever surface you ask.
 *
 * `pipeline_view action=stats` and the dashboard both put a "response rate" in
 * front of the user, and they computed it differently: the tool did
 * (total − applied) / total, the dashboard did responded / sent. On the bundled
 * sample that is 75% in Claude and 71% in the browser, for the same eight
 * applications, with nothing on either surface to say which is the real number.
 *
 * The arithmetic now lives in one module. This holds the two surfaces to it on
 * a pipeline built specifically so the old formula and the correct one
 * disagree — a fixture where they happen to coincide (no `discovered` rows)
 * proves nothing, and the pre-existing unit test used exactly such a fixture,
 * which is why the bug survived it.
 */

function makeApp(id: string, status: ApplicationStatus): Application {
  return {
    id, company: `Co-${id}`, role: "Engineer", status,
    dateApplied: status === "discovered" ? undefined : "2026-03-01",
    dateDiscovered: status === "discovered" ? "2026-03-01" : undefined,
    dateUpdated: "2026-03-01T00:00:00.000Z",
    priority: "medium", contacts: [], interviewRounds: [], notes: [],
    coverLetterGenerated: false, remote: "unknown",
  };
}

/**
 * The shape of the bundled sample: eight applications, one never sent, one
 * withdrawn. Both are what the old formula got wrong.
 */
const APPS: Application[] = [
  makeApp("a1", "discovered"),
  makeApp("a2", "applied"),
  makeApp("a3", "applied"),
  makeApp("a4", "screening"),
  makeApp("a5", "interviewing"),
  makeApp("a6", "offer"),
  makeApp("a7", "rejected"),
  makeApp("a8", "withdrawn"),
];
const PIPELINE: Pipeline = { applications: APPS, lastUpdated: "2026-03-01T00:00:00.000Z" };

/** What `handleStats` used to do, kept only to prove the fixture discriminates. */
function legacyResponseRate(apps: Application[]): number {
  const total = apps.length;
  if (total === 0) return 0;
  return Math.round(((total - apps.filter((a) => a.status === "applied").length) / total) * 100);
}

/** The `NN%` after a label — the MCP tool writes "Response rate:** 71%". */
function percentAfter(text: string, label: string): number | null {
  const m = new RegExp(`${label}[^%\\d]*(\\d+)%`).exec(text);
  return m ? Number(m[1]) : null;
}

/** The `NN%` before a label — a KPI card puts its value above its caption. */
function percentBefore(text: string, label: string): number | null {
  const m = new RegExp(`(\\d+)%[^%\\d]*${label}`).exec(text);
  return m ? Number(m[1]) : null;
}

describe("response rate is one number across both surfaces", () => {
  const mcpText = handleStats(PIPELINE).content[0].text;
  const html = renderLiteDashboard(PIPELINE);
  const expected = computeStats(APPS).responseRate;

  it("negative control: this fixture is one the two formulas disagree on", () => {
    // 7 sent, 5 answered = 71%. The old formula: (8 − 2) / 8 = 75%. If these
    // ever coincide the assertions below stop testing anything.
    expect(legacyResponseRate(APPS)).toBe(75);
    expect(expected).toBe(71);
    expect(legacyResponseRate(APPS)).not.toBe(expected);
  });

  it("pipeline_view stats reports the shared number", () => {
    expect(percentAfter(mcpText, "Response rate")).toBe(expected);
  });

  it("the lite dashboard reports the shared number", () => {
    expect(html).toContain(`${expected}%`);
  });

  it("the two surfaces agree", () => {
    const fromTool = percentAfter(mcpText, "Response rate");
    const fromPage = percentBefore(html.replace(/<[^>]+>/g, " "), "Response rate");
    expect(fromTool, "no response rate found in the tool output").not.toBeNull();
    expect(fromPage, "no response rate found on the page").not.toBeNull();
    expect(fromPage).toBe(fromTool);
  });

  it("a role you only discovered is not counted as an employer response", () => {
    // The specific arithmetic error: `discovered` sat in both the numerator
    // (as "not applied") and the denominator.
    const withoutDiscovered = APPS.filter((a) => a.status !== "discovered");
    expect(computeStats(withoutDiscovered).responseRate).toBe(expected);
    expect(computeStats(APPS).sent).toBe(withoutDiscovered.length);
  });

  it("ghost rate divides by what was sent too", () => {
    const withGhost = [...APPS, makeApp("a9", "ghosted")];
    // 8 sent, 1 silent.
    expect(computeStats(withGhost).ghostRate).toBe(Math.round((1 / 8) * 100));
    expect(percentAfter(handleStats({ ...PIPELINE, applications: withGhost }).content[0].text, "Ghost rate"))
      .toBe(computeStats(withGhost).ghostRate);
  });

  it("an empty pipeline is 0%, not a division by zero", () => {
    const empty: Pipeline = { applications: [], lastUpdated: "2026-03-01T00:00:00.000Z" };
    expect(computeStats([])).toMatchObject({ total: 0, sent: 0, responseRate: 0, ghostRate: 0 });
    expect(percentAfter(handleStats(empty).content[0].text, "Response rate")).toBe(0);
  });
});
