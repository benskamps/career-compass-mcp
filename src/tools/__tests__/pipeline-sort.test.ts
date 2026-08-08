import { describe, it, expect } from "vitest";
import { handleList } from "../pipeline.js";
import { STATUS_ORDER } from "../../schemas/career-schema.js";
import type { Application, Pipeline } from "../../schemas/career-schema.js";
import type { PipelineListArgs } from "../../types/tool-args.js";

/**
 * Guard: `sortBy: "status"` actually sorts.
 *
 * It was one of five advertised orderings and the only one with no branch — the
 * sort comparator fell through to `return 0`, so asking for it silently handed
 * back date order. The rows looked plausible, which is the worst kind of wrong:
 * nothing to notice, no error to report.
 *
 * Funnel order, not alphabetical. The list is a pipeline view, so "sorted by
 * status" means discovered → applied → … → ghosted, the same order the
 * dashboard board puts its columns in, both now reading STATUS_ORDER.
 */

function app(over: Partial<Application>): Application {
  return {
    id: over.id ?? "x",
    company: over.company ?? "Acme",
    role: "Engineer",
    status: over.status ?? "applied",
    dateUpdated: over.dateUpdated ?? "2026-03-20T00:00:00.000Z",
    remote: "unknown",
    contacts: [],
    interviewRounds: [],
    notes: [],
    coverLetterGenerated: false,
    priority: "medium",
    ...over,
  } as Application;
}

/** Companies in the order the markdown table lists them. */
function rowOrder(text: string, companies: string[]): string[] {
  return [...companies].sort((a, b) => text.indexOf(a) - text.indexOf(b));
}

const pipeline = (apps: Application[]): Pipeline => ({
  applications: apps,
  lastUpdated: "2026-03-20T00:00:00.000Z",
});

describe("pipeline_view sortBy=status", () => {
  it("orders by funnel stage, not by date and not alphabetically", () => {
    // Deliberately adversarial: date order and alphabetical order both differ
    // from funnel order, so passing by accident is not possible.
    const apps = [
      app({ company: "Zeta", status: "offer", dateUpdated: "2026-03-01T00:00:00.000Z" }),
      app({ company: "Alpha", status: "rejected", dateUpdated: "2026-03-09T00:00:00.000Z" }),
      app({ company: "Mid", status: "discovered", dateUpdated: "2026-03-05T00:00:00.000Z" }),
      app({ company: "Beta", status: "interviewing", dateUpdated: "2026-03-07T00:00:00.000Z" }),
    ];
    const args: PipelineListArgs = { action: "list", sortBy: "status" };
    const text = handleList(args, pipeline(apps)).content[0].text;

    expect(rowOrder(text, ["Zeta", "Alpha", "Mid", "Beta"])).toEqual([
      "Mid",   // discovered
      "Beta",  // interviewing
      "Zeta",  // offer
      "Alpha", // rejected
    ]);
  });

  it("produces a different order than the default", () => {
    const apps = [
      app({ company: "Newest", status: "ghosted", dateUpdated: "2026-03-09T00:00:00.000Z" }),
      app({ company: "Oldest", status: "discovered", dateUpdated: "2026-03-01T00:00:00.000Z" }),
    ];
    const byDate = handleList({ action: "list" }, pipeline(apps)).content[0].text;
    const byStatus = handleList({ action: "list", sortBy: "status" }, pipeline(apps)).content[0].text;

    expect(rowOrder(byDate, ["Newest", "Oldest"])).toEqual(["Newest", "Oldest"]);
    expect(rowOrder(byStatus, ["Newest", "Oldest"])).toEqual(["Oldest", "Newest"]);
  });

  it("breaks ties inside a stage by most recently updated", () => {
    const apps = [
      app({ company: "Stale", status: "screening", dateUpdated: "2026-03-01T00:00:00.000Z" }),
      app({ company: "Fresh", status: "screening", dateUpdated: "2026-03-09T00:00:00.000Z" }),
    ];
    const text = handleList({ action: "list", sortBy: "status" }, pipeline(apps)).content[0].text;
    expect(rowOrder(text, ["Stale", "Fresh"])).toEqual(["Fresh", "Stale"]);
  });

  it("covers every declared status", () => {
    // One application per stage, fed in reverse so input order cannot be
    // mistaken for the result. The emitted order must be the funnel order.
    const apps = STATUS_ORDER.map((s, i) => app({ id: `a${i}`, company: `Co${i}`, status: s })).reverse();
    const text = handleList({ action: "list", sortBy: "status", limit: 50 }, pipeline(apps)).content[0].text;
    const names = apps.map((a) => a.company);
    expect(rowOrder(text, names)).toEqual([...names].reverse());
  });
});
