import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../server.js";

/**
 * First-run guard: a brand-new install must be able to become a working one.
 *
 * The README's onboarding step promises that pasting in a resume will "save
 * everything to your CAREER_DATA_PATH". For most of this package's life that
 * was impossible: `saveCareerSection()` existed, was atomic, was lock-protected
 * — and had zero callers. No registered tool could write the Career KB. Anyone
 * following the documentation exactly ended with an empty data directory and
 * four tools (`explore_opportunity`, `tailor_resume`, `generate_cover_letter`,
 * `prepare_interview`) returning "no career data" forever.
 *
 * Nothing in the suite caught it, because every test either used the bundled
 * example fixture or called the storage layer directly. Both skip the question
 * of whether a *tool* can put data there.
 *
 * So this test starts from an empty directory, uses only the MCP surface a real
 * client has, and asserts the round trip: write a profile, read it back through
 * a resource, and confirm a KB-backed tool stops reporting emptiness.
 */

const EXPECTED_WRITER = "save_career_section";

async function connect() {
  const server = createServer();
  const client = new Client({ name: "first-run", version: "0.0.0" });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(s), client.connect(c)]);
  return client;
}

const textOf = (r: unknown) =>
  (((r as { content?: Array<{ text?: string }> }).content) ?? [])
    .map((p) => p.text ?? "")
    .join("\n");

describe("first run from an empty data directory", () => {
  let dataDir: string;
  let original: string | undefined;

  beforeEach(() => {
    original = process.env.CAREER_DATA_PATH;
    dataDir = mkdtempSync(path.join(tmpdir(), "cc-firstrun-"));
    process.env.CAREER_DATA_PATH = dataDir;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.CAREER_DATA_PATH;
    else process.env.CAREER_DATA_PATH = original;
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("exposes a tool that can write the Career KB", async () => {
    const client = await connect();
    try {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name);
      expect(
        names,
        `no registered tool can populate the Career KB, so the documented onboarding ` +
          `flow cannot succeed and every KB-backed tool stays empty forever`,
      ).toContain(EXPECTED_WRITER);

      const writer = tools.find((t) => t.name === EXPECTED_WRITER)!;
      // It writes, so it must not claim otherwise — a host may auto-run
      // anything flagged read-only without asking.
      expect(writer.annotations?.readOnlyHint).not.toBe(true);
    } finally {
      await client.close();
    }
  });

  it("round-trips a profile: write it, read it back, and stop reporting empty", async () => {
    const client = await connect();
    try {
      // A KB-backed tool should say there's nothing yet.
      const before = textOf(
        await client.callTool({ name: "tailor_resume", arguments: { posting: "Director of Operations" } }),
      );
      expect(before.toLowerCase()).toContain("no career data");
      // ...and it must name the REAL directory, not a repo-relative one.
      expect(before).toContain(dataDir);
      expect(before).not.toContain("data/career/");

      const wrote = await client.callTool({
        name: EXPECTED_WRITER,
        arguments: {
          section: "profile",
          data: {
            name: "Alex Rivera",
            summary: "Operations leader.",
            targetRoles: ["Director of Operations"],
            targetIndustries: ["Healthcare"],
            targetCompanySize: ["Mid-market"],
            salaryCurrency: "USD",
            openToRemote: true,
            openToRelocation: false,
          },
        },
      });
      expect((wrote as { isError?: boolean }).isError ?? false).toBe(false);

      // It actually hit disk, as plain YAML, where it said it would.
      const onDisk = path.join(dataDir, "career", "profile.yaml");
      expect(existsSync(onDisk), `${EXPECTED_WRITER} reported success but wrote nothing`).toBe(true);
      expect((parseYaml(readFileSync(onDisk, "utf-8")) as { name: string }).name).toBe("Alex Rivera");

      // And the tool that was empty a moment ago now has something to work with.
      const after = textOf(
        await client.callTool({ name: "tailor_resume", arguments: { posting: "Director of Operations" } }),
      );
      expect(after.toLowerCase()).not.toContain("no career data");
      expect(after).toContain("Alex Rivera");
    } finally {
      await client.close();
    }
  });

  it("refuses a section that does not match the schema, without touching disk", async () => {
    const client = await connect();
    try {
      const r = await client.callTool({
        name: EXPECTED_WRITER,
        arguments: { section: "profile", data: { summary: "no name field" } },
      });
      expect((r as { isError?: boolean }).isError).toBe(true);
      expect(existsSync(path.join(dataDir, "career", "profile.yaml"))).toBe(false);
    } finally {
      await client.close();
    }
  });

  it("cannot be talked into writing outside the career directory", async () => {
    const client = await connect();
    try {
      // `section` becomes a filename, and a model supplies it.
      const r = await client.callTool({
        name: EXPECTED_WRITER,
        arguments: { section: "../../escaped", data: [] },
      });
      expect((r as { isError?: boolean }).isError).toBe(true);
      expect(existsSync(path.join(dataDir, "..", "escaped.yaml"))).toBe(false);
    } finally {
      await client.close();
    }
  });
});

describe("tools do not claim writes they did not make", () => {
  let dataDir: string;
  let original: string | undefined;

  beforeEach(() => {
    original = process.env.CAREER_DATA_PATH;
    dataDir = mkdtempSync(path.join(tmpdir(), "cc-claims-"));
    process.env.CAREER_DATA_PATH = dataDir;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.CAREER_DATA_PATH;
    else process.env.CAREER_DATA_PATH = original;
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("generate_rejection_response does not report a status change for an unknown id", async () => {
    const client = await connect();
    try {
      const out = textOf(
        await client.callTool({
          name: "generate_rejection_response",
          arguments: { applicationId: "does-not-exist-999", rejectionContent: "We went another direction." },
        }),
      );
      expect(
        out,
        "the tool told the user it changed a status while writing nothing",
      ).not.toMatch(/has been automatically updated/i);
      expect(out).toMatch(/no application matching/i);
    } finally {
      await client.close();
    }
  });

  it("no tool output references a tool that is not registered", async () => {
    const client = await connect();
    try {
      const { tools } = await client.listTools();
      const registered = new Set(tools.map((t) => t.name));

      // classify_email used to end with "call manage_pipeline with action='update'",
      // naming a tool that was split into pipeline_add / pipeline_update.
      const out = textOf(
        await client.callTool({
          name: "classify_email",
          arguments: { emailContent: "Thanks for applying.", autoUpdatePipeline: true },
        }),
      );
      const referenced = [...out.matchAll(/\b([a-z]+_[a-z_]+)\b/g)]
        .map((m) => m[1])
        .filter((n) => n.includes("pipeline") || n.includes("career") || n.includes("resume"));
      const ghosts = [...new Set(referenced)].filter((n) => !registered.has(n));
      expect(
        ghosts,
        `output names tool(s) that do not exist: ${ghosts.join(", ")}`,
      ).toEqual([]);
    } finally {
      await client.close();
    }
  });
});
