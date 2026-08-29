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

  it("registers the 9 static resources, plus one per application", async () => {
    // The per-application template gained a `list` callback, so each application
    // is now individually browsable and attachable — a host can hand the model
    // one application instead of the whole pipeline. A fixed count here would
    // have to be edited every time the sample data changes; the contract is
    // "the nine fixed ones, and one row per application".
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri);

    const STATIC = [
      "career://profile",
      "career://experience",
      "career://skills",
      "career://projects",
      "career://education",
      "career://testimonials",
      "career://full",
      "career://journal",
      "career://pipeline",
    ];
    for (const uri of STATIC) expect(uris, `missing ${uri}`).toContain(uri);

    const perApplication = uris.filter((u) => /^career:\/\/pipeline\/.+/.test(u));
    // `contents[0]` is a text-or-blob union; narrow rather than cast, so a
    // future blob resource fails here loudly instead of at runtime.
    const first = (await client.readResource({ uri: "career://pipeline" })).contents[0];
    expect("text" in first, "career://pipeline returned a blob, not text").toBe(true);
    const { applications } = JSON.parse((first as { text: string }).text);
    expect(perApplication).toHaveLength(applications.length);
    expect(resources).toHaveLength(STATIC.length + applications.length);
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
