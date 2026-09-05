import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir, homedir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ResourceUpdatedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "../server.js";
import { getDataDir, savePipelineUnlocked } from "../storage/file-store.js";
import { handleGet, handleNextActions } from "../tools/pipeline.js";
import { renderLiteDashboard } from "../dashboard-lite/render.js";
import type { Application, Pipeline } from "../schemas/career-schema.js";

/**
 * The 2.7.0 productization pass — every behaviour change it made, pinned.
 *
 * The pass landed with build green and 442 tests green, and not one of those
 * tests exercised anything it changed (the only test edit was a prompt count).
 * Green-with-no-new-tests is the shape of "untested", not "verified". Each
 * block below is one item from that checklist, written so the item's absence
 * would go red.
 */

async function connect() {
  const server = createServer();
  const client = new Client({ name: "productization-pass", version: "0.0.0" });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(s), client.connect(c)]);
  return client;
}

const textOf = (r: unknown) =>
  (((r as { content?: Array<{ text?: string }> }).content) ?? [])
    .map((p) => p.text ?? "")
    .join("\n");

const isError = (r: unknown) => (r as { isError?: boolean }).isError === true;

function app(over: Partial<Application>): Application {
  return {
    id: over.id ?? "x", company: over.company ?? "Acme", role: over.role ?? "Engineer",
    status: over.status ?? "applied", dateUpdated: over.dateUpdated ?? new Date().toISOString(),
    remote: "unknown", contacts: [], interviewRounds: [], notes: [],
    coverLetterGenerated: false, priority: over.priority ?? "medium",
    ...over,
  } as Application;
}

/** Local calendar date, offset by `delta` days, as the date-only string the store keeps. */
function localDate(delta: number): string {
  const d = new Date();
  d.setDate(d.getDate() + delta);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const PROFILE = {
  name: "Alex Rivera",
  summary: "Operations leader.",
  targetRoles: ["Director of Operations"],
  targetIndustries: ["Healthcare"],
  targetCompanySize: ["Mid-market"],
  salaryCurrency: "USD",
  openToRemote: true,
  openToRelocation: false,
};

let dataDir: string;
let original: string | undefined;

beforeEach(() => {
  original = process.env.CAREER_DATA_PATH;
  dataDir = mkdtempSync(path.join(tmpdir(), "cc-prod-"));
  process.env.CAREER_DATA_PATH = dataDir;
});

afterEach(() => {
  if (original === undefined) delete process.env.CAREER_DATA_PATH;
  else process.env.CAREER_DATA_PATH = original;
  rmSync(dataDir, { recursive: true, force: true });
});

// ─── Phase 4: tilde expansion ─────────────────────────────────────────────────

describe("getDataDir expands a leading tilde", () => {
  it.each([
    ["~/.career-compass", path.join(homedir(), ".career-compass")],
    ["~\\career", path.join(homedir(), "career")],
    ["~", homedir()],
  ])("%s → home-relative", (raw, expected) => {
    process.env.CAREER_DATA_PATH = raw;
    expect(getDataDir()).toBe(expected);
  });

  it("leaves an absolute path and an inner tilde alone", () => {
    process.env.CAREER_DATA_PATH = dataDir;
    expect(getDataDir()).toBe(dataDir);
    process.env.CAREER_DATA_PATH = path.join(dataDir, "a~b");
    expect(getDataDir()).toBe(path.join(dataDir, "a~b"));
  });
});

// ─── Phase 1: next_actions compares calendar days, not UTC timestamps ────────

describe("handleNextActions uses the user's calendar day", () => {
  it("a follow-up due today is overdue today, and tomorrow's is not", () => {
    const due = app({ id: "today", followUpDue: localDate(0) });
    const notYet = app({ id: "tmrw", company: "Zed", followUpDue: localDate(1) });
    const text = handleNextActions({ applications: [due, notYet], lastUpdated: new Date().toISOString() } as Pipeline)
      .content[0].text;
    expect(text).toContain("ID: today");
    expect(text).not.toContain("ID: tmrw");
  });

  it("names the soonest upcoming interview, not the first-listed one", () => {
    const a = app({
      id: "iv", status: "interviewing",
      interviewRounds: [
        { type: "final", interviewers: [], date: localDate(5) },
        { type: "phone_screen", interviewers: [], date: localDate(-3) },
        { type: "panel", interviewers: [], date: localDate(1) },
      ],
    });
    const text = handleNextActions({ applications: [a], lastUpdated: new Date().toISOString() } as Pipeline)
      .content[0].text;
    expect(text).toContain(`panel on ${localDate(1)}`);
    expect(text).not.toContain("phone_screen on");
  });

  it("skips ghosted applications, like the dashboard does", () => {
    const g = app({ id: "gh", status: "ghosted", followUpDue: localDate(-10) });
    const text = handleNextActions({ applications: [g], lastUpdated: new Date().toISOString() } as Pipeline)
      .content[0].text;
    expect(text).not.toContain("ID: gh");
  });
});

// ─── Phase 1: validation failures are errors, not results ────────────────────

describe("pipeline validation failures carry isError", () => {
  it("handleGet on an unknown id", () => {
    const r = handleGet({ id: "nope" } as never, { applications: [], lastUpdated: "" } as Pipeline);
    expect(r.isError).toBe(true);
  });

  it("over the wire: unknown id, missing id, unknown action, bad status, refused transition", async () => {
    const client = await connect();
    try {
      const call = (args: Record<string, unknown>) =>
        client.callTool({ name: "pipeline_view", arguments: args });
      expect(isError(await call({ action: "get", id: "nope" }))).toBe(true);
      expect(isError(await call({ action: "get" }))).toBe(true);
      expect(isError(await call({ action: "nonsense" }))).toBe(true);

      const added = await client.callTool({
        name: "pipeline_add",
        arguments: { company: "Acme", role: "Eng", status: "accepted" },
      });
      expect(isError(added)).toBe(false);
      const id = /ID:\s*`?([a-f0-9]{8})`?/i.exec(textOf(added))?.[1];
      expect(id, `could not find the new id in: ${textOf(added)}`).toBeTruthy();

      expect(isError(await client.callTool({ name: "pipeline_add", arguments: { company: "A", role: "B", status: "bogus" } }))).toBe(true);
      expect(isError(await client.callTool({ name: "pipeline_update", arguments: { id: "nope", status: "applied" } }))).toBe(true);
      // accepted → any live stage is the one transition the store refuses.
      const refused = await client.callTool({ name: "pipeline_update", arguments: { id, status: "interviewing" } });
      expect(isError(refused), textOf(refused)).toBe(true);
      // The happy path is still not an error — otherwise the assertions above are a tautology.
      const ok = await client.callTool({ name: "pipeline_view", arguments: { action: "get", id } });
      expect(isError(ok)).toBe(false);
    } finally {
      await client.close();
    }
  });
});

// ─── Phase 1: tailor_resume has a real academic branch ───────────────────────

describe("tailor_resume format=academic", () => {
  it("emits an academic structure, and standard does not", async () => {
    const client = await connect();
    try {
      const wrote = await client.callTool({
        name: "save_career_section",
        arguments: { section: "profile", data: PROFILE },
      });
      expect(isError(wrote), textOf(wrote)).toBe(false);
      const academic = textOf(await client.callTool({
        name: "tailor_resume",
        arguments: { posting: "Assistant Professor of Operations", format: "academic" },
      }));
      expect(academic).toContain("Publications");
      expect(academic).toContain("Teaching Experience");
      const standard = textOf(await client.callTool({
        name: "tailor_resume",
        arguments: { posting: "Director of Operations", format: "standard" },
      }));
      expect(standard).not.toContain("Publications & Peer-Reviewed Works");
    } finally {
      await client.close();
    }
  });
});

// ─── Phase 1: a corrupt store is told plainly by the résumé/opportunity tools ─

describe("résumé and opportunity tools guard the Career KB read", () => {
  it.each(["tailor_resume", "generate_cover_letter", "explore_opportunity"])(
    "%s returns the repair sentence instead of a transport error",
    async (tool) => {
      mkdirSync(path.join(dataDir, "career"), { recursive: true });
      writeFileSync(path.join(dataDir, "career", "profile.yaml"), "name: [unclosed\n  :: not yaml", "utf-8");
      const client = await connect();
      try {
        const r = await client.callTool({ name: tool, arguments: { posting: "Anything", company: "Acme" } });
        const text = textOf(r);
        expect(text).toContain("❌");
        expect(text).not.toMatch(/at .*\.js:\d+/); // no stack trace
        expect(text).toContain("profile.yaml");
      } finally {
        await client.close();
      }
    },
  );
});

// ─── Phase 2: the 7th prompt, and pages that match the tool ──────────────────

describe("prompts", () => {
  it("setup-career-kb embeds a pasted résumé and names the writer tool", async () => {
    const client = await connect();
    try {
      const { messages } = await client.getPrompt({
        name: "setup-career-kb",
        arguments: { resumeText: "Alex Rivera — Director of Operations" },
      });
      const text = (messages[0].content as { text: string }).text;
      expect(text).toContain("Alex Rivera");
      expect(text).toContain("save_career_section");
      expect(text).toContain("check_setup");
    } finally {
      await client.close();
    }
  });

  it("resume-tailor accepts pages 3 (the tool's range is 1–4)", async () => {
    const client = await connect();
    try {
      const { messages } = await client.getPrompt({
        name: "resume-tailor",
        arguments: { posting: "Director of Operations", pages: "3" },
      });
      expect((messages[0].content as { text: string }).text).toContain("3 page");
    } finally {
      await client.close();
    }
  });
});

// ─── Phase 2 + 3: the lite dashboard ─────────────────────────────────────────

describe("lite dashboard render", () => {
  const empty = { applications: [], lastUpdated: new Date().toISOString() } as Pipeline;

  it("shows Welcome when there is no Career KB, the pipeline-only state when there is", () => {
    const welcome = renderLiteDashboard(empty, dataDir, new Date(), false);
    expect(welcome).toContain("Welcome to Career Compass");
    expect(welcome).toContain("set up my Career KB");
    expect(welcome).not.toContain("Your pipeline is empty");

    const kb = renderLiteDashboard(empty, dataDir, new Date(), true);
    expect(kb).toContain("Your pipeline is empty");
    expect(kb).not.toContain("Welcome to Career Compass");
    // Callers that predate the flag keep the pipeline-only state.
    expect(renderLiteDashboard(empty, dataDir)).toContain("Your pipeline is empty");
  });

  it("renders a keyboard-reachable detail drawer per card", () => {
    const a = app({
      id: "abc12345", company: "Acme", role: "Engineer",
      followUpDue: localDate(3), source: "referral",
      contacts: [{ name: "Sam Lee", title: "Recruiter" }] as unknown as Application["contacts"],
      interviewRounds: [{ type: "phone_screen", interviewers: [], date: localDate(2) }],
      notes: ["first note", "the latest note"],
    });
    const html = renderLiteDashboard({ applications: [a], lastUpdated: new Date().toISOString() } as Pipeline, dataDir);
    expect(html).toContain('data-id="abc12345"');
    expect(html).toContain('role="button" tabindex="0" aria-expanded="false"');
    expect(html).toContain("Sam Lee (Recruiter)");
    expect(html).toContain("the latest note");
    expect(html).not.toContain("first note");
    expect(html).toContain('id="filter"');
    // Next actions are clickable and carry the application id in their prompt.
    expect(html).toMatch(/class="action [a-z]+" data-prompt="[^"]*ID: abc12345[^"]*" role="button"/);
    // Kanban scrolls horizontally on narrow screens.
    expect(html).toContain("@media(max-width:700px)");
  });

  it("links an http(s) posting URL and refuses to link any other scheme", () => {
    const https = app({ id: "ok", postingUrl: "https://jobs.example.com/123" });
    const evil = app({ id: "no", company: "Evil", postingUrl: "javascript:alert(1)" });
    const html = renderLiteDashboard({ applications: [https, evil], lastUpdated: new Date().toISOString() } as Pipeline, dataDir);
    expect(html).toContain('href="https://jobs.example.com/123"');
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain("javascript:alert(1)"); // still visible as text, escaped
  });
});

// ─── Phase 4: check_setup git finding ────────────────────────────────────────

const gitAvailable = (() => {
  try { execFileSync("git", ["--version"], { stdio: "ignore" }); return true; } catch { return false; }
})();

describe.skipIf(!gitAvailable)("check_setup git finding", () => {
  it("warns with the init command outside a repo, confirms inside one", async () => {
    const client = await connect();
    try {
      const before = textOf(await client.callTool({ name: "check_setup", arguments: { checkForUpdates: false } }));
      expect(before).toContain("Git backup");
      expect(before).toContain("not a git repository");
      expect(before).toContain("git init");

      execFileSync("git", ["init", "-q"], { cwd: dataDir, stdio: "ignore" });
      const after = textOf(await client.callTool({ name: "check_setup", arguments: { checkForUpdates: false } }));
      expect(after).toContain("tracked in a git repository");
      expect(after).not.toContain("git init");
    } finally {
      await client.close();
    }
  });
});

// ─── Phase 1: career://pipeline/{id} subscriptions notify ────────────────────

describe("live subscription to one application", () => {
  it("fires resources/updated for career://pipeline/{id} when applications.yaml changes", async () => {
    const a = app({ id: "live0001" });
    await savePipelineUnlocked({ applications: [a], lastUpdated: new Date().toISOString() } as Pipeline);

    const client = await connect();
    const seen: string[] = [];
    client.setNotificationHandler(ResourceUpdatedNotificationSchema, (n) => {
      seen.push(n.params.uri);
    });
    try {
      await client.subscribeResource({ uri: "career://pipeline/live0001" });
      // Give the watcher a beat to arm before the write it must observe.
      await new Promise((r) => setTimeout(r, 150));
      a.notes = ["changed"];
      await savePipelineUnlocked({ applications: [a], lastUpdated: new Date().toISOString() } as Pipeline);

      const deadline = Date.now() + 4000;
      while (!seen.includes("career://pipeline/live0001") && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50));
      }
      expect(seen).toContain("career://pipeline/live0001");
    } finally {
      await client.close();
    }
  });
});
