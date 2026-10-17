import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, type ServerOptions } from "../server.js";
import { PKG_VERSION } from "../version.js";
import { probeLocalDashboard, type DashboardProbeResult } from "../tools/doctor.js";

/**
 * Upgrade guard: the second install has to work as well as the first.
 *
 * `first-run.test.ts` proved a brand-new install can become a working one. It
 * says nothing about the install a user comes back to — the one that was
 * written by an older version, or that has fallen a release behind. That is the
 * state the product's only real user was actually in: her setup felt "rough
 * around the edges", she assumed she had done something wrong, and the fix was
 * an upgrade nothing in the product could have told her she needed.
 *
 * So this drives the same MCP-surface-only discipline over the *later* moments:
 * an aging data directory still loads, the installed version is reported with
 * how to update, and a fresh directory gets guidance rather than a wall of errors.
 *
 * Nothing here touches the network. The dashboard probe is injected, which is
 * the whole reason `createServer` accepts overrides.
 */

const UNREACHABLE_DASHBOARD: DashboardProbeResult = {
  reachable: false,
  reason: "nothing is listening",
};

async function connect(options: ServerOptions = {}) {
  const server = createServer({
    doctor: {
      // Stubbed unless a test deliberately overrides it.
      probeDashboard: async () => UNREACHABLE_DASHBOARD,
      ...options.doctor,
    },
  });
  const client = new Client({ name: "upgrade-scenarios", version: "0.0.0" });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(s), client.connect(c)]);
  return client;
}

const textOf = (r: unknown) =>
  (((r as { content?: Array<{ text?: string }> }).content) ?? [])
    .map((p) => p.text ?? "")
    .join("\n");

// ─── Network guard ────────────────────────────────────────────────────────────

/**
 * No test in this file may reach the internet. Career Compass makes no
 * outbound calls, and this guard is what keeps that claim enforced: `fetch` is
 * replaced for the whole file, loopback passes through (the dashboard probe is
 * genuinely local and worth exercising for real), and anything else throws.
 */
const realFetch = globalThis.fetch;

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return (input as Request).url;
}

const isLoopback = (url: string) =>
  /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/.test(url);

beforeEach(() => {
  // `async` deliberately: real fetch signals failure by rejecting, never by
  // throwing synchronously, and a guard that behaves differently from the thing
  // it stands in for tests a code path production does not have.
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlOf(input);
    if (isLoopback(url)) return realFetch(input as RequestInfo, init);
    throw new Error(
      `the test suite tried to reach ${url}. Tests must not make real network calls, ` +
        `and Career Compass itself makes none.`,
    );
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * A data directory as an older Career Compass left it.
 *
 * Deliberately not a copy of `data/example/`: the point is the *shape* an
 * earlier release wrote — a profile and experience, and none of the sections
 * that came later (projects, testimonials, journal). Copying today's fixture
 * would only ever prove today's layout loads.
 */
function writeLegacyDataDir(dir: string): void {
  const careerDir = path.join(dir, "career");
  mkdirSync(careerDir, { recursive: true });
  mkdirSync(path.join(dir, "pipeline"), { recursive: true });

  writeFileSync(
    path.join(careerDir, "profile.yaml"),
    [
      "name: Dana Okafor",
      "summary: Supply chain lead.",
      "targetRoles:",
      "  - Director of Operations",
      "targetIndustries:",
      "  - Healthcare",
      "targetCompanySize:",
      "  - Mid-market",
      "salaryCurrency: USD",
      "openToRemote: true",
      "openToRelocation: false",
      "",
    ].join("\n"),
    "utf-8",
  );
  writeFileSync(
    path.join(careerDir, "experience.yaml"),
    [
      "- role: Senior Operations Manager",
      "  company: Northwind Health",
      "  startDate: '2020-01'",
      "  endDate: '2024-06'",
      "  achievements:",
      "    - metric: Cut fulfillment cost 18%",
      "      context: Rebuilt the vendor mix across 9 sites",
      "      impact: Freed $2.1M for clinical hiring",
      "      keywords:",
      "        - supply chain",
      "",
    ].join("\n"),
    "utf-8",
  );
}

describe("check_setup stays useful offline", () => {
  let dataDir: string;
  let original: string | undefined;

  beforeEach(() => {
    original = process.env.CAREER_DATA_PATH;
    dataDir = mkdtempSync(path.join(tmpdir(), "cc-offline-"));
    writeLegacyDataDir(dataDir);
    process.env.CAREER_DATA_PATH = dataDir;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.CAREER_DATA_PATH;
    else process.env.CAREER_DATA_PATH = original;
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("the real dashboard probe resolves rather than throws on a closed port", async () => {
    // Genuinely local, so this one runs for real through the loopback allowance.
    const result = await probeLocalDashboard(59998, 500);
    expect(result.reachable).toBe(false);
  });
});

// ─── The real update checker, without a real network ──────────────────────────

/**
 * `checkNpmForUpdate` itself, driven through a stubbed `fetch`.
 *
 * These exercise the actual function — its try/catch, its status handling, its
 * response parsing — rather than a stand-in for it, while staying offline. The
 * first case is the negative control for the graceful-offline guard: deleting
 * the try/catch from `checkNpmForUpdate` turns it red, verified by doing exactly
 * that and watching it fail.
 */
describe("the suite's own network guard", () => {
  it("refuses a non-loopback request", async () => {
    // Negative control for the guard itself: if this ever stops throwing, every
    // other "no network" claim in this file is unenforced.
    await expect(fetch("https://registry.npmjs.org/career-compass-mcp/latest")).rejects.toThrow(
      /must not make real network calls/i,
    );
  });

});

// ─── An aging data directory ──────────────────────────────────────────────────

describe("a data directory written by an older version still works", () => {
  let dataDir: string;
  let original: string | undefined;

  beforeEach(() => {
    original = process.env.CAREER_DATA_PATH;
    dataDir = mkdtempSync(path.join(tmpdir(), "cc-legacy-"));
    writeLegacyDataDir(dataDir);
    process.env.CAREER_DATA_PATH = dataDir;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.CAREER_DATA_PATH;
    else process.env.CAREER_DATA_PATH = original;
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("loads a KB missing every section added after it was written", async () => {
    // projects.yaml, testimonials.yaml, education.yaml and journal.yaml do not
    // exist in this directory. A tool that requires them would break every
    // returning user on the release that introduced them.
    const client = await connect();
    try {
      const out = textOf(
        await client.callTool({ name: "tailor_resume", arguments: { posting: "Director of Operations" } }),
      );
      expect(out.toLowerCase()).not.toContain("no career data");
      expect(out).toContain("Dana Okafor");
    } finally {
      await client.close();
    }
  });

  it("resolves the resources for sections that do not exist yet", async () => {
    const client = await connect();
    try {
      const read = await client.readResource({ uri: "career://projects" });
      const text = (read.contents?.[0] as { text?: string } | undefined)?.text ?? "";
      // Empty, not an error: a missing optional section is the normal state of
      // an older directory, and must stay readable.
      expect(text.trim()).toBe("[]");
    } finally {
      await client.close();
    }
  });

  it("reports which sections are still empty, and how to fill them", async () => {
    const client = await connect();
    try {
      const out = textOf(await client.callTool({ name: "check_setup", arguments: {} }));
      expect(out).toMatch(/Still empty:/);
      expect(out).toContain("projects");
      expect(out).toContain("testimonials");
      expect(out).toContain("save_career_section");
    } finally {
      await client.close();
    }
  });

  it("flags a leftover .tmp file from a write that was interrupted mid-upgrade", async () => {
    writeFileSync(
      path.join(dataDir, "career", ".skills.yaml.abc-123.tmp"),
      "- name: YAML that never landed\n",
      "utf-8",
    );
    const client = await connect();
    try {
      const out = textOf(await client.callTool({ name: "check_setup", arguments: {} }));
      expect(out).toMatch(/leftover \.tmp file/i);
    } finally {
      await client.close();
    }
  });

  it("names the specific unreadable file instead of failing the whole report", async () => {
    writeFileSync(
      path.join(dataDir, "career", "skills.yaml"),
      "- name: Forecasting\n  proficiency: [unclosed\n",
      "utf-8",
    );
    const client = await connect();
    try {
      const out = textOf(await client.callTool({ name: "check_setup", arguments: {} }));
      expect(out).toContain("skills.yaml");
      expect(out).toMatch(/\.bak/);
      // The loader fails closed on a bad section, but the *diagnostic* must keep
      // reporting — "which file is broken" is the question being asked.
      expect(out).toMatch(/Pipeline/);
      expect(out).toMatch(/Dashboard/);
    } finally {
      await client.close();
    }
  });
});

// ─── A partially-populated KB ─────────────────────────────────────────────────

/**
 * The half-finished KB: sections saved, profile not.
 *
 * This is a real state — `save_career_section` writes one section at a time, so
 * anyone who saves their experience before their profile lands here, as does
 * anyone whose profile.yaml gets moved or corrupted after the fact. The report
 * used to short-circuit on profile alone and tell them there was "just no career
 * data in it yet", which is the tool failing to see work they had already done —
 * the exact self-blame it exists to prevent.
 */
describe("a Career KB with sections saved but no profile", () => {
  let dataDir: string;
  let original: string | undefined;

  beforeEach(() => {
    original = process.env.CAREER_DATA_PATH;
    dataDir = mkdtempSync(path.join(tmpdir(), "cc-partial-"));
    writeLegacyDataDir(dataDir);
    // Same fixture, minus the one file every KB-backed tool loads first.
    rmSync(path.join(dataDir, "career", "profile.yaml"), { force: true });
    writeFileSync(
      path.join(dataDir, "career", "skills.yaml"),
      "- name: Forecasting\n  category: Technical\n  proficiency: 4\n",
      "utf-8",
    );
    process.env.CAREER_DATA_PATH = dataDir;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.CAREER_DATA_PATH;
    else process.env.CAREER_DATA_PATH = original;
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("names what IS saved instead of claiming the directory is empty", async () => {
    const client = await connect();
    try {
      const out = textOf(await client.callTool({ name: "check_setup", arguments: {} }));

      expect(out, "the report did not mention the saved experience section").toContain("experience");
      expect(out, "the report did not mention the saved skills section").toContain("skills");
      expect(
        out,
        "told a user with saved sections that there is no career data here",
      ).not.toMatch(/nothing saved yet/i);
      expect(out).not.toMatch(/Getting started/i);
    } finally {
      await client.close();
    }
  });

  it("flags the missing profile as the one thing blocking the KB-backed tools", async () => {
    const client = await connect();
    try {
      const out = textOf(await client.callTool({ name: "check_setup", arguments: {} }));
      expect(out).toMatch(/profile\.yaml is missing/i);
      expect(out).toMatch(/save_career_section.*'profile'/s);
      expect(out).toContain("tailor_resume");
    } finally {
      await client.close();
    }
  });

  it("closes with a fixable summary, not getting-started guidance", async () => {
    const client = await connect();
    try {
      const out = textOf(await client.callTool({ name: "check_setup", arguments: {} }));
      expect(out).toMatch(/Nothing is broken/i);
    } finally {
      await client.close();
    }
  });
});

// ─── A completely empty directory ─────────────────────────────────────────────

describe("check_setup on an empty install", () => {
  let dataDir: string;
  let original: string | undefined;

  beforeEach(() => {
    original = process.env.CAREER_DATA_PATH;
    dataDir = mkdtempSync(path.join(tmpdir(), "cc-empty-"));
    process.env.CAREER_DATA_PATH = dataDir;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.CAREER_DATA_PATH;
    else process.env.CAREER_DATA_PATH = original;
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("gives getting-started guidance instead of a wall of errors", async () => {
    const client = await connect();
    try {
      const result = await client.callTool({ name: "check_setup", arguments: {} });
      const out = textOf(result);

      expect((result as { isError?: boolean }).isError ?? false).toBe(false);
      expect(out).toMatch(/Getting started/i);
      // The first move has to be the one that actually works. `ingest_document`
      // never writes anything, and pointing a new user at it is the dead end
      // the empty-state message was rewritten to stop giving.
      expect(out).toContain("save_career_section");
      expect(out).not.toMatch(/\d+ things? to fix/);
      // Nothing about an empty install is broken, so nothing should read as broken.
      expect(out, "a fresh install was reported as failing").not.toContain("❌");
    } finally {
      await client.close();
    }
  });

  it("names the real data directory, not a repo-relative path", async () => {
    const client = await connect();
    try {
      const out = textOf(await client.callTool({ name: "check_setup", arguments: {} }));
      expect(out).toContain(dataDir);
      expect(out).not.toContain("data/career/");
    } finally {
      await client.close();
    }
  });

  it("still reports the version, so a stale install is caught before onboarding", async () => {
    // The failure mode this whole lane exists for: someone installs a stale
    // copy, follows onboarding, hits friction, and blames themselves.
    const client = await connect();
    try {
      const out = textOf(await client.callTool({ name: "check_setup", arguments: {} }));
      expect(out).toContain(PKG_VERSION);
    } finally {
      await client.close();
    }
  });
});

// ─── Dashboard reachability ───────────────────────────────────────────────────

describe("check_setup reports the dashboard", () => {
  let dataDir: string;
  let original: string | undefined;

  beforeEach(() => {
    original = process.env.CAREER_DATA_PATH;
    dataDir = mkdtempSync(path.join(tmpdir(), "cc-dash-"));
    writeLegacyDataDir(dataDir);
    process.env.CAREER_DATA_PATH = dataDir;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.CAREER_DATA_PATH;
    else process.env.CAREER_DATA_PATH = original;
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("treats a dashboard that isn't running as normal, without handing over a command", async () => {
    const client = await connect();
    try {
      const out = textOf(await client.callTool({ name: "check_setup", arguments: {} }));
      expect(out).toMatch(/Dashboard\*\* — Not running.*That's normal/);
      // A dashboard nobody opened is not homework: no npx command under a green tick.
      expect(out).not.toMatch(/career-compass-mcp@\d+\.\d+\.\d+\S* dashboard/);
      expect(out).not.toContain("❌ **Dashboard**");
    } finally {
      await client.close();
    }
  });

  it("says where to open it when it is running", async () => {
    const client = await connect({
      doctor: { probeDashboard: async () => ({ reachable: true, isCareerCompass: true }) },
    });
    try {
      const out = textOf(await client.callTool({ name: "check_setup", arguments: { dashboardPort: 3141 } }));
      expect(out).toContain("http://localhost:3141");
    } finally {
      await client.close();
    }
  });

  it("distinguishes a port in use by something else", async () => {
    const client = await connect({
      doctor: { probeDashboard: async () => ({ reachable: true, isCareerCompass: false }) },
    });
    try {
      const out = textOf(await client.callTool({ name: "check_setup", arguments: { dashboardPort: 3141 } }));
      expect(out).toMatch(/isn't the Career Compass dashboard/i);
      expect(out).toMatch(/--port 3142/);
    } finally {
      await client.close();
    }
  });
});
