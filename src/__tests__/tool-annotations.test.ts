import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, cpSync, readdirSync, statSync, readFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../server.js";

/**
 * Tool-annotation guard: the hints must be present, and they must be true.
 *
 * `readOnlyHint` and `destructiveHint` are not documentation. A host reads them
 * to decide what it can run without stopping to ask — a tool marked read-only is
 * a tool a user may never be prompted about again. So a wrong hint is worse than
 * a missing one: it converts "the client asks first" into "the client doesn't."
 * They are also a hard gate for the Anthropic Connectors Directory, which
 * requires every tool to carry a `title` plus the applicable hint.
 *
 * Presence is the easy half and the half a checklist can enforce. The half that
 * rots is *truth*: someone adds a write to an existing tool and the annotation
 * it was born with quietly becomes a lie. So the second test here doesn't read
 * the annotations at all — it calls every tool that claims to be read-only
 * against a real populated data directory and fingerprints the whole tree before
 * and after. If anything on disk moved, the claim was false.
 *
 * The four tools that genuinely write (`pipeline_add`, `pipeline_update`, `capture_insight`,
 * `generate_rejection_response`) are asserted as writers rather than skipped, so
 * this cannot pass by everything quietly becoming read-only.
 */

const EXAMPLE_DATA_PATH = fileURLToPath(new URL("../../data/example", import.meta.url));

/** Content fingerprint of an entire directory tree: paths + bytes. */
function fingerprint(dir: string): string {
  const hash = createHash("sha256");
  const walk = (d: string, prefix: string) => {
    for (const entry of readdirSync(d).sort()) {
      const full = path.join(d, entry);
      const rel = `${prefix}/${entry}`;
      if (statSync(full).isDirectory()) walk(full, rel);
      else hash.update(rel).update(readFileSync(full));
    }
  };
  walk(dir, "");
  return hash.digest("hex");
}

/** Realistic arguments for every tool, so each one runs its real path. */
const POSTING = "Director of Operations — Acme Health. Own supply chain across 14 sites. $185k-$215k.";
const ARGS: Record<string, Record<string, unknown>> = {
  explore_opportunity: { posting: POSTING, company: "Acme Health" },
  research_company: { company: "Acme Health", role: "Director of Operations" },
  tailor_resume: { posting: POSTING },
  generate_cover_letter: { posting: POSTING, company: "Acme Health" },
  format_for_ats: { resumeContent: "Alex Rivera\n• Cut supply cost 18%", targetSystem: "greenhouse" },
  classify_email: { emailContent: "Thanks for applying. Can you do Thursday at 2pm?" },
  prepare_interview: { interviewType: "panel", company: "Acme Health", role: "Director" },
  // demo-001 in data/example is mid-process: two recorded rounds plus journal
  // entries that match on company/role, so this exercises the real arc path.
  interview_arc: { applicationId: "demo-001", nextRoundType: "final", interviewSoFarNotes: "Panel asked about capacity planning; compliance question stalled." },
  evaluate_offer: { offerDetails: "Base $198,000, 20% bonus, hybrid Austin." },
  ingest_document: { content: "2025 review: exceeded on all objectives.", documentType: "performance_review" },
  // Deliberately exercise the write-flavoured flags on the two read-only tools
  // whose parameters used to advertise a write they never performed.
  pipeline_view: { action: "list" },
  pipeline_add: { company: "Acme Health", role: "Director" },
  pipeline_update: { id: "does-not-exist", status: "interviewing" },
  capture_insight: { type: "win", summary: "Panel liked the WMS story." },
  // Pointed at THIS repository, which is a real git repo with real history, so
  // the read-only claim is proved against a tool that actually did work rather
  // than one that bailed early on a bad path.
  harvest_evidence: { projectPath: process.cwd(), since: "2026-08-01" },
  generate_rejection_response: { rejectionContent: "We went with another candidate." },
  // `checkForUpdates: false` because this suite must not reach the npm registry;
  // the update check is exercised with an injected stub in upgrade-scenarios.
  // The dashboard probe stays on, aimed at a port nothing should be serving, so
  // the read-only claim is tested against the path a real user runs.
  check_setup: { checkForUpdates: false, dashboardPort: 59999 },
};

const KNOWN_WRITERS = ["pipeline_add", "pipeline_update", "capture_insight", "generate_rejection_response"];

async function connect() {
  const server = createServer();
  const client = new Client({ name: "annotations-test", version: "0.0.0" });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(s), client.connect(c)]);
  return client;
}

describe("tool annotations", () => {
  let dataDir: string;
  let originalDataPath: string | undefined;

  beforeEach(() => {
    originalDataPath = process.env.CAREER_DATA_PATH;
    dataDir = mkdtempSync(path.join(tmpdir(), "cc-annotations-"));
    mkdirSync(dataDir, { recursive: true });
    cpSync(EXAMPLE_DATA_PATH, dataDir, { recursive: true });
    process.env.CAREER_DATA_PATH = dataDir;
  });

  afterEach(() => {
    if (originalDataPath === undefined) delete process.env.CAREER_DATA_PATH;
    else process.env.CAREER_DATA_PATH = originalDataPath;
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("every tool carries a title and an applicable hint (directory requirement)", async () => {
    const client = await connect();
    try {
      const { tools } = await client.listTools();
      const bad = tools
        .filter((t) => {
          const a = t.annotations ?? {};
          const hasHint = "readOnlyHint" in a || "destructiveHint" in a;
          return !t.title || !hasHint;
        })
        .map((t) => `${t.name}(title=${Boolean(t.title)}, hints=${JSON.stringify(t.annotations ?? {})})`);
      expect(
        bad,
        `the Connectors Directory requires a title and readOnlyHint/destructiveHint on every tool; ` +
          `these are incomplete: ${bad.join(", ")}`,
      ).toEqual([]);
    } finally {
      await client.close();
    }
  });

  it("every tool claiming readOnlyHint leaves the data directory byte-identical", async () => {
    const client = await connect();
    try {
      const { tools } = await client.listTools();
      const readOnly = tools.filter((t) => t.annotations?.readOnlyHint === true);
      expect(readOnly.length, "expected some read-only tools").toBeGreaterThan(5);

      const liars: string[] = [];
      for (const tool of readOnly) {
        const args = ARGS[tool.name];
        expect(args, `no test arguments defined for ${tool.name} — add them`).toBeTruthy();

        const before = fingerprint(dataDir);
        await client.callTool({ name: tool.name, arguments: args });
        const after = fingerprint(dataDir);
        if (before !== after) liars.push(tool.name);
      }
      expect(
        liars,
        `these tools declare readOnlyHint: true but modified the data directory: ${liars.join(", ")}. ` +
          `A host may auto-approve a read-only tool without prompting the user, so a false hint ` +
          `silently removes their consent step.`,
      ).toEqual([]);
    } finally {
      await client.close();
    }
  });

  it("the tools that do write are declared as writers, not quietly read-only", async () => {
    const client = await connect();
    try {
      const { tools } = await client.listTools();
      const wronglyReadOnly = tools
        .filter((t) => KNOWN_WRITERS.includes(t.name) && t.annotations?.readOnlyHint === true)
        .map((t) => t.name);
      expect(
        wronglyReadOnly,
        `${wronglyReadOnly.join(", ")} write to disk but claim readOnlyHint: true. ` +
          `This test exists so the read-only check above cannot pass by everything becoming read-only.`,
      ).toEqual([]);
    } finally {
      await client.close();
    }
  });

  it("actually persists a change when a writer is called (the fingerprint can detect writes)", async () => {
    // Negative control for the harness itself: if fingerprint() were broken, the
    // read-only test above would pass vacuously.
    const client = await connect();
    try {
      const before = fingerprint(dataDir);
      await client.callTool({ name: "pipeline_add", arguments: ARGS.pipeline_add });
      const after = fingerprint(dataDir);
      expect(after, "pipeline_add should change the data directory").not.toBe(before);
    } finally {
      await client.close();
    }
  });
});
