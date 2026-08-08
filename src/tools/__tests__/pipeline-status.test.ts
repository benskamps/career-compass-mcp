import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerPipelineTools } from "../pipeline.js";
import { loadPipeline } from "../../storage/file-store.js";
import { STATUS_ORDER } from "../../schemas/career-schema.js";

/**
 * Guard: statuses are validated, and an initial status is honoured.
 *
 * Two holes sat next to each other. `pipeline_add` took no status at all and
 * hardcoded "applied", so tracking a job you have only *found* — the whole
 * point of the `discovered` stage — was impossible through the tool that
 * creates applications. And `pipeline_update` accepted whatever the schema let
 * through, with no check that the move made sense.
 *
 * The bar deliberately stops short of a state machine: real searches jump
 * (applied straight to rejected, ghosted back to interviewing months later),
 * and a pipeline that argues with reality is worse than one that records it.
 * What is refused is a value that is not a status at all, and the one move that
 * cannot describe anything real: leaving `accepted` for a live funnel stage.
 */

let client: Client;
let dataDir: string;
let originalDataPath: string | undefined;

async function call(name: string, args: Record<string, unknown>): Promise<string> {
  const res = await client.callTool({ name, arguments: args });
  return ((res.content ?? []) as Array<{ text?: string }>).map((c) => c.text ?? "").join("\n");
}

/** The id printed by pipeline_add, so follow-up calls can address the app. */
function idFrom(text: string): string {
  const m = /ID: `([^`]+)`/.exec(text);
  expect(m, `no id in: ${text}`).not.toBeNull();
  return m![1];
}

beforeEach(async () => {
  originalDataPath = process.env.CAREER_DATA_PATH;
  dataDir = await mkdtemp(join(tmpdir(), "cc-status-"));
  process.env.CAREER_DATA_PATH = dataDir;

  const server = new McpServer({ name: "status-test", version: "0.0.0" });
  registerPipelineTools(server);
  const [c, s] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "status-test-client", version: "0.0.0" });
  await Promise.all([client.connect(c), server.connect(s)]);
});

afterEach(async () => {
  await client?.close();
  if (originalDataPath === undefined) delete process.env.CAREER_DATA_PATH;
  else process.env.CAREER_DATA_PATH = originalDataPath;
  await rm(dataDir, { recursive: true, force: true });
});

describe("pipeline_add honours an initial status", () => {
  it("stores the status it was given", async () => {
    await call("pipeline_add", { company: "Veridian", role: "Director", status: "discovered" });
    const { applications } = await loadPipeline();
    expect(applications[0].status).toBe("discovered");
  });

  it("dates a discovered application as discovered, not applied", async () => {
    await call("pipeline_add", { company: "Veridian", role: "Director", status: "discovered" });
    const app = (await loadPipeline()).applications[0];
    expect(app.dateDiscovered).toBeTruthy();
    expect(app.dateApplied).toBeUndefined();
  });

  it("still defaults to applied", async () => {
    await call("pipeline_add", { company: "Meridian", role: "Head of CS" });
    const app = (await loadPipeline()).applications[0];
    expect(app.status).toBe("applied");
    expect(app.dateApplied).toBe(new Date().toISOString().slice(0, 10));
  });

  it("refuses a status that does not exist, and adds nothing", async () => {
    const text = await call("pipeline_add", { company: "Nowhere", role: "X", status: "in_review" });
    expect(text).toMatch(/isn't a pipeline status/i);
    for (const s of STATUS_ORDER) expect(text).toContain(s);
    expect((await loadPipeline()).applications).toHaveLength(0);
  });

  it("accepts a status the caller typed loosely", async () => {
    await call("pipeline_add", { company: "Loose", role: "X", status: " Screening " });
    expect((await loadPipeline()).applications[0].status).toBe("screening");
  });
});

describe("pipeline_update validates the status it is given", () => {
  it("suggests the nearest real status", async () => {
    const id = idFrom(await call("pipeline_add", { company: "Acme", role: "PM" }));
    const text = await call("pipeline_update", { id, status: "interview" });
    expect(text).toMatch(/isn't a pipeline status/i);
    expect(text).toContain("interviewing");
    expect((await loadPipeline()).applications[0].status).toBe("applied");
  });

  it("allows the jumps a real search makes", async () => {
    const id = idFrom(await call("pipeline_add", { company: "Acme", role: "PM" }));
    // applied straight to rejected, with no rounds in between.
    await call("pipeline_update", { id, status: "rejected" });
    expect((await loadPipeline()).applications[0].status).toBe("rejected");
    // …and back into the funnel when the company re-opens the role.
    await call("pipeline_update", { id, status: "interviewing" });
    expect((await loadPipeline()).applications[0].status).toBe("interviewing");
  });

  it("refuses to move an accepted offer back into the funnel", async () => {
    const id = idFrom(await call("pipeline_add", { company: "Acme", role: "PM" }));
    await call("pipeline_update", { id, status: "accepted" });
    const text = await call("pipeline_update", { id, status: "screening" });
    expect(text).toMatch(/accepted/i);
    expect((await loadPipeline()).applications[0].status).toBe("accepted");
  });

  it("still lets an accepted offer close out", async () => {
    // Offers get rescinded. That is a terminal-to-terminal move, not a rewind.
    const id = idFrom(await call("pipeline_add", { company: "Acme", role: "PM" }));
    await call("pipeline_update", { id, status: "accepted" });
    await call("pipeline_update", { id, status: "withdrawn" });
    expect((await loadPipeline()).applications[0].status).toBe("withdrawn");
  });

  it("leaves the rest of the update alone when the status is bad", async () => {
    const id = idFrom(await call("pipeline_add", { company: "Acme", role: "PM" }));
    await call("pipeline_update", { id, status: "nonsense", notes: "should not land" });
    const app = (await loadPipeline()).applications[0];
    expect(app.notes).toHaveLength(0);
  });
});
