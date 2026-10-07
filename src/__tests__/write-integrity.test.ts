import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../server.js";

/**
 * The write-integrity lane of the eval suite.
 *
 * `claude plugin eval` answers every tool from recorded mocks, so a scored run
 * says what the model wrote in its reply, never what reached the disk. This
 * lane needs no model: it sends each write tool the kind of call the eval cases
 * produce, against the real server on a scratch copy of Alex Rivera's KB, and
 * checks that the files hold exactly what the tool's own reply says it wrote.
 * `eval-src/replay.mjs` does the same for tool calls recorded in eval traces.
 */

const EXAMPLE = fileURLToPath(new URL("../../data/example", import.meta.url));

function textOf(result: unknown): string {
  const parts = ((result as { content?: unknown }).content ?? []) as Array<{ text?: string }>;
  return parts.map((p) => p.text ?? "").join("\n");
}

function isError(result: unknown): boolean {
  return (result as { isError?: boolean }).isError === true;
}

describe("write integrity: what the tools say they wrote is what is on disk", () => {
  let dir: string;
  let client: Client;
  let server: ReturnType<typeof createServer>;
  let saved: string | undefined;

  const yaml = (rel: string) => parseYaml(readFileSync(join(dir, rel), "utf-8"));
  const apps = () => {
    const doc = yaml("pipeline/applications.yaml");
    return (Array.isArray(doc) ? doc : doc.applications) as Array<Record<string, unknown>>;
  };
  const call = (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args });

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "cc-write-integrity-"));
    cpSync(EXAMPLE, dir, { recursive: true });
    saved = process.env.CAREER_DATA_PATH;
    process.env.CAREER_DATA_PATH = dir;
    server = createServer();
    client = new Client({ name: "write-integrity", version: "0.0.0" });
    const [c, s] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(s), client.connect(c)]);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
    if (saved === undefined) delete process.env.CAREER_DATA_PATH;
    else process.env.CAREER_DATA_PATH = saved;
    rmSync(dir, { recursive: true, force: true });
  });

  it("pipeline_add: the new application is on disk with the id the reply names", async () => {
    const before = apps().length;
    const res = await call("pipeline_add", { company: "Quillfeather Health", role: "VP of Operations" });
    expect(isError(res)).toBe(false);
    const id = textOf(res).match(/ID: `([^`]+)`/)?.[1];
    expect(id).toBeTruthy();
    const after = apps();
    expect(after.length).toBe(before + 1);
    expect(after.find((a) => a.id === id)).toMatchObject({ company: "Quillfeather Health", role: "VP of Operations" });
  });

  it("pipeline_update: the status the reply reports is the status on disk", async () => {
    const res = await call("pipeline_update", { id: "demo-005", status: "interviewing" });
    expect(isError(res)).toBe(false);
    expect(textOf(res)).toMatch(/interviewing/);
    expect(apps().find((a) => a.id === "demo-005")?.status).toBe("interviewing");
  });

  it("pipeline_update with an unknown id is an error and changes nothing", async () => {
    const before = readFileSync(join(dir, "pipeline/applications.yaml"), "utf-8");
    const res = await call("pipeline_update", { id: "nope-000", status: "interviewing" });
    expect(isError(res)).toBe(true);
    expect(readFileSync(join(dir, "pipeline/applications.yaml"), "utf-8")).toBe(before);
  });

  it("capture_insight: one entry is appended and nothing else in the journal changes", async () => {
    const before = yaml("career/journal.yaml") as unknown[];
    const res = await call("capture_insight", {
      type: "interview_insight", company: "Stratos Cloud", summary: "Hiring manager probed program rigor; the OKR story landed.",
    });
    expect(isError(res)).toBe(false);
    const after = yaml("career/journal.yaml") as Array<Record<string, unknown>>;
    expect(after.length).toBe(before.length + 1);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.at(-1)).toMatchObject({ company: "Stratos Cloud", type: "interview_insight" });
  });

  it("generate_rejection_response without applicationId writes nothing", async () => {
    const before = readFileSync(join(dir, "pipeline/applications.yaml"), "utf-8");
    await call("generate_rejection_response", { rejectionContent: "We have decided to move forward with other candidates." });
    expect(readFileSync(join(dir, "pipeline/applications.yaml"), "utf-8")).toBe(before);
  });

  it("generate_rejection_response with applicationId marks only that application rejected", async () => {
    const others = apps().filter((a) => a.id !== "demo-005").map((a) => [a.id, a.status]);
    await call("generate_rejection_response", {
      applicationId: "demo-005", rejectionContent: "We have decided to move forward with other candidates.",
    });
    const after = apps();
    expect(after.find((a) => a.id === "demo-005")?.status).toBe("rejected");
    expect(after.filter((a) => a.id !== "demo-005").map((a) => [a.id, a.status])).toEqual(others);
  });

  it("save_career_section: adding an achievement keeps every role and achievement already stored", async () => {
    const before = yaml("career/experience.yaml") as Array<{ company: string; achievements: unknown[] }>;
    const next = structuredClone(before);
    next[0].achievements.push({ metric: "Rolled out e-prescribing to 14 clinics in 5 months", context: "MedFlow", impact: "" });
    const res = await call("save_career_section", { section: "experience", data: next });
    expect(isError(res)).toBe(false);
    const after = yaml("career/experience.yaml") as Array<{ company: string; achievements: unknown[] }>;
    expect(after.map((e) => e.company)).toEqual(before.map((e) => e.company));
    expect(after[0].achievements.length).toBe(before[0].achievements.length + 1);
  });

  it("save_career_section: a save that would drop roles is refused and the file is untouched", async () => {
    const before = readFileSync(join(dir, "career/experience.yaml"), "utf-8");
    const first = (parseYaml(before) as unknown[]).slice(0, 1);
    const res = await call("save_career_section", { section: "experience", data: first });
    expect(textOf(res)).toMatch(/Not saved|refus/i);
    expect(readFileSync(join(dir, "career/experience.yaml"), "utf-8")).toBe(before);
  });
});
