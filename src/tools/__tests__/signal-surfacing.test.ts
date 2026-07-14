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

/**
 * Slice 2b: the accruing KB must *compound visibly* — captured journal signals
 * should surface into the generative tools that consume the KB. Driven through a
 * real in-memory MCP Client against a throwaway copy of data/example (which ships
 * an example journal.yaml for Alex Rivera).
 */

const EXAMPLE_DIR = fileURLToPath(new URL("../../../data/example", import.meta.url));
const ORIGINAL_PATH = process.env.CAREER_DATA_PATH;

let client: Client;
let dataDir: string;

async function callText(name: string, args: Record<string, unknown>): Promise<string> {
  const res = await client.callTool({ name, arguments: args });
  const content = res.content as Array<{ type: string; text?: string }>;
  return content.map((c) => c.text ?? "").join("\n");
}

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "cc-surface-"));
  await cp(EXAMPLE_DIR, dataDir, { recursive: true });
  process.env.CAREER_DATA_PATH = dataDir;

  const server = new McpServer({ name: "surface-test", version: "0.0.0" });
  registerOpportunityTools(server);
  registerResumeTools(server);
  registerInterviewTools(server);
  const [ct, st] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "surface-test-client", version: "0.0.0" });
  await Promise.all([client.connect(ct), server.connect(st)]);
});

afterAll(async () => {
  await client?.close();
  if (ORIGINAL_PATH === undefined) delete process.env.CAREER_DATA_PATH;
  else process.env.CAREER_DATA_PATH = ORIGINAL_PATH;
  await rm(dataDir, { recursive: true, force: true });
});

describe("journal signals surface into generative tools", () => {
  it("tailor_resume includes the Recent Career Signals digest", async () => {
    const text = await callText("tailor_resume", { posting: "Director of Operations, healthcare." });
    expect(text).toContain("## Recent Career Signals");
    expect(text).toContain("healthcare-domain");
  });

  it("explore_opportunity surfaces the recurring-signal pattern (informs fit/gaps)", async () => {
    const text = await callText("explore_opportunity", {
      posting: "Director of Operations at a healthcare technology company.",
      company: "Veridian Health",
    });
    expect(text).toContain("## Recent Career Signals");
    // healthcare-domain recurs 3× in the example journal — the pattern a fit
    // analysis should weigh.
    expect(text).toContain("Recurring signals:");
    expect(text).toContain("healthcare-domain ×3");
  });

  it("prepare_interview includes the digest alongside the full KB", async () => {
    const text = await callText("prepare_interview", {
      interviewType: "behavioral",
      company: "Veridian Health",
      role: "Director of Operations",
    });
    expect(text).toContain("## Recent Career Signals");
    expect(text).toContain("stakeholder-management");
  });
});
