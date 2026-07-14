import { describe, it, expect } from "vitest";
import { formatSignalDigest } from "../signal-digest.js";
import type { JournalEntry } from "../../schemas/career-schema.js";

function entry(over: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: over.id ?? "id",
    date: over.date ?? "2026-07-14T00:00:00.000Z",
    type: over.type ?? "note",
    summary: over.summary ?? "a takeaway",
    signals: over.signals ?? [],
    source: over.source ?? "manual",
    ...over,
  };
}

describe("formatSignalDigest", () => {
  it("returns an empty string for an empty or missing journal (no stray heading)", () => {
    expect(formatSignalDigest([])).toBe("");
    expect(formatSignalDigest(undefined)).toBe("");
  });

  it("renders a labeled section with the entry summary and metadata", () => {
    const out = formatSignalDigest([
      entry({ type: "fit_signal", company: "Veridian Health", summary: "Strong ops match", signals: ["ops-scale"], sentiment: "neutral" }),
    ]);
    expect(out).toContain("## Recent Career Signals");
    expect(out).toContain("Strong ops match");
    expect(out).toContain("fit_signal");
    expect(out).toContain("Veridian Health");
    expect(out).toContain("ops-scale");
    expect(out).toContain("(neutral)");
  });

  it("shows most-recent-first and respects the limit", () => {
    const js = Array.from({ length: 10 }, (_, i) =>
      entry({ id: `e${i}`, summary: `entry-${i}`, date: `2026-07-${String(i + 1).padStart(2, "0")}T00:00:00.000Z` }),
    );
    const out = formatSignalDigest(js, 3);
    // header reflects window vs total
    expect(out).toContain("3 of 10");
    // newest (entry-9) present, older-than-window (entry-6) absent
    expect(out).toContain("entry-9");
    expect(out).not.toContain("entry-6");
    // ordering: entry-9 appears before entry-8
    expect(out.indexOf("entry-9")).toBeLessThan(out.indexOf("entry-8"));
  });

  it("tallies signals that recur across the WHOLE journal, not just the window", () => {
    const js = [
      entry({ id: "a", signals: ["healthcare-domain"], date: "2026-01-01T00:00:00.000Z" }),
      entry({ id: "b", signals: ["healthcare-domain", "stakeholder-management"] }),
      entry({ id: "c", signals: ["stakeholder-management"] }),
      entry({ id: "d", signals: ["healthcare-domain"] }),
      entry({ id: "e", signals: ["one-off"] }),
    ];
    const out = formatSignalDigest(js, 2); // window smaller than journal
    expect(out).toContain("**Recurring signals:**");
    expect(out).toContain("healthcare-domain ×3");
    expect(out).toContain("stakeholder-management ×2");
    expect(out).not.toContain("one-off ×"); // appears once → not recurring
  });
});
