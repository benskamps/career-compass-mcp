import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerCareerResources } from "../career-kb.js";

/**
 * Career KB read resources, driven over a real in-memory client/server pair so
 * the read callbacks run exactly as a host would invoke them.
 *
 * Two things under test here that a mapping-table unit test cannot see:
 *   1. career://journal is registered and reads through the journal loader.
 *   2. a corrupt data file surfaces as a resource payload naming the problem,
 *      not as a raw transport error — the parity the pipeline tools already have.
 */

let dir: string;
let client: Client;
let server: McpServer;

async function connect() {
  server = new McpServer({ name: "kb-res-test", version: "0.0.0" });
  registerCareerResources(server);
  client = new Client({ name: "kb-res-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
}

function textOf(contents: unknown): string {
  const first = (contents as Array<Record<string, unknown>>)[0];
  if (!first || typeof first.text !== "string") throw new Error("resource returned no text");
  return first.text;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cc-kbres-"));
  mkdirSync(join(dir, "career"), { recursive: true });
  mkdirSync(join(dir, "pipeline"), { recursive: true });
  process.env.CAREER_DATA_PATH = dir;
});

afterEach(async () => {
  await client?.close();
  delete process.env.CAREER_DATA_PATH;
  rmSync(dir, { recursive: true, force: true });
});

describe("career KB read resources", () => {
  it("registers career://journal alongside the other section resources", async () => {
    await connect();
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toContain("career://journal");
  });

  it("reads career://journal through the journal loader (empty store → [])", async () => {
    await connect();
    const res = await client.readResource({ uri: "career://journal" });
    expect(JSON.parse(textOf(res.contents))).toEqual([]);
  });

  it("reads career://journal entries when the journal has content", async () => {
    writeFileSync(
      join(dir, "career", "journal.yaml"),
      "- id: sig-1\n  type: win\n  date: '2026-01-01T00:00:00.000Z'\n  summary: shipped the thing\n",
    );
    await connect();
    const res = await client.readResource({ uri: "career://journal" });
    const journal = JSON.parse(textOf(res.contents));
    expect(Array.isArray(journal)).toBe(true);
    expect(journal[0]?.id).toBe("sig-1");
  });

  // ── NC (WP-3 item 5): corrupt data → payload, not a transport error ──────────
  // A file that exists but fails schema validation makes the loader throw
  // CorruptDataError. Without the read-wrapper's try/catch, that throw becomes a
  // JSON-RPC error and `readResource` REJECTS — the client sees an opaque
  // protocol failure for a recoverable, self-inflicted state. With it, the read
  // resolves with a payload that names the problem. Deleting the try/catch in the
  // journal handler turns this test red (the await rejects).
  it("surfaces a corrupt journal as a resource payload, not a raw transport error", async () => {
    // Valid YAML, wrong shape: JournalSection is an array, this is a mapping.
    writeFileSync(join(dir, "career", "journal.yaml"), "not_a_list: true\n");
    await connect();
    const res = await client.readResource({ uri: "career://journal" });
    const payload = JSON.parse(textOf(res.contents));
    expect(payload.error).toMatch(/unreadable or invalid/);
  });

  it("surfaces a corrupt profile the same way on career://full", async () => {
    // Same posture on the aggregate: a corrupt section file must not throw the
    // whole full-KB read into the transport.
    writeFileSync(join(dir, "career", "profile.yaml"), "- this is a list not a profile\n");
    await connect();
    const res = await client.readResource({ uri: "career://full" });
    const payload = JSON.parse(textOf(res.contents));
    expect(payload.error).toMatch(/unreadable or invalid/);
  });
});
