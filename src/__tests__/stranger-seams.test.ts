import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../server.js";
import { getDataDir } from "../storage/file-store.js";
import { handleAdd, handleList, handleNextActions } from "../tools/pipeline.js";
import { stdioBanner } from "../stdio-banner.js";
import type { Pipeline } from "../schemas/career-schema.js";

/**
 * Seams from the 2026-09-05 stranger pass (~/.gstack/qa-reports/
 * qa-report-career-compass-mcp-2026-09-05.md), each pinned so it cannot come
 * back. Every test here names what a first-time user SAW that was wrong.
 */

async function connect() {
  const server = createServer();
  const client = new Client({ name: "stranger-seams", version: "0.0.0" });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(s), client.connect(c)]);
  return client;
}
const textOf = (r: unknown) =>
  (((r as { content?: Array<{ text?: string }> }).content) ?? []).map((p) => p.text ?? "").join("\n");

const EMPTY: Pipeline = { applications: [], lastUpdated: new Date().toISOString() } as Pipeline;

let dataDir: string;
let original: string | undefined;
beforeEach(() => {
  original = process.env.CAREER_DATA_PATH;
  dataDir = mkdtempSync(path.join(tmpdir(), "cc-seams-"));
  process.env.CAREER_DATA_PATH = dataDir;
});
afterEach(() => {
  if (original === undefined) delete process.env.CAREER_DATA_PATH;
  else process.env.CAREER_DATA_PATH = original;
  rmSync(dataDir, { recursive: true, force: true });
});

describe("S1 — the onboarding prompt uses the schema's own field names", () => {
  it("setup-career-kb names role/startDate/endDate/'present' and object achievements, never 'title'", async () => {
    const client = await connect();
    try {
      const { messages } = await client.getPrompt({ name: "setup-career-kb", arguments: {} });
      const text = (messages[0].content as { text: string }).text;
      const experienceLine = text.split("\n").find((l) => l.includes("**Experience**"))!;
      expect(experienceLine).toContain("`role`");
      expect(experienceLine).toContain("`startDate`");
      expect(experienceLine).toContain("'present'");
      expect(experienceLine).toContain("not plain strings");
      expect(experienceLine).not.toContain("company, title"); // the wording that taught the wrong field
    } finally {
      await client.close();
    }
  });

  it("an experience entry written the way the prompt describes it is accepted", async () => {
    const client = await connect();
    try {
      const r = await client.callTool({
        name: "save_career_section",
        arguments: {
          section: "experience",
          data: [{
            role: "Product Manager", company: "Acme", startDate: "2020-01", endDate: "present",
            achievements: [{ metric: "Grew revenue 30%", context: "payments roadmap", impact: "funded the next hire" }],
          }],
        },
      });
      expect((r as { isError?: boolean }).isError ?? false, textOf(r)).toBe(false);
    } finally {
      await client.close();
    }
  });
});

describe("S2/S3 — an empty pipeline reads back as a sentence with a next step, not a headless table", () => {
  it("list", () => {
    const text = handleList({} as never, EMPTY).content[0].text;
    expect(text).not.toContain("| ID |");
    expect(text).toContain("No applications tracked yet");
    expect(text).toContain("pipeline_add");
    expect(text).toContain("discovered");
  });
  it("list with a filter that matches nothing blames the filter, not the pipeline", () => {
    const one: Pipeline = {
      ...EMPTY,
      applications: [{ id: "a1b2c3d4", company: "Acme", role: "PM", status: "applied", priority: "medium",
        dateUpdated: new Date().toISOString(), remote: "unknown", contacts: [], interviewRounds: [], notes: [], coverLetterGenerated: false }],
    } as Pipeline;
    const text = handleList({ filterStatus: "offer" } as never, one).content[0].text;
    expect(text).toContain("match that filter");
    expect(text).toContain("1 tracked in total");
  });
  it("counts 'applied Nd ago' from the timestamp, even between UTC midnight and local midnight", () => {
    // 00:30Z — in the Americas this is still the previous local day. A date-only
    // reading of the timestamp lost a day here; the timestamp reading does not.
    const now = new Date("2026-09-06T00:30:00.000Z");
    const p: Pipeline = { applications: [{ id: "ten", company: "Acme", role: "PM", status: "applied", priority: "medium",
      dateUpdated: new Date(now.getTime() - 10 * 86400000).toISOString(), remote: "unknown", contacts: [], interviewRounds: [], notes: [], coverLetterGenerated: false }], lastUpdated: now.toISOString() } as Pipeline;
    expect(handleNextActions(p, now).content[0].text).toContain("applied 10d ago");
  });
  it("next_actions distinguishes 'nothing tracked' from 'nothing due'", () => {
    expect(handleNextActions(EMPTY).content[0].text).toContain("Nothing tracked yet");
    expect(handleNextActions(EMPTY).content[0].text).not.toContain("up to date");
  });
});

describe("S4 — one spelling of the data folder, everywhere", () => {
  it("getDataDir normalizes mixed separators and relative segments", () => {
    process.env.CAREER_DATA_PATH = `${dataDir}${path.sep}sub/../sub2`;
    expect(getDataDir()).toBe(path.join(dataDir, "sub2"));
    if (process.platform === "win32") {
      process.env.CAREER_DATA_PATH = dataDir.replace(/\\/g, "/");
      expect(getDataDir()).toBe(dataDir);
    }
  });
  it("check_setup and tailor_resume print the same folder string", async () => {
    process.env.CAREER_DATA_PATH = process.platform === "win32" ? dataDir.replace(/\\/g, "/") : dataDir;
    const client = await connect();
    try {
      const setup = textOf(await client.callTool({ name: "check_setup", arguments: { checkForUpdates: false } }));
      const resume = textOf(await client.callTool({ name: "tailor_resume", arguments: { posting: "PM" } }));
      expect(setup).toContain(dataDir);
      expect(resume).toContain(dataDir);
      if (process.platform === "win32") expect(setup).not.toContain(dataDir.replace(/\\/g, "/"));
    } finally {
      await client.close();
    }
  });
});

describe("S5 — the git tip is not a bash-only && chain", () => {
  it("check_setup prints three plain git lines", async () => {
    const client = await connect();
    try {
      const setup = textOf(await client.callTool({ name: "check_setup", arguments: { checkForUpdates: false } }));
      const gitBlock = setup.split("\n").filter((l) => l.includes("git "));
      expect(gitBlock.length).toBeGreaterThanOrEqual(3);
      for (const line of gitBlock) expect(line).not.toContain("&&");
    } finally {
      await client.close();
    }
  });
});

describe("S6 — a bare run in a terminal orients the person", () => {
  it("TTY banner names the demo command and Ctrl+C; pipe banner stays one line", () => {
    const tty = stdioBanner(true);
    expect(tty).toContain("dashboard --sample");
    expect(tty).toContain("Ctrl+C");
    expect(stdioBanner(false).split("\n")).toHaveLength(1);
  });
});

describe("S7 — --help speaks to the npm audience", () => {
  it("no 'Next.js' or 'full if built' in the help text", () => {
    const src = readFileSync(path.join(__dirname, "..", "..", "bin", "cli.ts"), "utf-8");
    const start = src.indexOf("Usage:");
    const help = src.slice(start, src.indexOf("process.exit(0)", start));
    expect(help).not.toContain("Next.js");
    expect(help).not.toContain("full if built");
    expect(help).toContain("your MCP client launches this");
  });
});

describe("S8 — a defaulted status says it was a default", () => {
  it("pipeline_add without status mentions discovered; with status it does not", async () => {
    const p: Pipeline = { applications: [], lastUpdated: "" } as Pipeline;
    const defaulted = (await handleAdd({ company: "Acme", role: "PM" } as never, p)).content[0].text;
    expect(defaulted).toContain("defaulted");
    expect(defaulted).toContain("discovered");
    const explicit = (await handleAdd({ company: "Acme", role: "PM", status: "applied" } as never, p)).content[0].text;
    expect(explicit).not.toContain("defaulted");
  });
});
