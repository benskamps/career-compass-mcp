import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { harvestEvidence, NotARepoError, type GitReader } from "../evidence.js";
import { formatReport } from "../tools/evidence.js";

/**
 * The evidence harvester.
 *
 * The failure this module is built to avoid is not a crash — it is a confident
 * wrong résumé bullet. So the tests that matter are the ones about *honesty*:
 * that another person's commits are never counted as yours, that generated
 * directories never inflate a file count, and that the output never states an
 * achievement it cannot support.
 */

let dir: string;
const fresh = () => {
  dir = mkdtempSync(join(tmpdir(), "cc-ev-"));
  return dir;
};

/** A scripted git, so history is a fixture rather than something to construct. */
function fakeGit(script: {
  email?: string;
  branch?: string;
  totalCommits?: number;
  myCommits?: number;
  dates?: string[];
  files?: string[];
  isRepo?: boolean;
}): GitReader {
  return (_cwd, args) => {
    const joined = args.join(" ");
    if (joined.includes("rev-parse --git-dir")) return { ok: script.isRepo !== false, stdout: ".git" };
    if (joined.includes("abbrev-ref")) return { ok: true, stdout: `${script.branch ?? "main"}\n` };
    if (joined.includes("config user.email")) return { ok: true, stdout: `${script.email ?? ""}\n` };
    if (joined.includes("rev-list --count")) {
      const mine = joined.includes("--author=");
      return { ok: true, stdout: `${mine ? (script.myCommits ?? 0) : (script.totalCommits ?? 0)}\n` };
    }
    if (joined.includes("--pretty=format:%ad")) {
      const mine = joined.includes("--author=");
      return { ok: true, stdout: (mine || !script.email ? (script.dates ?? []) : []).join("\n") };
    }
    if (joined.includes("--name-only")) {
      const mine = joined.includes("--author=");
      return { ok: true, stdout: (mine || !script.email ? (script.files ?? []) : []).join("\n") };
    }
    return { ok: true, stdout: "" };
  };
}

const run = (script: Parameters<typeof fakeGit>[0], since = "2026-01-01") =>
  harvestEvidence({ projectPath: fresh(), since, git: fakeGit(script) });

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("evidence harvester — attribution", () => {
  it("states which identity it used, so a wrong one can be corrected", () => {
    const r = run({ email: "ada@example.com", myCommits: 10, totalCommits: 40, dates: ["2026-02-01"] });
    expect(r.identity).toEqual({ email: "ada@example.com", source: "repo config" });
    expect(r.notes.join(" ")).toContain("ada@example.com");
  });

  it("prefers a supplied identity over the repo's config", () => {
    const r = run({ email: "wrong@example.com", myCommits: 3, totalCommits: 9, dates: ["2026-02-01"] });
    expect(r.identity.source).toBe("repo config");

    const explicit = harvestEvidence({
      projectPath: fresh(),
      since: "2026-01-01",
      authorEmail: "right@example.com",
      git: fakeGit({ email: "wrong@example.com", myCommits: 3, totalCommits: 9 }),
    });
    expect(explicit.identity).toEqual({ email: "right@example.com", source: "supplied" });
  });

  it("reports your SHARE of commits, never the repo total as yours", () => {
    // The résumé-lie case: 12 of 300 commits must never read as "300 commits".
    const r = run({ email: "ada@example.com", myCommits: 12, totalCommits: 300, dates: ["2026-02-01"] });
    const share = r.measurements.find((m) => m.claim.includes("non-merge commits"));
    expect(share?.claim).toContain("12 of 300");
    expect(share?.claim).toContain("4%");
  });

  it("says plainly when no identity resolved, instead of reporting zeros as fact", () => {
    const r = run({ email: "", myCommits: 0, totalCommits: 50 });
    expect(r.identity.email).toBeNull();
    expect(r.notes.join(" ")).toMatch(/No author identity was resolved/);
  });
});

describe("evidence harvester — what counts as evidence", () => {
  const files = [
    "src/index.ts",
    "src/lib/parse.ts",
    "src/__tests__/parse.test.ts",
    "web/app.tsx",
    "README.md",
    "node_modules/left-pad/index.js",
    "dist/bundle.js",
    "package-lock.json",
    "target/debug/thing",
  ];

  it("excludes vendored, generated, and lockfile paths", () => {
    const r = run({ email: "a@b.c", myCommits: 5, totalCommits: 5, dates: ["2026-02-01"], files });
    const counted = r.measurements.find((m) => m.claim.includes("distinct file"));
    // 5 real files: index.ts, parse.ts, parse.test.ts, app.tsx, README.md
    expect(counted?.claim).toContain("5 distinct files");
    expect(r.languages.map((l) => l.ext)).not.toContain("js");
  });

  it("counts files, not lines — and says so", () => {
    const r = run({ email: "a@b.c", myCommits: 5, totalCommits: 5, dates: ["2026-02-01"], files });
    const langs = r.measurements.find((m) => m.claim.includes("file types"));
    expect(langs?.evidence).toMatch(/File COUNT, not lines/);
  });

  it("computes the test ratio over the filtered set", () => {
    const r = run({ email: "a@b.c", myCommits: 5, totalCommits: 5, dates: ["2026-02-01"], files });
    const tests = r.measurements.find((m) => m.claim.includes("test files"));
    expect(tests?.claim).toContain("1 of those files (20%)");
  });

  it("reports active months, not elapsed months", () => {
    // Two commits eleven months apart is not eleven months of work.
    const r = run({
      email: "a@b.c",
      myCommits: 2,
      totalCommits: 2,
      dates: ["2026-01-05", "2026-11-20"],
      files: ["src/a.ts"],
    });
    expect(r.span).toEqual({ first: "2026-01-05", last: "2026-11-20", activeMonths: 2 });
    expect(r.measurements[0].claim).toContain("2 distinct months");
  });
});

describe("evidence harvester — refusals and limits", () => {
  it("refuses a path that is not a repository", () => {
    expect(() =>
      harvestEvidence({ projectPath: fresh(), git: fakeGit({ isRepo: false }) }),
    ).toThrow(NotARepoError);
  });

  it("refuses a path that does not exist", () => {
    expect(() => harvestEvidence({ projectPath: join(tmpdir(), "no-such-dir-xyz") })).toThrow(
      NotARepoError,
    );
  });

  it("always carries the counts-are-not-impact limit", () => {
    const r = run({ email: "a@b.c", myCommits: 1, totalCommits: 1, dates: ["2026-02-01"] });
    expect(r.notes.join(" ")).toMatch(/counts are not impact/i);
  });

  it("always asks the question the log cannot answer", () => {
    const r = run({ email: "a@b.c", myCommits: 1, totalCommits: 1, dates: ["2026-02-01"] });
    expect(r.questions.join(" ")).toMatch(/ship.*real users/i);
  });
});

describe("evidence harvester — rendered output", () => {
  it("tells the model not to invent bullets or write to the KB", () => {
    const r = run({ email: "a@b.c", myCommits: 4, totalCommits: 4, dates: ["2026-02-01"], files: ["src/a.ts"] });
    const text = formatReport(r);
    expect(text).toMatch(/Do NOT turn the numbers above into résumé bullets/);
    expect(text).toMatch(/do NOT call `capture_insight` yet/);
  });

  it("degrades honestly when there is nothing to report", () => {
    const text = formatReport(run({ email: "a@b.c", myCommits: 0, totalCommits: 0 }));
    expect(text).toMatch(/Nothing measurable in this window/);
    // And must not print an empty chart or a bare zero dressed as a finding.
    expect(text).not.toMatch(/0 distinct files/);
  });

  it("shows every measurement with the command that produced it", () => {
    const r = run({ email: "a@b.c", myCommits: 4, totalCommits: 8, dates: ["2026-02-01"], files: ["src/a.ts"] });
    const text = formatReport(r);
    for (const m of r.measurements) expect(text).toContain(m.evidence);
  });
});
