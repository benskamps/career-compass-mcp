import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerCareerKBTools } from "../career-kb.js";
import { loadJournal } from "../../storage/file-store.js";

/**
 * End-to-end coverage for the capture_insight tool — the write surface of the
 * accruing KB. Driven through a real in-memory MCP Client/Server pair against a
 * throwaway CAREER_DATA_PATH, so it exercises tool registration + input-schema
 * validation and the actual persistence path, without touching repo fixtures.
 */

const ORIGINAL_PATH = process.env.CAREER_DATA_PATH;
let dataDir: string;
let client: Client;

async function callText(name: string, args: Record<string, unknown>): Promise<string> {
  const res = await client.callTool({ name, arguments: args });
  const content = res.content as Array<{ type: string; text?: string }>;
  return content.map((c) => c.text ?? "").join("\n");
}

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "cc-capture-"));
  process.env.CAREER_DATA_PATH = dataDir;

  const server = new McpServer({ name: "capture-test", version: "0.0.0" });
  registerCareerKBTools(server);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "capture-test-client", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
});

afterEach(async () => {
  await client?.close();
  if (ORIGINAL_PATH === undefined) delete process.env.CAREER_DATA_PATH;
  else process.env.CAREER_DATA_PATH = ORIGINAL_PATH;
  await rm(dataDir, { recursive: true, force: true });
});

describe("capture_insight", () => {
  it("is registered as a tool", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("capture_insight");
  });

  it("persists an entry to the journal and confirms it", async () => {
    const text = await callText("capture_insight", {
      type: "rejection_pattern",
      summary: "Passed the panel but lost on 'domain depth' — third time this quarter.",
      company: "Veridian Health",
      role: "Director of Operations",
      signals: ["domain-depth", "healthcare"],
      sentiment: "hard",
      source: "rejection",
    });

    expect(text).toContain("career journal");
    expect(text).toContain("rejection_pattern");
    expect(text).toContain("Veridian Health");
    expect(text).toContain("domain-depth");
    expect(text).toContain("**1** entry");

    const journal = await loadJournal();
    expect(journal).toHaveLength(1);
    expect(journal[0]).toMatchObject({
      type: "rejection_pattern",
      company: "Veridian Health",
      sentiment: "hard",
      source: "rejection",
      signals: ["domain-depth", "healthcare"],
    });
    expect(journal[0].id).toMatch(/^[0-9a-f]{8}$/);
    expect(journal[0].date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("accumulates across calls (the KB compounds)", async () => {
    await callText("capture_insight", { type: "win", summary: "Nailed the take-home." });
    const second = await callText("capture_insight", { type: "note", summary: "Follow up with the recruiter Monday." });

    expect(second).toContain("**2** entries");
    expect(await loadJournal()).toHaveLength(2);
  });

  it("defaults source to manual and signals to [] when omitted", async () => {
    await callText("capture_insight", { type: "note", summary: "Minimal entry." });
    const [only] = await loadJournal();
    expect(only.source).toBe("manual");
    expect(only.signals).toEqual([]);
  });

  it("rejects an entry with no summary (schema validation)", async () => {
    // The MCP SDK surfaces input-schema violations as an error *result*
    // (isError: true), not a thrown/rejected promise.
    const res = await client.callTool({ name: "capture_insight", arguments: { type: "note" } });
    expect(res.isError).toBe(true);
    const text = (res.content as Array<{ text?: string }>).map((c) => c.text ?? "").join("\n");
    expect(text).toMatch(/validation error/i);
    expect(await loadJournal()).toEqual([]);
  });
});
