import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../server.js";
import { normalizeName, sameCompany, sameRole } from "../names.js";
import { findApplication } from "../interview.js";
import type { Pipeline } from "../../schemas/career-schema.js";

/**
 * Two gaps from the 2.14.1 audit.
 *
 * One company name, one answer: an application saved as "Acme, Inc." was found
 * by pipeline_update for "Acme" but not by prepare_interview, interview_arc,
 * generate_cover_letter or answer_application, which each compared names their
 * own way.
 *
 * Value before setup, on every drafting tool: generate_cover_letter and
 * prepare_interview refused until a Career KB was saved, while the fit check,
 * the résumé and the form answers already worked from a pasted résumé.
 */

describe("company and role names", () => {
  it("treats suffixes, punctuation, accents and & as the same company", () => {
    expect(sameCompany("Acme, Inc.", "acme")).toBe(true);
    expect(sameCompany("Société Générale", "societe generale")).toBe(true);
    expect(sameCompany("Johnson & Johnson", "Johnson and Johnson")).toBe(true);
    expect(sameCompany("Veridian Health LLC", "Veridian Health")).toBe(true);
  });

  it("keeps different companies different", () => {
    expect(sameCompany("Acme", "Acme Health")).toBe(false);
    expect(sameCompany("", "")).toBe(false);
    expect(sameCompany(undefined, "Acme")).toBe(false);
  });

  it("a name that is only a suffix does not normalize to nothing", () => {
    expect(normalizeName("Company", "company")).toBe("company");
    expect(sameCompany("Company", "Corp")).toBe(false);
  });

  it("roles match on words, not punctuation", () => {
    expect(sameRole("Sr. PM", "sr pm")).toBe(true);
    expect(sameRole("Senior PM", "PM")).toBe(false);
  });

  it("findApplication finds the saved entry under its plain name", () => {
    const pipeline = {
      applications: [{ id: "a1", company: "Acme, Inc.", role: "Senior PM", dateUpdated: "2026-10-01" }],
    } as unknown as Pipeline;
    expect(findApplication(pipeline, undefined, "Acme", undefined)?.id).toBe("a1");
    expect(findApplication(pipeline, undefined, "ACME corp", "senior pm")?.id).toBe("a1");
  });
});

async function connect() {
  const server = createServer();
  const client = new Client({ name: "names-and-pasted-resume", version: "0.0.0" });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(s), client.connect(c)]);
  return { client, server };
}

const textOf = (r: unknown) =>
  (((r as { content?: Array<{ text?: string }> }).content) ?? []).map((p) => p.text ?? "").join("\n");

const RESUME = "Jordan Lee. Operations analyst at Northwind Freight, 2021-2025: cut dock wait times 18%.";

describe("tools on an empty data directory", () => {
  let dataDir: string;
  let original: string | undefined;

  beforeEach(() => {
    original = process.env.CAREER_DATA_PATH;
    dataDir = mkdtempSync(path.join(tmpdir(), "cc-names-"));
    process.env.CAREER_DATA_PATH = dataDir;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.CAREER_DATA_PATH;
    else process.env.CAREER_DATA_PATH = original;
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("generate_cover_letter writes from a pasted résumé", async () => {
    const { client, server } = await connect();
    try {
      const out = textOf(await client.callTool({
        name: "generate_cover_letter",
        arguments: { company: "Contoso", role: "Operations Manager", resume: RESUME },
      }));
      expect(out).toContain("# Cover Letter Generation");
      expect(out).toContain("cut dock wait times 18%");
      expect(out).toContain("Worked from pasted text");
      expect(out).not.toContain("No saved Career KB yet");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("prepare_interview preps from a pasted résumé", async () => {
    const { client, server } = await connect();
    try {
      const out = textOf(await client.callTool({
        name: "prepare_interview",
        arguments: { company: "Contoso", interviewType: "behavioral", resume: RESUME },
      }));
      expect(out).toContain("# Interview Prep");
      expect(out).toContain("cut dock wait times 18%");
      expect(out).toContain("Worked from pasted text");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("without a résumé, both point the model at the resume parameter", async () => {
    const { client, server } = await connect();
    try {
      for (const [name, args] of [
        ["generate_cover_letter", { company: "Contoso" }],
        ["prepare_interview", { company: "Contoso", interviewType: "behavioral" }],
      ] as const) {
        const out = textOf(await client.callTool({ name, arguments: args }));
        expect(out, name).toContain("No saved Career KB yet");
        expect(out, name).toContain("`resume`");
      }
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("a cover letter for \"Acme\" uses the posting saved under \"Acme, Inc.\"", async () => {
    const { client, server } = await connect();
    try {
      await client.callTool({
        name: "pipeline_add",
        arguments: { company: "Acme, Inc.", role: "Operations Manager", postingText: "POSTING-MARKER: run the Reno hub." },
      });
      const letter = textOf(await client.callTool({
        name: "generate_cover_letter",
        arguments: { company: "Acme", resume: RESUME },
      }));
      expect(letter).toContain("POSTING-MARKER");
      expect(letter).toContain("## From Your Pipeline");

      const prep = textOf(await client.callTool({
        name: "prepare_interview",
        arguments: { company: "acme", interviewType: "panel", resume: RESUME },
      }));
      expect(prep).toContain("POSTING-MARKER");
      expect(prep).toContain("Application context");
    } finally {
      await client.close();
      await server.close();
    }
  });
});
