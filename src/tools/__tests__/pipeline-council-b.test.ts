import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../server.js";
import {
  handleAdd, handleUpdate, handleGet, handleStats, handleCalendar, normalizeName, closestApplication,
} from "../pipeline.js";
import { buildTodayDigest, FEEDBACK_LINE } from "../today-digest.js";
import { escapeText, foldLine } from "../pipeline-calendar.js";
import { endedAfterSamePattern, excitementLine, sourceLine } from "../../pipeline-stats.js";
import { tomorrow } from "../../prompts/index.js";
import type { Application, CareerData, Pipeline } from "../../schemas/career-schema.js";
import type { PipelineAddArgs, PipelineUpdateArgs } from "../../types/tool-args.js";

/**
 * Council 2.9.7, climb B: the pipeline and the daily digest.
 *
 * C8 duplicate-aware add · C13 reconnects · C14 résumé version · C16 classify
 * proposals · C17 pace + campaign footer · C18 close-out · C19 landing mode ·
 * C20/C21 pattern lines · C22 calendar · C23 closest match · C24 structured
 * output · C29 debrief thank-yous.
 */

const JUNE_16 = new Date(2026, 5, 16, 9);

function app(over: Partial<Application> = {}): Application {
  return {
    id: "a1", company: "Acme", role: "Engineer", status: "applied", priority: "medium",
    dateUpdated: new Date(2026, 5, 16, 8).toISOString(), remote: "unknown",
    contacts: [], interviewRounds: [], notes: [], coverLetterGenerated: false, ...over,
  } as Application;
}
const pipe = (...apps: Application[]): Pipeline => ({ applications: apps, lastUpdated: "2026-06-16T00:00:00.000Z" });
const career = (over: Partial<CareerData> = {}): CareerData => ({
  profile: { name: "Sam", summary: "", targetRoles: [], targetIndustries: [] } as unknown as CareerData["profile"],
  experience: [], skills: [], education: [], projects: [], testimonials: [], journal: [],
  narrative: [], stories: [], people: [], ...over,
});
const text = (p: Pipeline, now = JUNE_16, c?: CareerData | null) => buildTodayDigest(p, now, c).content[0].text;
const add = (p: Pipeline, args: Partial<PipelineAddArgs>) => handleAdd({ action: "add", company: "Acme", role: "Engineer", ...args } as PipelineAddArgs, p);

// ─── C8 ───────────────────────────────────────────────────────────────────────

describe("C8 duplicate-aware pipeline_add", () => {
  it("normalizes case, punctuation, whitespace and company suffixes", () => {
    expect(normalizeName("Acme, Inc.", "company")).toBe(normalizeName("  acme  ", "company"));
    expect(normalizeName("Veridian Health LLC", "company")).toBe("veridian health");
    expect(normalizeName("Sr. Program  Manager")).toBe(normalizeName("sr program manager"));
  });

  it("writes nothing on a match and returns the existing id, as a success", async () => {
    const p = pipe(app({ id: "x1", company: "Acme Inc.", role: "Senior Engineer" }));
    const res = await add(p, { company: "ACME", role: "senior   engineer" });
    expect(res.isError).toBeFalsy();
    expect(p.applications).toHaveLength(1);
    expect(res.content[0].text).toContain("x1");
    expect(res.content[0].text).toContain("pipeline_update");
    expect(res.content[0].text).toContain("allowDuplicate");
  });

  it("adds a genuinely separate application with allowDuplicate, and a different role without it", async () => {
    const p = pipe(app({ id: "x1" }));
    await add(p, { allowDuplicate: true });
    await add(p, { role: "Staff Engineer" });
    expect(p.applications).toHaveLength(3);
  });
});

// ─── C14, C23 ─────────────────────────────────────────────────────────────────

describe("C14 tailoredResumeVersion and C23 closest-match errors", () => {
  const update = (p: Pipeline, args: Partial<PipelineUpdateArgs>) => handleUpdate({ action: "update", id: "a1", ...args } as PipelineUpdateArgs, p);

  it("records the résumé version sent", async () => {
    const p = pipe(app());
    const res = await update(p, { tailoredResumeVersion: "resume-eng-v3.docx" });
    expect(p.applications[0].tailoredResumeVersion).toBe("resume-eng-v3.docx");
    expect(res.content[0].text).toContain("Résumé sent: resume-eng-v3.docx");
  });

  it("suggests the closest application by id or company", async () => {
    const p = pipe(app({ id: "demo-001", company: "Veridian Health" }), app({ id: "demo-002", company: "Stratos Cloud" }));
    const byTypo = await update(p, { id: "demo-01" });
    expect(byTypo.isError).toBe(true);
    expect(byTypo.content[0].text).toContain("did you mean Veridian Health (demo-001)?");
    const byName = handleGet({ action: "get", id: "stratos" }, p);
    expect(byName.content[0].text).toContain("did you mean Stratos Cloud (demo-002)?");
    expect(closestApplication(p.applications, "zzzzzzzz")).toBeNull();
    // No guess: it lists recent ones instead.
    expect(handleGet({ action: "get", id: "zzzzzzzz" }, p).content[0].text).toContain("Most recently updated");
  });
});

// ─── C13, C17 ─────────────────────────────────────────────────────────────────

describe("C13 reconnects in /today", () => {
  it("nudges when the cadence has passed, at most two, below everything else", () => {
    const people = [
      { name: "Dana", company: "Acme", lastContact: "2026-04-01", reconnectEveryDays: 30, applicationIds: [] },
      { name: "Lee", lastContact: "2026-05-01", reconnectEveryDays: 30, applicationIds: [] },
      { name: "Kim", lastContact: "2026-03-01", reconnectEveryDays: 30, applicationIds: [] },
      { name: "Fresh", lastContact: "2026-06-10", reconnectEveryDays: 30, applicationIds: [] },
      { name: "NoDate", reconnectEveryDays: 30, applicationIds: [] },
    ];
    const p = pipe(app({ id: "iv", status: "interviewing", interviewRounds: [{ type: "final", date: "2026-06-30", interviewers: [] }] }));
    const out = text(p, JUNE_16, career({ people }));
    const lines = out.split("\n").filter((l) => l.includes("🤝 Reconnect"));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("Kim: last contact 107 days ago");
    expect(lines[1]).toContain("Dana (Acme): last contact 76 days ago");
    expect(out.indexOf("Upcoming interview")).toBeLessThan(out.indexOf("🤝"));
    expect(out).not.toContain("Fresh");
    expect(out).not.toContain("NoDate");
  });

  it("nudges a referral on a live application after 90 days, and survives no KB", () => {
    const p = pipe(app({ id: "live" }));
    const people = [{ name: "Ravi", lastContact: "2026-03-01", offered: "a referral", applicationIds: ["live"] }];
    expect(text(p, JUNE_16, career({ people }))).toContain("🤝 Reconnect — Ravi: last contact 107 days ago");
    expect(text(p, JUNE_16, null)).not.toContain("🤝");
  });
});

describe("C17 weekly pace and campaign footer", () => {
  // Tuesday 2026-06-16: the week began Monday 06-15.
  const p = pipe(
    app({ id: "s1", dateApplied: "2026-05-05" }),
    app({ id: "s2", dateApplied: "2026-06-15" }),
    app({ id: "s3", dateApplied: "2026-06-16" }),
    app({ id: "iv", status: "interviewing", dateApplied: "2026-06-01", interviewRounds: [{ type: "phone_screen", date: "2026-06-15", interviewers: [] }] }),
  );

  it("shows where the user is and their pace", () => {
    const out = text(p, JUNE_16, career({ profile: { ...career().profile, weeklyPace: 5 } }));
    expect(out).toContain("Week 7 of your search · This week: 2 of 5 sent · 1 conversation");
  });

  it("shows the campaign week without a pace", () => {
    const out = text(p, JUNE_16, null);
    expect(out).toMatch(/_Week 7 of your search( · Last 7 days: [^_]+)?_/);
    expect(out).not.toContain("This week:");
  });

  it("turns a quiet day into a forward move against the pace", () => {
    const quiet = pipe(app({ id: "q", dateApplied: "2026-06-15" }), app({ id: "d", status: "discovered", company: "Canopy", role: "Analyst", dateDiscovered: "2026-06-14" }));
    const out = text(quiet, JUNE_16, career({ profile: { ...career().profile, weeklyPace: 3 } }));
    expect(out).toContain("Nothing needs you today");
    expect(out).toContain("you've sent 1 of 3 this week, so two to go");
    expect(out).toContain("start with Canopy / Analyst");
  });
});

// ─── C18, C19 ─────────────────────────────────────────────────────────────────

describe("C18 close-out and C19 landing mode", () => {
  const acceptedOn = (y: number, m: number, d: number, over: Partial<Application> = {}) => app({
    id: "win", company: "Stratos", role: "PM", status: "accepted", dateApplied: "2026-04-01",
    dateUpdated: new Date(y, m, d, 10).toISOString(), referral: "Dana Kim",
    contacts: [{ name: "Marcus Chen" }],
    interviewRounds: [{ type: "panel", date: "2026-05-20", interviewers: [] }, { type: "final", date: "2026-05-28", interviewers: [] }],
    ...over,
  });

  it("replaces 'all closed' with a close-out ranked first, with the feedback line once", () => {
    const p = pipe(
      acceptedOn(2026, 5, 10),
      app({ id: "other", company: "Brightpath", role: "TPM", status: "interviewing", followUpDue: "2026-06-12" }),
      app({ id: "gone", status: "rejected" }),
    );
    const out = text(p);
    const start = out.split("## Also today")[0];
    expect(start).toContain("You accepted Stratos / PM");
    expect(start).toContain("Dana Kim, Marcus Chen");
    expect(start).toContain("Withdraw from the processes still live: Brightpath / TPM (interviewing, ID: other)");
    expect(start).toContain("`stories`");
    expect(start).toContain("`experience`");
    expect(start).toMatch(/Recap: 3 tracked over \d+ weeks · \d+% response rate/);
    expect(out.split(FEEDBACK_LINE).length - 1).toBe(1);
    expect(out).not.toContain("tracked applications are closed");
    // The follow-up to a company being left is not a chore any more.
    expect(out).not.toContain("Overdue follow-up");
  });

  it("never shows the feedback line after rejections only", () => {
    const out = text(pipe(app({ status: "rejected" }), app({ id: "b", status: "ghosted" })));
    expect(out).toContain("all 2 tracked applications are closed");
    expect(out).not.toContain(FEEDBACK_LINE);
  });

  it("offers the 30/60/90 plan in the first week when everything else is closed", () => {
    const journal = [{ id: "j", date: "2026-05-21", type: "interview_insight" as const, company: "Stratos", summary: "probed roadmap", signals: [], source: "manual" as const }];
    const out = text(pipe(acceptedOn(2026, 5, 14)), JUNE_16, career({ journal }));
    expect(out).toContain("Week 1 in the new role: capture one win");
    expect(out).toContain("30/60/90 plan");
    expect(out).toContain("2 rounds and 1 interview note on file for Stratos");
  });

  it("switches to weekly wins after the close-out window, and ends at 90 days", () => {
    const later = text(pipe(acceptedOn(2026, 4, 20)), JUNE_16);
    expect(later).toContain("Week 4 in the new role: capture one win");
    expect(later).toContain("capture_insight, type win");
    expect(later).not.toContain("30/60/90");
    expect(later).not.toContain(FEEDBACK_LINE);
    expect(text(pipe(acceptedOn(2026, 1, 1)), JUNE_16)).toContain("all 1 tracked applications are closed");
  });

  it("counts weeks from a recorded start date, and says when the start is ahead", () => {
    const before = text(pipe(acceptedOn(2026, 4, 1, { offer: { startDate: "2026-07-01", currency: "USD", benefits: [] } })), JUNE_16);
    expect(before).toContain("Starting at Stratos");
    expect(before).toContain("in 15 days");
  });
});

// ─── C20, C21 ─────────────────────────────────────────────────────────────────

describe("C20 and C21 pattern lines", () => {
  const ended = (id: string, type: "panel" | "final", status: "rejected" | "ghosted", day: number) =>
    app({ id, status, dateUpdated: new Date(2026, 5, day).toISOString(), interviewRounds: [{ type, date: "2026-05-01", interviewers: [] }] });

  it("names a repeated stage kindly, in the digest and in stats", () => {
    const apps = [ended("a", "panel", "rejected", 10), ended("b", "final", "rejected", 9), ended("c", "panel", "ghosted", 8), ended("d", "panel", "rejected", 7)];
    const line = endedAfterSamePattern(apps)!;
    expect(line).toContain("Three of your last four");
    expect(line).toContain("after the panel round");
    expect(line).toContain("panel prep");
    expect(line).not.toMatch(/\byou failed|your fault|weak/i);
    expect(text(pipe(...apps))).toContain(line);
    expect(handleStats(pipe(...apps)).content[0].text).toContain(line);
    expect(endedAfterSamePattern(apps.slice(0, 2))).toBeNull();
  });

  it("compares excitement with interviews only with enough data, with counts", () => {
    const scored = [9, 9, 8, 8, 3, 4, 5, 2].map((e, i) => app({
      id: `e${i}`, excitement: e, status: e >= 8 && i < 3 ? "interviewing" : "rejected",
    }));
    expect(excitementLine(scored)).toBe(
      "Roles you rated 8+ reached an interview 3 of 4 times; roles rated 5 or lower, 0 of 4. Small numbers, so read it as a hint, not a rule.",
    );
    expect(excitementLine(scored.slice(0, 7))).toBeNull();
  });

  it("compares reply rate by source only with enough data", () => {
    const apps = [
      ...[0, 1, 2, 3].map((i) => app({ id: `r${i}`, referral: "Dana", status: i < 3 ? "screening" : "applied" })),
      ...[0, 1, 2, 3].map((i) => app({ id: `c${i}`, source: "LinkedIn", status: i < 1 ? "screening" : "ghosted" })),
    ];
    expect(sourceLine(apps)).toBe("Replies by source: Referral 3 of 4, LinkedIn 1 of 4. Small numbers, so read it as a hint, not a rule.");
    expect(sourceLine(apps.slice(1))).toBeNull();
    const stats = handleStats(pipe(...apps));
    expect(stats.content[0].text).toContain("What your own numbers say");
    expect((stats.structuredContent as { stats: { insights: string[] } }).stats.insights).toContain(sourceLine(apps));
  });
});

// ─── C22 ──────────────────────────────────────────────────────────────────────

describe("C22 calendar export", () => {
  const p = pipe(
    app({ id: "iv", company: "Veridian, Inc.", status: "interviewing", interviewRounds: [
      { type: "phone_screen", date: "2026-06-01", interviewers: [] },
      { type: "panel", date: "2026-06-17", interviewers: ["Priya; Lead", "Sam"] },
    ] }),
    app({ id: "fu", followUpDue: "2026-06-20" }),
    app({ id: "of", status: "offer", offer: { expiresDate: "2026-06-27", currency: "USD", benefits: [] } }),
    app({ id: "old", status: "rejected", followUpDue: "2026-06-30" }),
  );
  const res = handleCalendar(p, JUNE_16);
  const ics = (res.structuredContent as { calendar: { ics: string } }).calendar.ics;

  it("is RFC 5545: CRLF endings, VEVENTs with stable UIDs and all-day dates", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/\n|\r/);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(ics).toContain("UID:iv-round-1@career-compass");
    expect(ics).toContain("UID:fu-follow-up@career-compass");
    expect(ics).toContain("UID:of-offer-deadline@career-compass");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260617\r\nDTEND;VALUE=DATE:20260618");
    expect(ics).not.toContain("iv-round-0"); // past
    expect(ics).not.toContain("old-"); // closed
    expect(handleCalendar(p, JUNE_16).structuredContent).toEqual(res.structuredContent); // deterministic
  });

  it("escapes text and folds long lines", () => {
    expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    expect(ics).toContain("Veridian\\, Inc.");
    const long = foldLine("DESCRIPTION:" + "é".repeat(80));
    for (const l of long.split("\r\n")) expect(Buffer.byteLength(l, "utf-8")).toBeLessThanOrEqual(75);
    expect(long.split("\r\n").slice(1).every((l) => l.startsWith(" "))).toBe(true);
  });

  it("tells the user how to use it in one line", () => {
    expect(res.content[0].text.split("\n")[0]).toContain("Save the text below as career-compass.ics");
    expect(handleCalendar(pipe(), JUNE_16).content[0].text).toContain("nothing to put on a calendar");
  });
});

// ─── Through the server: C16, C24, C29 ────────────────────────────────────────

describe("through the MCP server", () => {
  const EXAMPLE = fileURLToPath(new URL("../../../data/example", import.meta.url));
  let dir: string;
  let client: Client;
  let server: ReturnType<typeof createServer>;
  const saved = { data: process.env.CAREER_DATA_PATH, today: process.env.CAREER_COMPASS_TODAY };

  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "cc-climb-b-"));
    cpSync(EXAMPLE, dir, { recursive: true });
    writeFileSync(path.join(dir, "career", "people.yaml"), "- name: Dana Kim\n  lastContact: '2026-03-01'\n  reconnectEveryDays: 30\n", "utf-8");
    process.env.CAREER_DATA_PATH = dir;
    process.env.CAREER_COMPASS_TODAY = "2026-06-16";
    server = createServer();
    client = new Client({ name: "climb-b", version: "0.0.0" });
    const [c, s] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(s), client.connect(c)]);
  });
  afterAll(async () => {
    await client.close();
    await server.close();
    rmSync(dir, { recursive: true, force: true });
    for (const [k, v] of [["CAREER_DATA_PATH", saved.data], ["CAREER_COMPASS_TODAY", saved.today]] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });

  it("C24: pipeline_view declares an outputSchema and returns structuredContent for every action", async () => {
    const tool = (await client.listTools()).tools.find((t) => t.name === "pipeline_view")!;
    expect(tool.outputSchema).toBeDefined();
    for (const action of ["list", "stats", "next_actions", "calendar"]) {
      const r = await client.callTool({ name: "pipeline_view", arguments: { action } });
      expect(r.isError, action).toBeFalsy();
      expect((r.structuredContent as { action: string }).action).toBe(action);
      expect((r.content as { text: string }[])[0].text.length).toBeGreaterThan(0);
    }
    const got = await client.callTool({ name: "pipeline_view", arguments: { action: "get", id: "demo-001" } });
    expect((got.structuredContent as { application: { company: string } }).application.company).toBe("Veridian Health");
  });

  it("C13 + C24: the digest reads the people ledger and returns its sections as data", async () => {
    const r = await client.callTool({ name: "pipeline_view", arguments: { action: "next_actions" } });
    const digest = (r.structuredContent as { digest: { startHere: { applicationId: string }; comingUp: { line: string }[] } }).digest;
    expect(digest.startHere.applicationId).toBe("demo-001");
    expect(digest.comingUp.some((i) => i.line.includes("Reconnect — Dana Kim"))).toBe(true);
  });

  it("C22: calendar is listed in the action enum and the description", async () => {
    const tool = (await client.listTools()).tools.find((t) => t.name === "pipeline_view")!;
    expect(JSON.stringify(tool.inputSchema)).toContain("calendar");
    expect(tool.description).toContain(".ics");
  });

  it("C16: classify_email proposes only parameters pipeline_update accepts", async () => {
    const tools = (await client.listTools()).tools;
    const updateParams = Object.keys((tools.find((t) => t.name === "pipeline_update")!.inputSchema as { properties: object }).properties);
    const r = await client.callTool({ name: "classify_email", arguments: { emailContent: "We're pleased to offer you the role." } });
    const t = (r.content as { text: string }[])[0].text;
    const named = [...t.matchAll(/`(offer[A-Z]\w*|interview[A-Z]\w*|interviewers)`/g)].map((m) => m[1]);
    expect(named).toEqual(expect.arrayContaining(["offerBaseSalary", "offerExpiresDate", "interviewType", "interviewDate"]));
    for (const n of named) expect(updateParams, n).toContain(n);
    expect(t).toContain("[confirm:");
  });

  it("C29: the debrief drafts thank-yous from the user's own notes and proposes followUpDue tomorrow", async () => {
    const { messages } = await client.getPrompt({
      name: "post-interview-debrief",
      arguments: { company: "Veridian Health", role: "Director", applicationId: "demo-001", howItWent: "Priya asked about the 14-site rollout." },
    });
    const t = (messages[0].content as { text: string }).text;
    expect(t).toContain("4-sentence thank-you");
    expect(t).toContain("my own notes");
    expect(t).toContain(`followUpDue: "${tomorrow()}"`);
    expect(tomorrow()).toBe("2026-06-17");
    expect(t).toContain("ask before writing");
  });
});
