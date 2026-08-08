import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, type ServerOptions } from "../server.js";
import { PKG_VERSION } from "../version.js";
import {
  compareVersions,
  checkNpmForUpdate,
  probeLocalDashboard,
  type UpdateCheckResult,
  type DashboardProbeResult,
} from "../tools/doctor.js";

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
 * an aging data directory still loads, version drift is reported honestly, and
 * a fresh directory gets guidance rather than a wall of errors.
 *
 * Nothing here touches the network. The registry lookup and the dashboard probe
 * are injected, which is the whole reason `createServer` accepts overrides — a
 * test that reached npmjs.org would be slow, flaky, and would silently start
 * asserting whatever happened to be published that day.
 */

const UNREACHABLE_DASHBOARD: DashboardProbeResult = {
  reachable: false,
  reason: "nothing is listening",
};

async function connect(options: ServerOptions = {}) {
  const server = createServer({
    doctor: {
      // Both defaults reach outside the process, so both are stubbed unless a
      // test deliberately overrides them.
      checkForUpdate: async () => ({ ok: true, latest: PKG_VERSION }),
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

/** Bump the last segment of a version so "newer than installed" needs no literal. */
function bumpPatch(version: string): string {
  const [major, minor, patch] = version.split(".");
  return `${major}.${minor}.${Number(patch) + 1}`;
}

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

// ─── Version comparison ───────────────────────────────────────────────────────

describe("version comparison", () => {
  it("orders ordinary releases", () => {
    expect(compareVersions("2.3.0", "2.3.1")).toBeLessThan(0);
    expect(compareVersions("2.3.0", "2.10.0")).toBeLessThan(0);
    expect(compareVersions("2.3.0", "2.3.0")).toBe(0);
    expect(compareVersions("3.0.0", "2.99.99")).toBeGreaterThan(0);
  });

  it("compares numerically, not as strings", () => {
    // "2.10.0" < "2.9.0" lexicographically, which would report a user on the
    // newer release as three versions behind.
    expect(compareVersions("2.9.0", "2.10.0")).toBeLessThan(0);
  });

  it("ranks a prerelease below the release it leads to", () => {
    expect(compareVersions("2.4.0-rc.1", "2.4.0")).toBeLessThan(0);
    expect(compareVersions("2.4.0-rc.1", "2.4.0-rc.2")).toBeLessThan(0);
  });

  it("refuses to guess at an unparseable version", () => {
    // PKG_VERSION is the string "unknown" when package.json can't be read.
    // Returning 0 there would report a corrupt install as up to date.
    expect(compareVersions("unknown", "2.3.0")).toBeNull();
    expect(compareVersions("2.3.0", "")).toBeNull();
  });
});

// ─── Version drift ────────────────────────────────────────────────────────────

describe("check_setup reports version drift", () => {
  let dataDir: string;
  let original: string | undefined;

  beforeEach(() => {
    original = process.env.CAREER_DATA_PATH;
    dataDir = mkdtempSync(path.join(tmpdir(), "cc-upgrade-"));
    writeLegacyDataDir(dataDir);
    process.env.CAREER_DATA_PATH = dataDir;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.CAREER_DATA_PATH;
    else process.env.CAREER_DATA_PATH = original;
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("names the newer version and how to get it when the install is behind", async () => {
    const latest = bumpPatch(PKG_VERSION);
    const client = await connect({
      doctor: { checkForUpdate: async () => ({ ok: true, latest }) },
    });
    try {
      const out = textOf(await client.callTool({ name: "check_setup", arguments: {} }));
      expect(out).toContain(PKG_VERSION);
      expect(out).toContain(latest);
      // A version number with no next step is trivia. The finding must carry one.
      expect(out, "reported drift without telling the user what to do").toMatch(
        /update career-compass-mcp to/i,
      );
    } finally {
      await client.close();
    }
  });

  it("says so plainly when the install is current", async () => {
    const client = await connect();
    try {
      const out = textOf(await client.callTool({ name: "check_setup", arguments: {} }));
      expect(out).toMatch(/current release/i);
      expect(out).not.toMatch(/update career-compass-mcp to/i);
    } finally {
      await client.close();
    }
  });

  it("treats running ahead of npm as fine, not as drift", async () => {
    // Anyone working from source is ahead of the registry. Telling them to
    // "upgrade" to an older version is how a health check loses credibility.
    const client = await connect({
      doctor: { checkForUpdate: async () => ({ ok: true, latest: "0.0.1" }) },
    });
    try {
      const out = textOf(await client.callTool({ name: "check_setup", arguments: {} }));
      expect(out).toMatch(/ahead of/i);
      expect(out).not.toMatch(/update career-compass-mcp to/i);
    } finally {
      await client.close();
    }
  });

  it("never asks the registry when checkForUpdates is false", async () => {
    let asked = false;
    const client = await connect({
      doctor: {
        checkForUpdate: async () => {
          asked = true;
          return { ok: true, latest: PKG_VERSION };
        },
      },
    });
    try {
      const out = textOf(
        await client.callTool({ name: "check_setup", arguments: { checkForUpdates: false } }),
      );
      expect(
        asked,
        "checkForUpdates: false still made the outbound call — the offline opt-out is not real",
      ).toBe(false);
      // And the rest of the report still runs.
      expect(out).toMatch(/Data directory/);
    } finally {
      await client.close();
    }
  });
});

// ─── Offline grace ────────────────────────────────────────────────────────────

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

  const OFFLINE: UpdateCheckResult = {
    ok: false,
    reason: "could not reach the npm registry (offline, or a proxy is in the way)",
  };

  it("reports an unreachable registry as unknown, not as a failure", async () => {
    const client = await connect({ doctor: { checkForUpdate: async () => OFFLINE } });
    try {
      const result = await client.callTool({ name: "check_setup", arguments: {} });
      const out = textOf(result);

      // Being offline is not an error condition of the tool.
      expect((result as { isError?: boolean }).isError ?? false).toBe(false);
      expect(out).toMatch(/could not (check|reach)/i);
      expect(out, "an offline laptop was rendered as a broken install").not.toContain("❌ **Version**");
      // The rest of the report is unaffected — that's what "graceful" means here.
      expect(out).toMatch(/Career KB/);
      expect(out).toMatch(/Pipeline/);
    } finally {
      await client.close();
    }
  });

  it("survives a checker that throws, rather than failing the whole check", async () => {
    // Negative control for the graceful-offline path: if the tool ever stops
    // containing the update check, a thrown fetch error takes down a diagnostic
    // that is most needed precisely when things are broken.
    const client = await connect({
      doctor: {
        checkForUpdate: async () => {
          throw new TypeError("fetch failed");
        },
      },
    });
    try {
      const result = await client.callTool({ name: "check_setup", arguments: {} });
      expect(
        (result as { isError?: boolean }).isError ?? false,
        "a failing update check took down the entire setup report",
      ).toBe(false);
      expect(textOf(result)).toMatch(/Career KB/);
    } finally {
      await client.close();
    }
  });

  it("the real checker resolves rather than throws when the network is gone", async () => {
    // Exercises checkNpmForUpdate itself, not a stub — with a 1ms budget, so it
    // times out instead of reaching the registry. This is the guard that would
    // go red if someone removed the try/catch and let fetch reject.
    const result = await checkNpmForUpdate(1);
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toBeTruthy();
  });

  it("the real dashboard probe resolves rather than throws on a closed port", async () => {
    const result = await probeLocalDashboard(59998, 500);
    expect(result.reachable).toBe(false);
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
    const latest = bumpPatch(PKG_VERSION);
    const client = await connect({
      doctor: { checkForUpdate: async () => ({ ok: true, latest }) },
    });
    try {
      const out = textOf(await client.callTool({ name: "check_setup", arguments: {} }));
      expect(out).toContain(latest);
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

  it("treats a dashboard that isn't running as normal, with the command to start it", async () => {
    const client = await connect();
    try {
      const out = textOf(await client.callTool({ name: "check_setup", arguments: {} }));
      expect(out).toMatch(/career-compass-mcp dashboard/);
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
