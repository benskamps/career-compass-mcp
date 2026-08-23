import { describe, it, expect } from "vitest";
import { rankApplications } from "../completions.js";
import type { Application } from "../schemas/career-schema.js";

/**
 * Argument completion for the one argument the model cannot guess.
 *
 * The ranking is the whole feature: a list of twenty ids in arbitrary order is
 * not meaningfully better than no list. What makes it useful is that the row the
 * user means is at the top, and the user means the *company*, not the id.
 */

const app = (over: Partial<Application>): Application =>
  ({
    id: "x",
    company: "X",
    role: "Engineer",
    status: "applied",
    dateApplied: "2026-01-01",
    dateUpdated: "2026-01-01",
    ...over,
  }) as Application;

const APPS: Application[] = [
  app({ id: "acme-staff-eng-2026-03", company: "Acme", role: "Staff Engineer", dateUpdated: "2026-03-01" }),
  app({ id: "globex-pm-2026-08", company: "Globex", role: "Product Manager", dateUpdated: "2026-08-14" }),
  app({ id: "initech-senior-eng-2026-07", company: "Initech", role: "Senior Engineer", dateUpdated: "2026-07-02" }),
  app({ id: "acme-eng-mgr-2026-08", company: "Acme", role: "Engineering Manager", dateUpdated: "2026-08-20" }),
];

const ids = (partial: string) => rankApplications(APPS, partial).map((a) => a.id);

describe("application-id completion", () => {
  it("matches on COMPANY, not just the id prefix", () => {
    // The motivating case. Ids look like `acme-staff-eng-2026-03`; a user
    // thinking "acme" would get nothing from a naive id-prefix match on a
    // scheme that ever changes.
    expect(ids("acme")).toEqual(["acme-eng-mgr-2026-08", "acme-staff-eng-2026-03"]);
  });

  it("puts the most recently updated first among equal matches", () => {
    // What you are updating is almost always what you last touched.
    const [first] = ids("acme");
    expect(first).toBe("acme-eng-mgr-2026-08");
  });

  it("ranks a prefix hit above a substring hit", () => {
    const ranked = ids("eng");
    // "eng" appears inside several ids and roles; nothing starts with it, so
    // ordering falls to recency — but every match must still be returned.
    expect(ranked.length).toBeGreaterThan(1);
    expect(new Set(ranked).size).toBe(ranked.length);
  });

  it("matches the role when neither id nor company does", () => {
    expect(ids("product")).toEqual(["globex-pm-2026-08"]);
  });

  it("is case-insensitive and tolerates padding", () => {
    expect(ids("  ACME  ")).toEqual(ids("acme"));
  });

  it("returns everything for an empty partial, newest first", () => {
    // A host asks with "" the moment the field is focused; that is the
    // most valuable moment to answer well.
    expect(ids("")).toEqual([
      "acme-eng-mgr-2026-08",
      "globex-pm-2026-08",
      "initech-senior-eng-2026-07",
      "acme-staff-eng-2026-03",
    ]);
  });

  it("returns nothing rather than everything for a miss", () => {
    // A completion list that ignores the query is worse than an empty one: it
    // invites the model to pick a plausible-looking wrong id for a DESTRUCTIVE
    // update.
    expect(ids("zzzz-no-such-company")).toEqual([]);
  });

  it("survives an empty pipeline", () => {
    expect(rankApplications([], "acme")).toEqual([]);
    expect(rankApplications([], "")).toEqual([]);
  });

  it("is deterministic when score and recency tie", () => {
    const tied = [
      app({ id: "b-co-2026-05", company: "Tie", dateUpdated: "2026-05-05" }),
      app({ id: "a-co-2026-05", company: "Tie", dateUpdated: "2026-05-05" }),
    ];
    expect(rankApplications(tied, "tie").map((a) => a.id)).toEqual(["a-co-2026-05", "b-co-2026-05"]);
  });
});
