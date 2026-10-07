import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../server.js";
import { saveCareerSection, savePipelineUnlocked, listCareerBackups } from "../../storage/file-store.js";
import { noCareerDataMessage } from "../../empty-state.js";
import { nodeVersionWarning } from "../../node-version.js";
import { runningSurface, FEEDBACK_LINE } from "../doctor.js";
import { formatSignalDigest, INFERRED_TAG } from "../signal-digest.js";
import { TRUTH_RULE } from "../truth-rule.js";
import { whatSavingBought } from "../career-kb.js";
import { PKG_VERSION } from "../../version.js";
import type { Application, JournalEntry, Pipeline } from "../../schemas/career-schema.js";

/**
 * The code half of the council 2.9.7 deployment (C1–C7, C9–C12, C15, C25, C27,
 * C30), driven through the real server on a throwaway data directory.
 */

let dataDir: string;
let original: string | undefined;
let client: Client;
let server: ReturnType<typeof createServer>;

beforeEach(async () => {
  original = process.env.CAREER_DATA_PATH;
  dataDir = mkdtempSync(path.join(tmpdir(), "cc-council-"));
  process.env.CAREER_DATA_PATH = dataDir;
  server = createServer({
    doctor: { probeDashboard: async () => ({ reachable: false, reason: "nothing is listening" }) },
  });
  client = new Client({ name: "council-test", version: "0.0.0" });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(s), client.connect(c)]);
});

afterEach(async () => {
  await client.close();
  await server.close();
  if (original === undefined) delete process.env.CAREER_DATA_PATH;
  else process.env.CAREER_DATA_PATH = original;
  rmSync(dataDir, { recursive: true, force: true });
});

async function call(name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }> {
  const r = await client.callTool({ name, arguments: args });
  const text = ((r.content as Array<{ text?: string }>) ?? []).map((p) => p.text ?? "").join("\n");
  return { text, isError: (r as { isError?: boolean }).isError === true };
}

const PROFILE = { name: "Alex Rivera", summary: "Operations leader." };

function role(i: number, achievements = 4) {
  return {
    role: `Operations Lead ${i}`,
    company: `Company ${i}`,
    startDate: `20${String(10 + i).padStart(2, "0")}-01`,
    endDate: `20${String(11 + i).padStart(2, "0")}-01`,
    summary: `Ran operations for a ${20 + i}-person team across three sites, owning budget and vendor relationships.`,
    achievements: Array.from({ length: achievements }, (_, j) => ({
      metric: `Cut cycle time ${10 + j}% across ${3 + j} regional sites in ${i + 1} quarters`,
      context: `Backlog had grown for two years while volume rose; role ${i} inherited a manual intake process`,
      impact: `Freed roughly ${j + 2} FTE of capacity for the expansion work the board had asked for`,
      keywords: ["operations", "process improvement", "vendor management"],
    })),
  };
}

function app(over: Partial<Application>): Application {
  return {
    id: "x", company: "Acme", role: "Director", status: "applied", dateUpdated: new Date().toISOString(),
    remote: "unknown", contacts: [], interviewRounds: [], notes: [], coverLetterGenerated: false, priority: "medium",
    ...over,
  } as Application;
}

async function pipeline(apps: Application[]) {
  await savePipelineUnlocked({ applications: apps, lastUpdated: new Date().toISOString() } as Pipeline);
}

function journalEntry(over: Partial<JournalEntry>): JournalEntry {
  return { id: "j", date: "2026-07-01T00:00:00.000Z", type: "note", summary: "s", signals: [], source: "manual", ...over };
}

// ─── C1 ───────────────────────────────────────────────────────────────────────

describe("C1 · the empty-KB message speaks to the model", () => {
  it("says to do the task from what was pasted, then offer the save, without setup talk", () => {
    const msg = noCareerDataMessage();
    expect(msg).toContain("No saved Career KB yet");
    expect(msg).toContain(path.join(dataDir, "career"));
    expect(msg).toMatch(/do the task from what they pasted/);
    expect(msg).toMatch(/offer once to save .*save_career_section/s);
    expect(msg).toMatch(/Don't tell them the KB is empty/);
    expect(msg).not.toMatch(/Nothing is there so far|which is why this tool has nothing/);
  });

  it("names the résumé parameter when the tool has one", () => {
    expect(noCareerDataMessage({ resumeParam: "resume" })).toContain("call this tool again with their pasted résumé text in `resume`");
  });
});

// ─── C2 / C3 / C4 ─────────────────────────────────────────────────────────────

describe("C2 · check_setup on a fresh install is three lines, no homework", () => {
  it("drops git, dashboard and pipeline_add homework", async () => {
    const { text, isError } = await call("check_setup", {});
    expect(isError).toBe(false);
    const body = text.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
    expect(body.length).toBe(3);
    expect(text).toContain(dataDir);
    expect(text).toMatch(/Getting started/);
    expect(text).toContain("save_career_section");
    expect(text).not.toMatch(/git init|pipeline_add|dashboard|npx/);
    expect(text).not.toContain(FEEDBACK_LINE);
  });

  it("is not the fresh form once an application is tracked", async () => {
    await pipeline([app({ id: "a1" })]);
    const { text } = await call("check_setup", {});
    expect(text).toContain("**Pipeline**");
    // No KB saved yet, so not "a populated install": no feedback ask.
    expect(text).not.toContain(FEEDBACK_LINE);
  });

  it("shows the feedback line only on a healthy, populated install with an application", async () => {
    await saveCareerSection("profile", PROFILE);
    let { text } = await call("check_setup", {});
    expect(text).not.toContain(FEEDBACK_LINE);
    await pipeline([app({ id: "a1" })]);
    ({ text } = await call("check_setup", {}));
    expect(text).toContain(FEEDBACK_LINE);
    expect(FEEDBACK_LINE).toContain("https://github.com/benskamps/career-compass-mcp/discussions");
    expect(FEEDBACK_LINE).toContain("Nothing is sent automatically.");
  });

  it("does not nag about narrative, stories or people being empty", async () => {
    await saveCareerSection("profile", PROFILE);
    const { text } = await call("check_setup", {});
    const empty = text.split("\n").find((l) => l.includes("Still empty")) ?? "";
    expect(empty).not.toMatch(/narrative|stories|people/);
  });
});

describe("C3 · check_setup names its surface", () => {
  it("plugin when CLAUDE_PLUGIN_ROOT is set, standalone otherwise", () => {
    expect(runningSurface({ CLAUDE_PLUGIN_ROOT: "/x/plugin" })).toBe(`Running from the Career Compass plugin v${PKG_VERSION}`);
    expect(runningSurface({})).toBe(`Running as a standalone MCP server v${PKG_VERSION}`);
    expect(runningSurface({ CLAUDE_PLUGIN_ROOT: "  " })).toContain("standalone");
  });

  it("appears in the report", async () => {
    const { text } = await call("check_setup", {});
    expect(text).toMatch(/Running (from the Career Compass plugin|as a standalone MCP server) v/);
  });
});

describe("C4 · check_setup lists recent backups and how to restore", () => {
  it("lists them newest first with entry counts, at most five per file", async () => {
    await saveCareerSection("profile", PROFILE);
    for (let n = 1; n <= 7; n++) {
      await saveCareerSection("experience", Array.from({ length: n }, (_, i) => role(i, 1)));
      await new Promise((r) => setTimeout(r, 5)); // distinct millisecond stamps
    }
    const listed = await listCareerBackups();
    const exp = listed.find((f) => f.file === "experience.yaml")!;
    expect(exp.backups).toHaveLength(5);
    expect(exp.backups.map((b) => b.entries)).toEqual([6, 5, 4, 3, 2]);
    expect(exp.backups[0].takenAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    const { text } = await call("check_setup", {});
    expect(text).toContain("**Backups**");
    expect(text).toContain("experience.yaml:");
    expect(text).toMatch(/UTC · 6 entries · experience\.yaml\.\d{4}-.*\.bak/);
    expect(text).toMatch(/restoreFrom/);
  });

  it("says nothing about backups when there are none", async () => {
    await saveCareerSection("profile", PROFILE);
    const { text } = await call("check_setup", {});
    expect(text).not.toContain("**Backups**");
  });
});

// ─── C5 ───────────────────────────────────────────────────────────────────────

describe("C5 · save_career_section restoreFrom", () => {
  async function seed() {
    await saveCareerSection("profile", PROFILE);
    await saveCareerSection("experience", [role(1), role(2), role(3)]);
    await saveCareerSection("experience", [role(1)]); // the bad save
    const listed = await listCareerBackups();
    return listed.find((f) => f.file === "experience.yaml")!.backups[0].name;
  }

  it("puts a backup back, backs up the current file first, and returns a receipt", async () => {
    const name = await seed();
    const before = readdirSync(path.join(dataDir, "career")).filter((n) => n.startsWith("experience.yaml.")).length;
    const { text, isError } = await call("save_career_section", { section: "experience", restoreFrom: name });
    expect(isError, text).toBe(false);
    expect(text).toContain(`Restored **experience** from \`${name}\``);
    expect(text).toContain("1 → 3 entries");
    expect(text).toContain("Next fit check can cite 12 achievements, 12 with numbers.");
    const onDisk = parseYaml(readFileSync(path.join(dataDir, "career", "experience.yaml"), "utf-8")) as unknown[];
    expect(onDisk).toHaveLength(3);
    const after = readdirSync(path.join(dataDir, "career")).filter((n) => n.startsWith("experience.yaml.")).length;
    expect(after).toBe(before + 1);
  });

  it.each([
    ["../profile.yaml"],
    ["/etc/passwd"],
    ["experience.yaml"],
    ["experience.yaml.2020-01-01T00-00-00-000Z.bak"],
  ])("refuses %s, which is not one of the section's backups", async (bad) => {
    await seed();
    const { text, isError } = await call("save_career_section", { section: "experience", restoreFrom: bad });
    expect(isError).toBe(true);
    expect(text).toContain("Not restored");
    const onDisk = parseYaml(readFileSync(path.join(dataDir, "career", "experience.yaml"), "utf-8")) as unknown[];
    expect(onDisk).toHaveLength(1);
  });

  it("refuses another section's backup", async () => {
    await seed();
    await saveCareerSection("profile", { ...PROFILE, summary: "v2" });
    const profileBak = (await listCareerBackups()).find((f) => f.file === "profile.yaml")!.backups[0].name;
    const { isError } = await call("save_career_section", { section: "experience", restoreFrom: profileBak });
    expect(isError).toBe(true);
  });

  it("refuses a backup that doesn't validate, and writes nothing", async () => {
    await seed();
    const bad = "experience.yaml.2026-01-01T00-00-00-000Z.bak";
    writeFileSync(path.join(dataDir, "career", bad), "- role: only a role\n", "utf-8");
    const { text, isError } = await call("save_career_section", { section: "experience", restoreFrom: bad });
    expect(isError).toBe(true);
    expect(text).toMatch(/doesn't match the shape of experience/);
    const onDisk = parseYaml(readFileSync(path.join(dataDir, "career", "experience.yaml"), "utf-8")) as unknown[];
    expect(onDisk).toHaveLength(1);
  });

  it("requires data without restoreFrom, and refuses both at once", async () => {
    const none = await call("save_career_section", { section: "skills" });
    expect(none.isError).toBe(true);
    expect(none.text).toMatch(/`data` is missing.*restoreFrom/s);
    const both = await call("save_career_section", { section: "skills", data: [], restoreFrom: "x.bak" });
    expect(both.isError).toBe(true);
    expect(both.text).toContain("not both");
  });
});

// ─── C6 ───────────────────────────────────────────────────────────────────────

describe("C6 · Node version guard", () => {
  it("names the version found and the fix below 22", () => {
    const line = nodeVersionWarning("20.11.1")!;
    expect(line).toContain("found Node 20.11.1");
    expect(line).toContain("Install Node 22+ from https://nodejs.org, then restart Claude.");
    expect(line).not.toContain("\n");
    expect(nodeVersionWarning("v18.0.0")).toContain("found Node 18.0.0");
  });

  it("is silent on 22+ and on an unparseable version", () => {
    expect(nodeVersionWarning("22.0.0")).toBeNull();
    expect(nodeVersionWarning("24.3.1")).toBeNull();
    expect(nodeVersionWarning("banana")).toBeNull();
  });
});

// ─── C7 ───────────────────────────────────────────────────────────────────────

describe("C7 · a pasted résumé works before anything is saved", () => {
  const RESUME = "Jordan Lee — Support Lead at Brightdesk 2021-2025. Cut first-response time from 9h to 2h.";

  it("explore_opportunity gives a verdict from pasted text and ends with the save offer", async () => {
    const { text, isError } = await call("explore_opportunity", { posting: "Head of Support", resume: RESUME });
    expect(isError).toBe(false);
    expect(text).toContain("Opportunity Analysis");
    expect(text).toContain("Cut first-response time from 9h to 2h.");
    expect(text).toMatch(/BEGIN_UNTRUSTED_\w+ \(pasted résumé\)/);
    expect(text).toContain("**Worked from pasted text:**");
    expect(text).toMatch(/closing offer this: save that background .*save_career_section/s);
    expect(text).toContain("**Salary band:** not set");
  });

  it("tailor_resume tailors from pasted text", async () => {
    const { text } = await call("tailor_resume", { posting: "Head of Support", resume: RESUME });
    expect(text).toContain("Resume Tailoring Request");
    expect(text).toContain("Cut first-response time from 9h to 2h.");
    expect(text).toContain("**Worked from pasted text:**");
  });

  it("without a résumé, the empty state points at the parameter", async () => {
    const { text } = await call("tailor_resume", { posting: "x" });
    expect(text).toContain("No saved Career KB yet");
    expect(text).toContain("`resume`");
  });

  it("a saved KB with history wins over a pasted résumé", async () => {
    await saveCareerSection("profile", PROFILE);
    await saveCareerSection("experience", [role(1, 1)]);
    const { text } = await call("explore_opportunity", { posting: "x", resume: RESUME });
    expect(text).toContain("Operations Lead 1 @ Company 1");
    expect(text).not.toContain("Cut first-response time");
    expect(text).not.toContain("**Worked from pasted text:**");
    expect(text).toContain("this uses the saved Career KB");
  });

  it("a saved profile with no history still uses the pasted résumé, and its preferences", async () => {
    await saveCareerSection("profile", { ...PROFILE, salaryMin: 150000 });
    const { text } = await call("explore_opportunity", { posting: "x", resume: RESUME });
    expect(text).toContain("Cut first-response time");
    expect(text).toContain("USD 150,000 floor");
  });
});

// ─── C9 / C10 ─────────────────────────────────────────────────────────────────

describe("C9 · inferred journal entries are hypotheses", () => {
  it("capture_insight stores origin, and the digest tags inferred entries", async () => {
    await call("capture_insight", { type: "fit_signal", summary: "Seems to undersell platform work", origin: "inferred" });
    await call("capture_insight", { type: "win", summary: "Shipped the intake rebuild", origin: "user_said" });
    await call("capture_insight", { type: "note", summary: "Legacy entry, no origin" });
    const stored = parseYaml(readFileSync(path.join(dataDir, "career", "journal.yaml"), "utf-8")) as JournalEntry[];
    expect(stored.map((e) => e.origin)).toEqual(["inferred", "user_said", undefined]);

    const digest = formatSignalDigest(stored);
    const line = (s: string) => digest.split("\n").find((l) => l.includes(s))!;
    expect(line("undersell")).toContain(INFERRED_TAG);
    expect(line("intake rebuild")).not.toContain(INFERRED_TAG);
    expect(line("Legacy")).not.toContain(INFERRED_TAG);
    expect(INFERRED_TAG).toBe("(Claude's inference — a hypothesis, not a fact about the user)");
  });

  it("the truth rule says inferred entries are never facts", () => {
    expect(TRUTH_RULE).toMatch(/marked as Claude's inference are hypotheses: never state them as facts/);
  });

  it("interview_arc's timeline tags inferred entries too", async () => {
    await saveCareerSection("profile", PROFILE);
    await call("capture_insight", { type: "interview_insight", summary: "Panel doubted my scale", company: "Veridian", origin: "inferred" });
    const { text } = await call("interview_arc", { company: "Veridian" });
    expect(text.split("\n").find((l) => l.includes("**Signal") && l.includes("Panel doubted"))).toContain(INFERRED_TAG);
  });
});

describe("C10 · the target company's journal entries come first", () => {
  const js = [
    journalEntry({ id: "v1", company: "Veridian Health", summary: "veridian-old" }),
    ...Array.from({ length: 8 }, (_, i) => journalEntry({ id: `o${i}`, company: `Other ${i}`, summary: `other-${i}` })),
    journalEntry({ id: "v2", company: "veridian health", summary: "veridian-new" }),
    journalEntry({ id: "o9", company: "Other 9", summary: "other-9" }),
  ];

  it("puts that company first (newest first), then the most recent others, still capped", () => {
    const out = formatSignalDigest(js, 4, "Veridian Health, Inc.".replace(", Inc.", ""));
    const order = ["veridian-new", "veridian-old", "other-9", "other-7"].map((s) => out.indexOf(s));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(out).not.toContain("other-6");
    expect(out).toContain("4 of 11");
    expect(out).toContain("The first 2 entries are about Veridian Health.");
  });

  it("without a company it is plain recency", () => {
    const out = formatSignalDigest(js, 2);
    expect(out).toContain("other-9");
    expect(out).toContain("veridian-new");
    expect(out).not.toContain("veridian-old");
  });

  it("prepare_interview threads the company through", async () => {
    await saveCareerSection("profile", PROFILE);
    writeFileSync(path.join(dataDir, "career", "journal.yaml"), JSON.stringify(js), "utf-8");
    const { text } = await call("prepare_interview", { company: "Veridian Health", interviewType: "final" });
    expect(text).toContain("veridian-old");
  });
});

// ─── C11 / C12 ────────────────────────────────────────────────────────────────

describe("C11 · saved narrative is quoted in letters and prep, not résumés", () => {
  const WHY = "My role was eliminated in a reorg in March; I'm looking for a team that ships to patients.";

  beforeEach(async () => {
    await saveCareerSection("profile", PROFILE);
    await saveCareerSection("experience", [role(1, 1)]);
    await saveCareerSection("narrative", [{ topic: "why_left", text: WHY }]);
  });

  it("cover letter and interview prep quote it verbatim", async () => {
    for (const [tool, args] of [
      ["generate_cover_letter", { company: "Veridian", posting: "Director" }],
      ["prepare_interview", { company: "Veridian", interviewType: "behavioral" }],
      ["interview_arc", { company: "Veridian" }],
    ] as const) {
      const { text } = await call(tool, args);
      expect(text, tool).toContain(`**Why I left:** "${WHY}"`);
      expect(text, tool).toMatch(/never paraphrase them into new claims/);
      expect(text, tool).toMatch(/offer to save my answer to `narrative`/);
    }
  });

  it("tailor_resume does not carry it", async () => {
    const { text } = await call("tailor_resume", { posting: "Director" });
    expect(text).not.toContain(WHY);
  });

  it("with none saved, prep says to ask once and offer to save", async () => {
    rmSync(path.join(dataDir, "career", "narrative.yaml"));
    const { text } = await call("generate_cover_letter", { company: "Veridian", posting: "Director" });
    expect(text).toContain("None saved yet.");
    expect(text).toMatch(/ask me once, then offer to save my answer to `narrative`/);
  });
});

describe("C12 · story bank and who heard what", () => {
  beforeEach(async () => {
    await saveCareerSection("profile", PROFILE);
    await saveCareerSection("experience", [role(1, 1)]);
    await saveCareerSection("stories", [
      {
        title: "Intake turnaround", situation: "Backlog of 400 tickets", action: "Rebuilt triage", result: "Backlog to zero in 6 weeks",
        themes: ["ambiguity"], usedWith: [{ company: "Veridian Health", round: "panel", interviewer: "Priya", date: "2026-06-17" }],
      },
      { title: "Vendor consolidation", text: "Cut eleven vendors to four and saved 18%.", themes: ["negotiation"], usedWith: [] },
    ]);
    await pipeline([app({
      id: "v1", company: "Veridian Health", status: "interviewing",
      interviewRounds: [{ type: "panel", date: "2026-06-17", interviewers: ["Priya"] }],
    })]);
  });

  it("prepare_interview lists stories, names what this company already heard, and says to reuse first", async () => {
    const { text } = await call("prepare_interview", { applicationId: "v1", interviewType: "final" });
    expect(text).toContain("## Story bank (saved stories)");
    expect(text).toContain("**Vendor consolidation** [negotiation]: Cut eleven vendors to four and saved 18%.");
    expect(text).toContain('"Intake turnaround": you told Priya that one already (Veridian Health, panel, 2026-06-17)');
    expect(text).toMatch(/use it verbatim/);
    expect(text).toMatch(/offer once to save the new ones to `stories`/);
    expect(text).toMatch(/usedWith entry/);
  });

  it("an interviewer who heard a story elsewhere is still caught", async () => {
    const { text } = await call("prepare_interview", { company: "Globex", interviewType: "final", interviewerInfo: "Priya Shah, VP Ops" });
    expect(text).toContain("you told Priya that one already");
  });

  it("a different company hears nothing flagged", async () => {
    const { text } = await call("prepare_interview", { company: "Globex", interviewType: "final" });
    expect(text).not.toContain("that one already");
  });

  it("interview_arc groups what was told by round and offers to record the next", async () => {
    const { text } = await call("interview_arc", { applicationId: "v1" });
    expect(text).toContain("## Stories Already Told in This Process");
    expect(text).toContain('- **panel, 2026-06-17:** "Intake turnaround" to Priya');
    expect(text).toMatch(/you told Priya that one already/);
    expect(text).toMatch(/section `stories` and the full list/);
  });
});

// ─── C15 ──────────────────────────────────────────────────────────────────────

describe("C15 · evaluate_offer compares recorded offers and offers to save the deadline", () => {
  beforeEach(async () => {
    await pipeline([
      app({ id: "a1", company: "Acme", role: "Director", status: "offer", offer: { baseSalary: 180000, currency: "USD", benefits: [] } }),
      app({ id: "g1", company: "Globex", role: "VP Ops", status: "negotiating", offer: { baseSalary: 195000, bonus: 20000, currency: "USD", benefits: [], expiresDate: "2026-10-20" } }),
      app({ id: "r1", company: "Initech", role: "PM", status: "rejected", offer: { baseSalary: 1, currency: "USD", benefits: [] } }),
    ]);
  });

  it("puts other live recorded offers side by side and leaves dead ones out", async () => {
    const { text } = await call("evaluate_offer", { applicationId: "a1", offerDetails: "Base 180k" });
    expect(text).toContain("## Other Offers on Record");
    expect(text).toContain("| Globex (`g1`) | VP Ops | negotiating | USD 195,000 | USD 20,000 |  |  | 2026-10-20 |");
    expect(text).not.toContain("Initech");
    expect(text).not.toMatch(/\| Acme \(`a1`\)/);
    expect(text).toMatch(/side by side/);
  });

  it("offers to save a missing deadline with pipeline_update, with the user's OK", async () => {
    const { text } = await call("evaluate_offer", { company: "Acme", offerDetails: "Base 180k" });
    expect(text).toMatch(/pipeline_update.*applicationId `a1`.*offerExpiresDate/s);
    expect(text).toMatch(/only with their OK/);
  });

  it("doesn't ask for a deadline already recorded", async () => {
    const { text } = await call("evaluate_offer", { applicationId: "g1", offerDetails: "Base 195k" });
    expect(text).not.toContain("offerExpiresDate");
    expect(text).toContain("| Acme (`a1`)");
  });
});

// ─── C25 ──────────────────────────────────────────────────────────────────────

describe("C25 · format_for_ats keeps hygiene, drops folklore", () => {
  it.each(["workday", "greenhouse", "lever", "linkedin", "icims", "taleo", "smartrecruiters", "generic"])("%s", async (targetSystem) => {
    const { text } = await call("format_for_ats", { resumeContent: "Jane Doe", targetSystem });
    expect(text).toContain("Parsing hygiene");
    expect(text).toMatch(/text-based/);
    expect(text).toMatch(/limits vary by employer/);
    expect(text).not.toMatch(/finicky|One-page recommended|taxonomy exactly|under 100 char|~2000|under 150 char|under 300 words|MM\/DD\/YYYY/i);
  });
});

// ─── C27 ──────────────────────────────────────────────────────────────────────

describe("C27 · tailor_resume stays under ~8k tokens on a big KB", () => {
  it("10 roles and 60 journal entries render under 32,000 characters", async () => {
    await saveCareerSection("profile", { ...PROFILE, email: "a@example.com", phone: "555-0100", targetRoles: ["Director of Operations"] });
    await saveCareerSection("experience", Array.from({ length: 10 }, (_, i) => role(i, 4)));
    await saveCareerSection("skills", Array.from({ length: 25 }, (_, i) => ({ name: `Skill ${i}`, category: "Domain", proficiency: 4, yearsUsed: 6 })));
    await saveCareerSection("education", [{ degree: "MBA", institution: "State University", date: "2012", certifications: ["PMP", "Lean Six Sigma Black Belt"] }]);
    await saveCareerSection("projects", Array.from({ length: 6 }, (_, i) => ({ name: `Project ${i}`, role: "Lead", description: "Rebuilt the regional intake process end to end with the vendor and clinical teams.", metrics: ["30% faster"], outcomes: ["Adopted in 4 regions"] })));
    const journal = Array.from({ length: 60 }, (_, i) =>
      journalEntry({ id: `j${i}`, company: `Company ${i % 7}`, summary: `Interview ${i} surfaced a question about scaling vendor programs across regions`, signals: ["vendor-mgmt", "scale"], detail: "x".repeat(400) }));
    writeFileSync(path.join(dataDir, "career", "journal.yaml"), JSON.stringify(journal), "utf-8");
    mkdirSync(path.join(dataDir, "pipeline"), { recursive: true });

    const posting = "Director of Operations. ".repeat(120); // ~2.9k characters, a long real posting
    const { text } = await call("tailor_resume", { posting, company: "Company 3" });
    expect(text).toContain("Operations Lead 9 @ Company 9");
    expect(text.length, `tailor_resume output is ${text.length} characters`).toBeLessThan(32_000);
  });
});

// ─── C30 ──────────────────────────────────────────────────────────────────────

describe("C30 · the experience save receipt says what saving bought", () => {
  it("counts achievements and the ones with numbers", () => {
    const data = [
      { achievements: [{ metric: "Cut onboarding from 6 weeks to 9 days" }, { metric: "Led the migration" }] },
      { achievements: [{ metric: "Saved $1.2M" }] },
    ];
    expect(whatSavingBought("experience", data)).toBe("Next fit check can cite 3 achievements, 2 with numbers.\n");
    expect(whatSavingBought("skills", data)).toBe("");
  });

  it("appears on an experience save", async () => {
    await saveCareerSection("profile", PROFILE);
    const { text } = await call("save_career_section", { section: "experience", data: [role(1, 2)] });
    expect(text).toContain("Next fit check can cite 2 achievements, 2 with numbers.");
    const skills = await call("save_career_section", { section: "skills", data: [{ name: "Ops", category: "Domain" }] });
    expect(skills.text).not.toContain("Next fit check");
  });
});
