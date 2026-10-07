import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../server.js";
import { formatResumeSource } from "../tools/resume.js";
import type { CareerData } from "../schemas/career-schema.js";

/**
 * The Career KB must not lose history without the user seeing it happen.
 *
 * Before: save_career_section replaced a section without reading it, so a save
 * of one new role over three stored ones reported "✅ Saved experience (1 entry)"
 * and the other two were gone. A YAML slip in experience.yaml loaded as an empty
 * list, every tool then answered as if the user had no work history, and the
 * natural fix (save the section again) overwrote the file.
 */

type ToolResult = { isError?: boolean; content?: Array<{ text?: string }> };
const text = (r: ToolResult) => (r.content ?? []).map((c) => c.text ?? "").join("\n");

const role = (company: string, achievements = 1) => ({
  role: "Engineer", company, startDate: "2020-01", endDate: "2022-01",
  achievements: Array.from({ length: achievements }, (_, i) => ({ metric: `win ${i}`, context: "c", impact: "i", keywords: [] })),
  tags: [],
});

let dir = "";
let close: (() => Promise<void>) | null = null;

async function setup(files: Record<string, string> = {}) {
  dir = mkdtempSync(join(tmpdir(), "cc-kb-safety-"));
  mkdirSync(join(dir, "career"), { recursive: true });
  writeFileSync(join(dir, "career", "profile.yaml"), "name: Sam Lee\nsummary: Engineer.\n", "utf-8");
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, "career", name), body, "utf-8");
  process.env.CAREER_DATA_PATH = dir;
  const server = createServer();
  const client = new Client({ name: "kb-safety", version: "0.0.0" });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(s), client.connect(c)]);
  close = async () => { await client.close(); await server.close(); };
  return (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args }) as Promise<ToolResult>;
}

afterEach(async () => {
  await close?.();
  close = null;
  delete process.env.CAREER_DATA_PATH;
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("save_career_section", () => {
  it("refuses a save that would drop stored roles, and names them", async () => {
    const call = await setup();
    await call("save_career_section", { section: "experience", data: [role("Acme"), role("Globex"), role("Initech")] });
    const res = await call("save_career_section", { section: "experience", data: [role("Hooli")] });
    expect(res.isError).toBe(true);
    expect(text(res)).toContain("Engineer at Acme");
    expect(text(res)).toContain("replace: true");
    expect(readFileSync(join(dir, "career", "experience.yaml"), "utf-8")).toContain("Initech");
  });

  it("refuses a save that drops achievements from a role it keeps", async () => {
    const call = await setup();
    await call("save_career_section", { section: "experience", data: [role("Acme", 4)] });
    const res = await call("save_career_section", { section: "experience", data: [role("Acme", 1)] });
    expect(res.isError).toBe(true);
    expect(text(res)).toContain("achievements 4 → 1");
  });

  it("adds without fuss and ends with a receipt", async () => {
    const call = await setup();
    await call("save_career_section", { section: "experience", data: [role("Acme")] });
    const res = await call("save_career_section", { section: "experience", data: [role("Acme"), role("Globex")] });
    expect(res.isError).toBeFalsy();
    expect(text(res)).toContain("1 → 2 entries");
    expect(text(res)).toContain("added: Engineer at Globex");
    expect(text(res)).toContain("removed: none");
  });

  it("removes when the call says replace: true, and the receipt lists what went", async () => {
    const call = await setup();
    await call("save_career_section", { section: "experience", data: [role("Acme"), role("Globex")] });
    const res = await call("save_career_section", { section: "experience", data: [role("Acme")], replace: true });
    expect(res.isError).toBeFalsy();
    expect(text(res)).toContain("removed: Engineer at Globex");
  });

  it("won't write over a file it can't read, unless told to", async () => {
    const broken = "- role: Engineer\n  company: [unclosed\n";
    const call = await setup({ "experience.yaml": broken });
    const res = await call("save_career_section", { section: "experience", data: [role("Acme")] });
    expect(res.isError).toBe(true);
    expect(text(res)).toContain("can't be read");
    expect(readFileSync(join(dir, "career", "experience.yaml"), "utf-8")).toBe(broken);

    const forced = await call("save_career_section", { section: "experience", data: [role("Acme")], replace: true });
    expect(forced.isError).toBeFalsy();
    expect(readdirSync(join(dir, "career")).some((f) => f.startsWith("experience.yaml") && f.endsWith(".bak"))).toBe(true);
  });
});

describe("KB-backed tools with an unreadable section", () => {
  it("say the section couldn't be read instead of treating it as empty", async () => {
    const call = await setup({ "experience.yaml": "- role: Engineer\n  company: [unclosed\n" });
    const res = await call("tailor_resume", { posting: "Senior Engineer at Acme. Requirements: Go, Kubernetes." });
    expect(text(res)).toContain("experience.yaml couldn't be read");
    expect(text(res).indexOf("couldn't be read")).toBeLessThan(text(res).indexOf("Resume Tailoring Request"));
  });

  it("stay quiet when every file reads", async () => {
    const call = await setup();
    const res = await call("tailor_resume", { posting: "Senior Engineer at Acme." });
    expect(text(res)).not.toContain("couldn't be read");
  });
});

describe("tailor_resume's KB payload", () => {
  const career = {
    profile: { name: "Sam Lee", email: "sam@example.com", summary: "Engineer.", targetRoles: [], targetIndustries: [], targetCompanySize: [],
      salaryFloor: 180000 },
    experience: Array.from({ length: 12 }, (_, i) => role(`Co${i}`, 5)),
    skills: [{ name: "Go", category: "Technical" }],
    education: [], projects: [], testimonials: [],
    journal: Array.from({ length: 60 }, (_, i) => ({ id: `j${i}`, date: "2026-06-01", type: "note", summary: `private journal line ${i}`, signals: [] })),
  } as unknown as CareerData;

  it("carries every achievement of the shown roles but not the journal or salary", () => {
    const out = formatResumeSource(career);
    expect(out).toContain("Engineer @ Co0");
    expect(out).toContain("win 4");
    expect(out).toContain("sam@example.com");
    expect(out).not.toContain("private journal line");
    expect(out).not.toContain("180000");
    expect(out).toContain("2 earlier roles not shown");
  });

  it("stays well under Claude Code's 10k-token warning on a large KB", () => {
    // ~4 characters per token; 32k characters is about 8k tokens.
    expect(formatResumeSource(career).length).toBeLessThan(32000);
  });
});
