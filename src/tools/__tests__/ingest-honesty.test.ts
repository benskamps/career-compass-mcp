import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerCareerKBTools } from "../career-kb.js";

/**
 * Guard: `ingest_document` does not offer to save anything.
 *
 * It shipped with an `autoSave` parameter and a closing line telling the caller
 * to "set autoSave=true to let Claude do it automatically." The tool is
 * readOnlyHint:true and has no write path at all — the flag only changed which
 * paragraph was printed. So the one surface a new user meets first advertised a
 * capability it does not have, and the honest instruction (use
 * `save_career_section`, the only tool that writes the Career KB) was missing.
 *
 * The fix is subtraction, not a new write path: the parameter is gone and the
 * output names the real saving step. This test fails if either the promise or
 * the pointer comes back wrong.
 */

let client: Client;
let dataDir: string;
let originalDataPath: string | undefined;

beforeAll(async () => {
  originalDataPath = process.env.CAREER_DATA_PATH;
  dataDir = await mkdtemp(join(tmpdir(), "cc-ingest-"));
  process.env.CAREER_DATA_PATH = dataDir;

  const server = new McpServer({ name: "ingest-honesty", version: "0.0.0" });
  registerCareerKBTools(server);
  const [c, s] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "ingest-honesty-client", version: "0.0.0" });
  await Promise.all([client.connect(c), server.connect(s)]);
});

afterAll(async () => {
  await client?.close();
  if (originalDataPath === undefined) delete process.env.CAREER_DATA_PATH;
  else process.env.CAREER_DATA_PATH = originalDataPath;
  await rm(dataDir, { recursive: true, force: true });
});

async function ingestTool() {
  const { tools } = await client.listTools();
  const tool = tools.find((t) => t.name === "ingest_document");
  expect(tool, "ingest_document is not registered").toBeDefined();
  return tool!;
}

describe("ingest_document is honest about not saving", () => {
  it("advertises no autoSave parameter", async () => {
    const tool = await ingestTool();
    const props = (tool.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
    expect(Object.keys(props)).not.toContain("autoSave");
    // Nor any other flag shaped like a promise to write.
    expect(Object.keys(props).filter((k) => /save|write|persist/i.test(k))).toEqual([]);
  });

  it("stays declared read-only", async () => {
    const tool = await ingestTool();
    expect(tool.annotations?.readOnlyHint).toBe(true);
  });

  it("points the caller at save_career_section instead", async () => {
    const res = await client.callTool({
      name: "ingest_document",
      arguments: {
        content: "Led the platform migration; cut p95 latency 40%.",
        documentType: "performance_review",
      },
    });
    const text = ((res.content ?? []) as Array<{ text?: string }>)
      .map((c) => c.text ?? "")
      .join("\n");
    expect(text).toContain("save_career_section");
    expect(text).not.toMatch(/autoSave/i);
    // No claim that anything was or will be written by this tool.
    expect(text).not.toMatch(/automatically/i);
  });

  it("writes nothing to the data directory", async () => {
    await client.callTool({
      name: "ingest_document",
      arguments: { content: "Shipped the thing.", documentType: "award" },
    });
    expect(await readdir(dataDir)).toEqual([]);
  });

  it("ignores a stale autoSave argument rather than erroring", async () => {
    // Callers (and models) that learned the old surface must not get a hard
    // failure for passing a flag that no longer exists.
    const res = await client.callTool({
      name: "ingest_document",
      arguments: { content: "Old caller.", documentType: "email", autoSave: true },
    });
    expect(res.isError).toBeFalsy();
    expect(await readdir(dataDir)).toEqual([]);
  });
});
