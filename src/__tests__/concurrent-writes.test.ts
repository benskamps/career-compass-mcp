import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../server.js";

/**
 * Concurrency guard: two tool calls in one turn must not destroy each other.
 *
 * Every mutating tool used to run read-modify-write with no mutual exclusion:
 * the tool callback did `const pipeline = await loadPipeline()`, handed that
 * snapshot to a handler, and the handler pushed onto it and called
 * `savePipeline`. `atomicWriteYaml` made each individual *write* atomic, which
 * is a different guarantee entirely — it stops a reader seeing a half-written
 * file, and does nothing to stop two overlapping read-modify-write cycles from
 * clobbering one another.
 *
 * That made this a race on the happy path rather than an exotic one. An MCP
 * client is free to dispatch several `tools/call` requests before any of them
 * resolves, and Claude routinely does exactly that when a user says "add both
 * of these jobs" or "log those two insights" — the SDK's stdio transport drains
 * every framed message in a chunk synchronously and dispatches each without
 * awaiting the previous. Two `manage_pipeline add` calls in one turn both
 * returned "✅ Added", and one application was simply gone. There is no server
 * copy, no audit log, and no undo — for a tool whose whole job is being the
 * durable record of a job search, that is the worst possible failure mode: the
 * user is told, in writing, that data was saved that never was.
 *
 * The `.bak` files do not rescue it either. Both writers check `existsSync`
 * before either renames, so on a fresh store neither takes a backup at all.
 *
 * These tests drive the real server through a real MCP client over a linked
 * in-memory transport — the same harness as server-e2e — because the defect
 * lives in the tool callback's load-then-hand-off, not in any handler. Testing
 * the handlers directly would pass while the product stayed broken.
 */

const applicationsOnDisk = (dir: string): Array<{ company: string; role: string; status: string }> => {
  const p = path.join(dir, "pipeline", "applications.yaml");
  if (!existsSync(p)) return [];
  return (parseYaml(readFileSync(p, "utf-8")) as { applications?: [] }).applications ?? [];
};

const journalOnDisk = (dir: string): Array<{ summary: string }> => {
  const p = path.join(dir, "career", "journal.yaml");
  if (!existsSync(p)) return [];
  return (parseYaml(readFileSync(p, "utf-8")) as []) ?? [];
};

async function connectedClient(): Promise<{ client: Client; close: () => Promise<void> }> {
  const server = createServer();
  const client = new Client({ name: "concurrency-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, close: async () => { await client.close(); } };
}

describe("concurrent writes must not lose data", () => {
  let dataDir: string;
  let originalDataPath: string | undefined;

  beforeEach(() => {
    originalDataPath = process.env.CAREER_DATA_PATH;
    dataDir = mkdtempSync(path.join(tmpdir(), "cc-concurrency-"));
    mkdirSync(path.join(dataDir, "career"), { recursive: true });
    mkdirSync(path.join(dataDir, "pipeline"), { recursive: true });
    process.env.CAREER_DATA_PATH = dataDir;
  });

  afterEach(() => {
    if (originalDataPath === undefined) delete process.env.CAREER_DATA_PATH;
    else process.env.CAREER_DATA_PATH = originalDataPath;
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("persists both applications when two `add` calls are dispatched together", async () => {
    const { client, close } = await connectedClient();
    try {
      const results = await Promise.all([
        client.callTool({ name: "manage_pipeline", arguments: { action: "add", company: "Acme", role: "Director of Operations" } }),
        client.callTool({ name: "manage_pipeline", arguments: { action: "add", company: "Globex", role: "VP Supply Chain" } }),
      ]);

      // Both calls reported success to the user...
      for (const r of results) expect((r as { isError?: boolean }).isError ?? false).toBe(false);

      // ...so both must be on disk. Anything less means we lied in writing.
      const companies = applicationsOnDisk(dataDir).map((a) => a.company).sort();
      expect(companies).toEqual(["Acme", "Globex"]);
    } finally {
      await close();
    }
  });

  it("keeps an existing application when a concurrent `add` lands", async () => {
    const { client, close } = await connectedClient();
    try {
      await client.callTool({ name: "manage_pipeline", arguments: { action: "add", company: "Initech", role: "Engineer" } });

      await Promise.all([
        client.callTool({ name: "manage_pipeline", arguments: { action: "add", company: "Acme", role: "Director" } }),
        client.callTool({ name: "manage_pipeline", arguments: { action: "add", company: "Globex", role: "VP" } }),
      ]);

      expect(applicationsOnDisk(dataDir).map((a) => a.company).sort()).toEqual(["Acme", "Globex", "Initech"]);
    } finally {
      await close();
    }
  });

  it("does not silently revert an `update` that overlaps an `add`", async () => {
    // The nastiest variant: the counts still look right, so nothing tips the
    // user off — the tool says "✅ Updated" and the status change is gone.
    const { client, close } = await connectedClient();
    try {
      const added = await client.callTool({ name: "manage_pipeline", arguments: { action: "add", company: "Initech", role: "Engineer" } });
      const id = /ID: `([^`]+)`/.exec(
        ((added as { content?: Array<{ text?: string }> }).content ?? []).map((c) => c.text ?? "").join(""),
      )?.[1];
      expect(id, "add should report the new application id").toBeTruthy();

      await Promise.all([
        client.callTool({ name: "manage_pipeline", arguments: { action: "update", id, status: "interviewing" } }),
        client.callTool({ name: "manage_pipeline", arguments: { action: "add", company: "Acme", role: "Director" } }),
      ]);

      const apps = applicationsOnDisk(dataDir);
      expect(apps.map((a) => a.company).sort()).toEqual(["Acme", "Initech"]);
      expect(apps.find((a) => a.company === "Initech")?.status).toBe("interviewing");
    } finally {
      await close();
    }
  });

  it("persists both journal entries when two `capture_insight` calls are dispatched together", async () => {
    // appendJournalEntry is load-then-write with the same hole.
    const { client, close } = await connectedClient();
    try {
      await Promise.all([
        client.callTool({ name: "capture_insight", arguments: { type: "win", summary: "first insight" } }),
        client.callTool({ name: "capture_insight", arguments: { type: "note", summary: "second insight" } }),
      ]);

      const summaries = journalOnDisk(dataDir).map((e) => e.summary).sort();
      expect(summaries).toEqual(["first insight", "second insight"]);
    } finally {
      await close();
    }
  });

  it("survives a burst of eight concurrent adds without losing one", async () => {
    const { client, close } = await connectedClient();
    try {
      const companies = Array.from({ length: 8 }, (_, i) => `Company${i}`);
      await Promise.all(
        companies.map((company) =>
          client.callTool({ name: "manage_pipeline", arguments: { action: "add", company, role: "Role" } }),
        ),
      );
      expect(applicationsOnDisk(dataDir).map((a) => a.company).sort()).toEqual([...companies].sort());
    } finally {
      await close();
    }
  });
});
