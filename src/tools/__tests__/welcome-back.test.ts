import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, cpSync, readFileSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../server.js";
import { VISITS_FILENAME } from "../../storage/visit-state.js";
import { buildWelcomeBack, digestKey } from "../welcome-back.js";
import { nextOnBoard, nextOnBoardLine } from "../today-digest.js";
import type { Application } from "../../schemas/career-schema.js";

const EXAMPLE = fileURLToPath(new URL("../../../data/example", import.meta.url));
const POSTING = "Staff Product Manager, Northwind Labs. Own the roadmap for logistics analytics.";

type Content = { type: string; text: string }[];
const textOf = (r: unknown) => ((r as { content: Content }).content).map((c) => c.text).join("\n");

describe("welcome back: a return visit opens with what changed", () => {
  let dir: string;
  let saved: { path?: string; today?: string };
  let client: Client;
  let server: ReturnType<typeof createServer>;

  beforeEach(async () => {
    saved = { path: process.env.CAREER_DATA_PATH, today: process.env.CAREER_COMPASS_TODAY };
    dir = mkdtempSync(path.join(tmpdir(), "cc-welcome-"));
    cpSync(EXAMPLE, dir, { recursive: true });
    process.env.CAREER_DATA_PATH = dir;
    process.env.CAREER_COMPASS_TODAY = "2026-06-16";
    server = createServer();
    client = new Client({ name: "welcome-test", version: "0" });
    const [c, s] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(s), client.connect(c)]);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
    for (const [k, v] of [["CAREER_DATA_PATH", saved.path], ["CAREER_COMPASS_TODAY", saved.today]] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    rmSync(dir, { recursive: true, force: true });
  });

  const call = (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args });

  it("says nothing on the first visit ever, then remembers it in an owner-only file", async () => {
    const out = textOf(await call("pipeline_view", { action: "list" }));
    expect(out).not.toContain("Since you were last here");
    const file = path.join(dir, VISITS_FILENAME);
    expect(existsSync(file)).toBe(true);
    if (process.platform !== "win32") expect(statSync(file).mode & 0o777).toBe(0o600);
    const state = JSON.parse(readFileSync(file, "utf8"));
    expect(state.lastSeen).toMatch(/^2026-06-1[56]T/);
    expect(state.seenDigest.length).toBeGreaterThan(0);
  });

  it("two days later, the first call carries what came due and last time's untracked fit check, once", async () => {
    await call("explore_opportunity", { posting: POSTING, company: "Northwind Labs", role: "Staff Product Manager" });
    process.env.CAREER_COMPASS_TODAY = "2026-06-18";

    const first = textOf(await call("tailor_resume", { posting: POSTING }));
    const block = first.split("↩️")[1];
    expect(block).toBeTruthy();
    expect(block).toContain("Since you were last here** (2 days ago)");
    // Stratos was "due tomorrow" on the 16th; on the 18th it is overdue.
    expect(block).toContain("Overdue follow-up** — Stratos Cloud");
    // The debrief is new too: the panel was tomorrow on the 16th, yesterday now.
    expect(block).toContain("Debrief** — Veridian Health");
    expect(block).toContain("checked your fit for Northwind Labs (Staff Product Manager); it isn't on your board");
    // Meridian's follow-up was already overdue on the 16th: the same ⚠️ item, seen, not repeated.
    expect(block).not.toContain("Meridian");

    const second = textOf(await call("tailor_resume", { posting: POSTING }));
    expect(second).not.toContain("Since you were last here");
  });

  it("on the digest itself it only names what is new, since the items are on screen", async () => {
    await call("pipeline_view", { action: "list" });
    process.env.CAREER_COMPASS_TODAY = "2026-06-18";
    const out = textOf(await call("pipeline_view", { action: "next_actions" }));
    const block = out.split("↩️")[1];
    expect(block).toContain("New on today's list:");
    expect(block).toContain("Stratos Cloud");
    expect(block).not.toContain("→");
  });

  it("a loose end that reached the board is not a loose end", async () => {
    await call("explore_opportunity", { posting: POSTING, company: "Northwind Labs" });
    await call("pipeline_add", { company: "Northwind Labs", role: "Staff Product Manager", status: "discovered" });
    process.env.CAREER_COMPASS_TODAY = "2026-06-18";
    const out = textOf(await call("research_company", { company: "Acme" }));
    expect(out).not.toContain("Northwind");
  });

  it("stays out of check_setup and of errors", async () => {
    await call("pipeline_view", { action: "list" });
    process.env.CAREER_COMPASS_TODAY = "2026-06-18";
    expect(textOf(await call("check_setup", {}))).not.toContain("Since you were last here");
    const err = await call("pipeline_update", { id: "nope", status: "applied" });
    expect(textOf(err)).not.toContain("Since you were last here");
    // The real return is still ahead: the welcome was not spent on those.
    expect(textOf(await call("pipeline_view", { action: "list" }))).not.toContain("Since you were last here");
  });
});

describe("buildWelcomeBack", () => {
  const now = new Date(2026, 5, 18, 9);
  const digest = {
    date: "2026-06-18", startHere: { applicationId: "a1", line: "⚠️ **Overdue follow-up** — A / B: due today (ID: a1)", action: "Nudge." },
    alsoToday: [], comingUp: [], footer: [],
  };

  it("needs a gap of at least eight hours", () => {
    const prior = { version: 1 as const, lastSeen: new Date(2026, 5, 18, 3).toISOString(), seenDigest: [] };
    expect(buildWelcomeBack({ prior, apps: [], digest, now, tool: "tailor_resume" })).toBeNull();
  });

  it("is silent when nothing changed", () => {
    const prior = { version: 1 as const, lastSeen: new Date(2026, 5, 10).toISOString(), seenDigest: [digestKey(digest.startHere)] };
    expect(buildWelcomeBack({ prior, apps: [], digest, now, tool: "tailor_resume" })).toBeNull();
  });

  it("forgets loose ends after three weeks", () => {
    const at = new Date(2026, 4, 1).toISOString();
    const prior = { version: 1 as const, lastSeen: at, seenDigest: [digestKey(digest.startHere)], recent: [{ tool: "explore_opportunity", company: "Old Co", at }] };
    expect(buildWelcomeBack({ prior, apps: [], digest, now, tool: "tailor_resume" })).toBeNull();
  });
});

describe("next on board: the day coming back pays off", () => {
  const base = { role: "PM", priority: "medium", remote: "unknown", contacts: [], notes: [], coverLetterGenerated: false, dateUpdated: "2026-06-16T08:00:00.000Z" };
  const a = (over: Partial<Application>) => ({ ...base, id: "x", company: "Acme", status: "applied", interviewRounds: [], ...over }) as Application;
  const now = new Date(2026, 5, 16, 9);

  it("a fresh application's next date is its follow-up window, a week out", () => {
    const next = nextOnBoard([a({ dateApplied: "2026-06-16" })], now)!;
    expect(next).toMatchObject({ date: "2026-06-23", inDays: 7, what: "the Acme follow-up window" });
    expect(nextOnBoardLine(next)).toMatch(/^Next up: the Acme follow-up window, Tue, Jun 23 \(in 7 days\)\.$/);
  });

  it("the soonest dated thing wins, and closed or past items don't count", () => {
    const apps = [
      a({ id: "1", dateApplied: "2026-06-16" }),
      a({ id: "2", company: "Canopy", status: "interviewing", interviewRounds: [{ type: "panel", date: "2026-06-17", interviewers: [], notes: "" }] }),
      a({ id: "3", company: "Gone", status: "rejected", followUpDue: "2026-06-17" }),
      a({ id: "4", company: "Past", followUpDue: "2026-06-10" }),
    ];
    expect(nextOnBoardLine(nextOnBoard(apps, now)!)).toBe("Next up: your Canopy panel, Wed, Jun 17 (tomorrow).");
  });

  it("is null on a board with nothing dated ahead", () => {
    expect(nextOnBoard([a({ status: "discovered" })], now)).toBeNull();
  });
});

describe("recent momentum: progress without a pace", () => {
  it("counts the last seven days, and says nothing about an empty week", async () => {
    const { recentMomentum } = await import("../today-digest.js");
    const now = new Date(2026, 5, 16, 9);
    const mk = (over: Partial<Application>) => ({ id: "x", company: "A", role: "B", status: "applied", priority: "medium", remote: "unknown", contacts: [], notes: [], coverLetterGenerated: false, dateUpdated: "", interviewRounds: [], ...over }) as Application;
    expect(recentMomentum([mk({ dateApplied: "2026-06-15" }), mk({ dateApplied: "2026-06-10" }), mk({ dateApplied: "2026-06-01", interviewRounds: [{ type: "phone_screen", date: "2026-06-12", interviewers: [], notes: "" }] })], now))
      .toBe("Last 7 days: 2 sent · 1 interview");
    expect(recentMomentum([mk({ dateApplied: "2026-05-01" })], now)).toBe("");
  });
});
