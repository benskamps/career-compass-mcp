import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../server.js";
import { PKG_VERSION } from "../version.js";

/**
 * End-to-end smoke test for the MCP server wiring.
 *
 * Connects a real MCP {@link Client} to {@link createServer} over an in-memory
 * linked transport pair — no stdio, no subprocess — and exercises the contract
 * a `npm publish` depends on: the initialize handshake, the registered
 * tool/resource/prompt surface, and the happy-path output of the three tool
 * families (resume, pipeline, interview). `getDataDir()` reads
 * `CAREER_DATA_PATH` at call-time, so pointing it at the in-repo example KB is
 * all that is needed to hydrate the tools — no production change required.
 *
 * Guards against a future refactor silently breaking registration. Without it,
 * a broken tool/resource/prompt wiring would ship green.
 */

const EXAMPLE_DATA_PATH = fileURLToPath(
  new URL("../../data/example", import.meta.url),
);

const EXPECTED_TOOLS = [
  "explore_opportunity",
  "research_company",
  "tailor_resume",
  "generate_cover_letter",
  "format_for_ats",
  "pipeline_view",
  "pipeline_add",
  "pipeline_update",
  "classify_email",
  "prepare_interview",
  "interview_arc",
  "evaluate_offer",
  "ingest_document",
  "generate_rejection_response",
  "capture_insight",
  "save_career_section",
  "check_setup",
  "harvest_evidence",
] as const;

/** Concatenate the text parts of a tool result's content array.
 *  Takes `unknown` because newer SDK releases type callTool() as a union
 *  including a compatibility variant with no content key at all. */
function textOf(result: unknown): string {
  const content = (result as { content?: unknown }).content;
  const parts = (content ?? []) as Array<{ type: string; text?: string }>;
  return parts.map((p) => p.text ?? "").join("\n");
}

describe("MCP server E2E (in-memory transport)", () => {
  let client: Client;
  let originalDataPath: string | undefined;

  beforeAll(async () => {
    originalDataPath = process.env.CAREER_DATA_PATH;
    process.env.CAREER_DATA_PATH = EXAMPLE_DATA_PATH;

    const server = createServer();
    client = new Client({ name: "e2e-test-client", version: "0.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });

  afterAll(async () => {
    await client?.close();
    if (originalDataPath === undefined) {
      delete process.env.CAREER_DATA_PATH;
    } else {
      process.env.CAREER_DATA_PATH = originalDataPath;
    }
  });

  it("completes the initialize handshake with server identity", () => {
    expect(client.getServerVersion()).toMatchObject({
      name: "career-compass",
      version: PKG_VERSION,
    });
  });

  it("registers every tool, including the three tool families", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();

    expect(tools).toHaveLength(EXPECTED_TOOLS.length);
    expect(names).toEqual([...EXPECTED_TOOLS].sort());
    expect(names).toContain("tailor_resume");
    expect(names).toContain("pipeline_view");
    expect(names).toContain("prepare_interview");
  });

  it("registers 8 resources", async () => {
    const { resources } = await client.listResources();
    expect(resources).toHaveLength(8);
    expect(resources.map((r) => r.uri)).toContain("career://profile");
  });

  it("registers 3 prompts", async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts).toHaveLength(3);
    expect(prompts.map((p) => p.name).sort()).toEqual([
      "interview-coach",
      "negotiation-coach",
      "resume-tailor",
    ]);
  });

  it("tailor_resume hydrates the Career KB and echoes the posting", async () => {
    const result = await client.callTool({
      name: "tailor_resume",
      arguments: {
        posting:
          "Director of Operations at a healthcare technology company. " +
          "Owns cross-functional execution and capacity optimization.",
      },
    });
    const text = textOf(result);

    expect(text).toContain("Resume Tailoring Request");
    // Career KB hydration — example profile name.
    expect(text).toContain("Alex Rivera");
    expect(text).toContain("Director of Operations");
  });

  it("pipeline_view(stats) reports the 8 example applications", async () => {
    const result = await client.callTool({
      name: "pipeline_view",
      arguments: { action: "stats" },
    });
    const text = textOf(result);

    expect(text).toContain("Pipeline Statistics");
    expect(text).toContain("**Total applications:** 8");
  });

  it("prepare_interview produces type-tailored prep with KB hydration", async () => {
    const result = await client.callTool({
      name: "prepare_interview",
      arguments: {
        interviewType: "behavioral",
        company: "Veridian Health",
        role: "Director of Operations",
      },
    });
    const text = textOf(result);

    expect(text).toContain("Interview Prep: BEHAVIORAL");
    expect(text).toContain("Veridian Health");
    // Career KB hydration — full KB JSON is embedded for Claude.
    expect(text).toContain("Alex Rivera");
  });
});
