import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, cp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { fileURLToPath } from "url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerOpportunityTools } from "../opportunity.js";
import { registerResumeTools } from "../resume.js";
import { registerInterviewTools } from "../interview.js";
import { registerCareerKBTools } from "../career-kb.js";

/**
 * Coverage for the four "scaffold" tool modules (opportunity, resume,
 * interview, career-kb). Unlike pipeline.ts these tools are not exported as
 * pure handlers, so we drive them end-to-end through a real in-memory MCP
 * Client/Server pair — exercising tool registration, input-schema validation,
 * and the Career-KB hydration / empty-state branches users hit on first run.
 *
 * CAREER_DATA_PATH is toggled per test between a throwaway copy of the bundled
 * data/example/ (populated) and a fresh empty temp dir (no KB). file-store's
 * getDataDir() reads the env var at call time, so flipping it between calls is
 * enough. Both dirs are temp copies, so write-path tools (rejection auto-status)
 * never touch the repo's real example data.
 */

// ─── In-memory MCP harness ────────────────────────────────────────────────────

async function makeClient(): Promise<{ client: Client; server: McpServer }> {
  const server = new McpServer({ name: "scaffold-test", version: "0.0.0" });
  registerOpportunityTools(server);
  registerResumeTools(server);
  registerInterviewTools(server);
  registerCareerKBTools(server);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "scaffold-test-client", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return { client, server };
}

async function callText(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const res = await client.callTool({ name, arguments: args });
  const content = res.content as Array<{ type: string; text?: string }>;
  return content.map((c) => c.text ?? "").join("\n");
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const EXAMPLE_DIR = fileURLToPath(new URL("../../../data/example", import.meta.url));
const ORIGINAL_PATH = process.env.CAREER_DATA_PATH;

let client: Client;
let populatedDir: string;
let emptyDir: string;

async function freshExampleCopy(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "cc-copy-"));
  await cp(EXAMPLE_DIR, dir, { recursive: true });
  return dir;
}

function usePopulated(): void {
  process.env.CAREER_DATA_PATH = populatedDir;
}
function useEmpty(): void {
  process.env.CAREER_DATA_PATH = emptyDir;
}

beforeAll(async () => {
  populatedDir = await freshExampleCopy();
  emptyDir = await mkdtemp(join(tmpdir(), "cc-empty-"));
  ({ client } = await makeClient());
});

afterAll(async () => {
  if (ORIGINAL_PATH === undefined) delete process.env.CAREER_DATA_PATH;
  else process.env.CAREER_DATA_PATH = ORIGINAL_PATH;
  await client?.close();
  await rm(populatedDir, { recursive: true, force: true });
  await rm(emptyDir, { recursive: true, force: true });
});

// ─── opportunity.ts ────────────────────────────────────────────────────────────

describe("explore_opportunity", () => {
  it("inlines a career summary (name, skills, target roles) when the KB is populated", async () => {
    usePopulated();
    const text = await callText(client, "explore_opportunity", {
      posting: "Seeking a Director of Operations to scale our clinical ops org.",
    });

    expect(text).toContain("Opportunity Analysis");
    // buildCareerSummary fields
    expect(text).toContain("Alex Rivera"); // profile.name
    expect(text).toContain("Program Management"); // a top skill
    expect(text).toContain("Program Manager"); // a target role
  });

  it("returns the 'No career data found' early-return when the KB is absent", async () => {
    useEmpty();
    const text = await callText(client, "explore_opportunity", { posting: "x" });
    expect(text).toContain("No career data found");
  });
});

describe("research_company", () => {
  it("renders the brief header and target criteria from the profile", async () => {
    usePopulated();
    const text = await callText(client, "research_company", {
      company: "Veridian Health",
      role: "Director of Operations",
      applicationId: "demo-001",
    });

    expect(text).toContain("Company Research Brief: Veridian Health");
    expect(text).toContain("**Target role:** Director of Operations");
    expect(text).toContain("career://pipeline/demo-001");
    expect(text).toContain("Program Manager"); // profile.targetRoles inlined
  });

  it("degrades to 'Career KB not loaded' (not an error) when the KB is absent", async () => {
    useEmpty();
    const text = await callText(client, "research_company", { company: "Acme" });
    expect(text).toContain("Company Research Brief: Acme");
    expect(text).toContain("Career KB not loaded");
  });
});

// ─── resume.ts ─────────────────────────────────────────────────────────────────

describe("tailor_resume", () => {
  it("inlines the full Career KB JSON and echoes the requested format", async () => {
    usePopulated();
    const text = await callText(client, "tailor_resume", {
      posting: "Operations leader wanted.",
      format: "federal",
    });

    expect(text).toContain("Resume Tailoring Request");
    expect(text).toContain("**Format:** federal");
    // Full KB inlined via JSON.stringify(career, …)
    expect(text).toContain("Alex Rivera");
    expect(text).toContain("MedFlow Health Systems");
  });

  it("returns the 'No career data found' early-return when the KB is absent", async () => {
    useEmpty();
    const text = await callText(client, "tailor_resume", { posting: "x" });
    expect(text).toContain("No career data found");
  });
});

describe("generate_cover_letter", () => {
  it("slices to the top achievements per role from the KB", async () => {
    usePopulated();
    const text = await callText(client, "generate_cover_letter", {
      posting: "Director of Operations role.",
      company: "Veridian Health",
    });

    expect(text).toContain("Cover Letter Generation");
    expect(text).toContain("Alex Rivera");
    // First two MedFlow achievements are included…
    expect(text).toContain("Reduced average patient onboarding time");
    // …but the third (slice(0, 2) per role) is dropped.
    expect(text).not.toContain("Rebuilt vendor evaluation framework");
  });

  it("returns the 'No career data found' early-return when the KB is absent", async () => {
    useEmpty();
    const text = await callText(client, "generate_cover_letter", {
      posting: "x",
      company: "Acme",
    });
    expect(text).toContain("No career data found");
  });
});

describe("format_for_ats", () => {
  it("returns the system-specific guide without needing the KB", async () => {
    useEmpty();
    const text = await callText(client, "format_for_ats", {
      resumeContent: "Jane Doe — Operations Leader",
      targetSystem: "workday",
    });
    expect(text).toContain("ATS Formatting: WORKDAY");
    expect(text).toContain("Workday formatting rules");
    expect(text).toContain("Jane Doe — Operations Leader");
  });
});

// ─── interview.ts ──────────────────────────────────────────────────────────────

describe("prepare_interview", () => {
  it("merges pipeline context for an applicationId into the prep brief", async () => {
    usePopulated();
    const text = await callText(client, "prepare_interview", {
      applicationId: "demo-001",
      interviewType: "panel",
    });

    expect(text).toContain("Interview Prep: PANEL");
    // Company/role pulled from the matched application…
    expect(text).toContain("Veridian Health");
    // …plus the assembled application context block.
    expect(text).toContain("Status: interviewing");
    expect(text).toContain("Rounds completed: 2");
    expect(text).toContain("Rachel Torres (Talent Acquisition Partner)");
    // KB highlights still present.
    expect(text).toContain("Alex Rivera");
  });

  it("returns the 'No career data found' early-return when the KB is absent", async () => {
    useEmpty();
    const text = await callText(client, "prepare_interview", { interviewType: "behavioral" });
    expect(text).toContain("No career data found");
  });
});

describe("evaluate_offer", () => {
  it("merges company/role from the pipeline application (read-only)", async () => {
    usePopulated();
    const text = await callText(client, "evaluate_offer", {
      applicationId: "demo-001",
      offerDetails: "Base $170k, 15% bonus, 4-year equity.",
    });
    expect(text).toContain("Offer Evaluation: Director of Operations at Veridian Health");
    expect(text).toContain("Base $170k");
  });
});

// ─── career-kb.ts ──────────────────────────────────────────────────────────────

describe("ingest_document", () => {
  it("echoes the document and emits a YAML extraction scaffold", async () => {
    const text = await callText(client, "ingest_document", {
      content: "Awarded Employee of the Quarter for leading the migration.",
      documentType: "award",
      associatedCompany: "MedFlow",
    });
    expect(text).toContain("Career Document Ingestion");
    expect(text).toContain("**Type:** award");
    expect(text).toContain("Awarded Employee of the Quarter");
    expect(text).toContain("experience_entry:");
  });
});

describe("generate_rejection_response", () => {
  it("drafts a response without touching the pipeline when no applicationId is given", async () => {
    const text = await callText(client, "generate_rejection_response", {
      rejectionContent: "We've decided to move forward with other candidates.",
      company: "Acme",
      role: "PM",
      responseGoal: "request_feedback",
    });
    expect(text).toContain("Rejection Response");
    expect(text).toContain("**Company:** Acme");
    expect(text).toContain("**Goal:** request_feedback");
    expect(text).not.toContain("status has been automatically updated");
  });

  it("auto-updates the matched application's status to 'rejected' when given an applicationId", async () => {
    // Isolated temp copy: this path writes via savePipeline().
    const writableDir = await freshExampleCopy();
    process.env.CAREER_DATA_PATH = writableDir;
    try {
      const text = await callText(client, "generate_rejection_response", {
        applicationId: "demo-001",
        rejectionContent: "Unfortunately we won't be proceeding.",
      });
      // Company/role hydrated from the pipeline and status write acknowledged.
      expect(text).toContain("Veridian Health");
      expect(text).toContain("status has been automatically updated to 'rejected'");
    } finally {
      await rm(writableDir, { recursive: true, force: true });
    }
  });
});
