import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { fileURLToPath } from "url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../server.js";

/**
 * Negative controls for the read/write surfacing gaps (gauntlet-v2 P2-4/P2-5).
 *
 * The tools here all reach the store on a path that used to let a fail-closed
 * condition escape as a raw transport error, losing the one sentence that tells
 * a user what to do about it. Each test drives the REAL tool through an in-memory
 * MCP client and proves the condition comes back as a graceful, named sentence —
 * `isError` unset — rather than a throw. Without the fix each of these goes red:
 * the SDK converts an uncaught handler throw into `isError: true`.
 */

const EXAMPLE_DATA_PATH = fileURLToPath(new URL("../../data/example", import.meta.url));

async function connect() {
  const server = createServer();
  const client = new Client({ name: "read-path-nc", version: "0.0.0" });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(s), client.connect(c)]);
  return client;
}

type ToolResult = { isError?: boolean; content?: Array<{ text?: string }> };
function text(result: ToolResult): string {
  return (result.content ?? []).map((c) => c.text ?? "").join("\n");
}

/**
 * Plant a claim held by a live process that is not us — the parent process,
 * which vitest keeps alive. Mirrors lifecycle-spec.test.ts. Returns false when
 * there is no usable foreign pid (rare CI shapes), so the caller can skip.
 */
function plantForeignClaim(dir: string): boolean {
  const pid = process.ppid;
  if (!pid || pid === process.pid) return false;
  try {
    process.kill(pid, 0);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EPERM") return false;
  }
  writeFileSync(
    join(dir, ".write-claim"),
    JSON.stringify({ pid, nonce: "nc", acquiredAt: new Date().toISOString(), holder: "another process" }),
    "utf-8",
  );
  return true;
}

describe("read/write surfacing — negative controls", () => {
  it("P2-4 · generate_rejection_response surfaces an unavailable write claim as a sentence, not a throw", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cc-nc-reject-"));
    mkdirSync(join(dir, "pipeline"), { recursive: true });
    process.env.CAREER_DATA_PATH = dir;
    const planted = plantForeignClaim(dir);
    if (!planted) {
      delete process.env.CAREER_DATA_PATH;
      rmSync(dir, { recursive: true, force: true });
      return; // no live foreign pid to hold the claim; nothing to assert
    }
    const client = await connect();
    try {
      const result = (await client.callTool({
        name: "generate_rejection_response",
        arguments: { applicationId: "app-1", rejectionContent: "We went with someone else." },
      })) as ToolResult;
      // The write claim throws before the mutator runs; the guard must convert it
      // into a graceful, named refusal rather than let it escape.
      expect(result.isError, "a foreign claim escaped as a transport error").toBeFalsy();
      expect(text(result)).toContain("Nothing was written");
    } finally {
      await client.close();
      delete process.env.CAREER_DATA_PATH;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("P2-4 · prepare_interview surfaces a corrupt profile.yaml as a repair sentence, not a stack trace", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cc-nc-interview-"));
    mkdirSync(join(dir, "career"), { recursive: true });
    // profile.yaml exists but is schema-invalid (a bare scalar, not an object),
    // so loadCareerData must fail closed with a CorruptDataError.
    writeFileSync(join(dir, "career", "profile.yaml"), "not-a-valid-profile\n", "utf-8");
    process.env.CAREER_DATA_PATH = dir;
    const client = await connect();
    try {
      const result = (await client.callTool({
        name: "prepare_interview",
        arguments: { interviewType: "panel", company: "Acme Health" },
      })) as ToolResult;
      expect(result.isError, "a corrupt profile escaped as a transport error").toBeFalsy();
      expect(text(result)).toContain("Refusing to continue");
    } finally {
      await client.close();
      delete process.env.CAREER_DATA_PATH;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("P2-5 · pipeline_add refuses a write against the read-only sample store with a named sentence", async () => {
    // Pointed at the REAL bundled sample: only the actual data/example dir makes
    // servingBundledSample() true, so a copy would not exercise the refusal.
    process.env.CAREER_DATA_PATH = EXAMPLE_DATA_PATH;
    const claimFile = join(EXAMPLE_DATA_PATH, ".write-claim");
    const client = await connect();
    try {
      const result = (await client.callTool({
        name: "pipeline_add",
        arguments: { company: "Acme Health", role: "Director of Operations" },
      })) as ToolResult;
      expect(result.isError, "a read-only-store write escaped as a transport error").toBeFalsy();
      expect(text(result)).toContain("read-only demo");
    } finally {
      await client.close();
      delete process.env.CAREER_DATA_PATH;
      // The write claim is released by the store itself; clean up defensively so
      // a mid-test crash never leaves a stray claim in the tracked sample dir.
      if (existsSync(claimFile)) rmSync(claimFile, { force: true });
    }
  });

  it("P2-5 · capture_insight refuses a write against the read-only sample store with a named sentence", async () => {
    // The journal is a write path too. Before the fix, capture_insight's catch
    // handled corrupt-data and claim-unavailable but re-threw ReadOnlyStoreError
    // raw — so an insight against the demo store escaped as a transport error.
    process.env.CAREER_DATA_PATH = EXAMPLE_DATA_PATH;
    const claimFile = join(EXAMPLE_DATA_PATH, ".write-claim");
    const client = await connect();
    try {
      const result = (await client.callTool({
        name: "capture_insight",
        arguments: { type: "note", summary: "Recruiter said the role skews more IC than described." },
      })) as ToolResult;
      expect(result.isError, "a read-only-store journal write escaped as a transport error").toBeFalsy();
      expect(text(result)).toContain("read-only demo");
    } finally {
      await client.close();
      delete process.env.CAREER_DATA_PATH;
      if (existsSync(claimFile)) rmSync(claimFile, { force: true });
    }
  });
});
