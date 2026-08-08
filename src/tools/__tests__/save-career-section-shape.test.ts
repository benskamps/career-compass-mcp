import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../server.js";
import { SECTION_SHAPE_HELP } from "../career-kb.js";
import {
  Profile, Experience, Skill, Education, Project, Testimonial,
} from "../../schemas/career-schema.js";

/**
 * `save_career_section`'s `data` is `z.unknown()`, so the generated input
 * schema tells a caller nothing about what to send.
 *
 * The first thing anyone writes for an experience entry is
 * `achievements: ["led the migration"]` — a list of strings where the schema
 * wants objects with metric/context/impact. The write was correctly refused and
 * the error was clear about *which* field was wrong, but it never said what
 * right looked like, and this is the tool that populates a brand-new install.
 * A first write that fails is a first impression.
 *
 * These hold both halves: the shapes are advertised before the call, and
 * repeated in the refusal after it.
 */

const textOf = (r: unknown) =>
  (((r as { content?: Array<{ text?: string }> }).content) ?? [])
    .map((p) => p.text ?? "")
    .join("\n");

let client: Client;
let dataDir: string;
let original: string | undefined;

beforeEach(async () => {
  original = process.env.CAREER_DATA_PATH;
  dataDir = mkdtempSync(join(tmpdir(), "cc-shape-"));
  process.env.CAREER_DATA_PATH = dataDir;
  const server = createServer();
  client = new Client({ name: "shape-test", version: "0.0.0" });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(s), client.connect(c)]);
});

afterEach(async () => {
  await client?.close();
  if (original === undefined) delete process.env.CAREER_DATA_PATH;
  else process.env.CAREER_DATA_PATH = original;
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

async function save(section: string, data: unknown) {
  const res = await client.callTool({
    name: "save_career_section",
    arguments: { section, data },
  });
  return { isError: res.isError === true, text: textOf(res) };
}

describe("the first write a reviewer would try", () => {
  it("saves a profile", async () => {
    const res = await save("profile", {
      name: "Alex Rivera",
      summary: "Operations leader with a decade scaling process and teams.",
      targetRoles: ["Director of Operations"],
    });
    expect(res.isError, res.text).toBe(false);
    expect(existsSync(join(dataDir, "career", "profile.yaml"))).toBe(true);
    expect(readFileSync(join(dataDir, "career", "profile.yaml"), "utf-8")).toContain("Alex Rivera");
  });

  it("saves experience with achievements in the documented shape", async () => {
    const res = await save("experience", [
      {
        role: "Senior Operations Manager",
        company: "Northwind Logistics",
        startDate: "2021-03",
        endDate: "present",
        achievements: [
          {
            metric: "cut onboarding from 6 weeks to 9 days",
            context: "new-hire ramp was the bottleneck on headcount growth",
            impact: "unblocked a 40-person hiring plan",
          },
        ],
      },
    ]);
    expect(res.isError, res.text).toBe(false);
    expect(readFileSync(join(dataDir, "career", "experience.yaml"), "utf-8")).toContain("Northwind");
  });
});

describe("the shape a caller reaches for first, when it is wrong", () => {
  it("refuses a string-array of achievements and shows the object shape", async () => {
    const res = await save("experience", [
      {
        role: "Senior Operations Manager",
        company: "Northwind Logistics",
        startDate: "2021-03",
        endDate: "present",
        achievements: ["cut onboarding from 6 weeks to 9 days"],
      },
    ]);

    expect(res.isError).toBe(true);
    // Not just "invalid" — the three fields it needed, so the retry is a
    // correction rather than another guess.
    for (const field of ["metric", "context", "impact"]) {
      expect(res.text, `refusal never mentions ${field}`).toContain(field);
    }
    expect(res.text).toContain("nothing was written");
    expect(existsSync(join(dataDir, "career", "experience.yaml"))).toBe(false);
  });

  it("negative control: a valid write produces no shape help at all", async () => {
    // The refusal above must be a refusal. If the shape block were printed on
    // success too, the assertions there would pass on a tool that wrote
    // whatever it was given.
    const res = await save("skills", [{ name: "Process design", category: "Domain" }]);
    expect(res.isError).toBe(false);
    expect(res.text).not.toContain("Expected `skills`");
  });
});

describe("the advertised shapes cannot drift from the schemas", () => {
  const SCHEMAS = {
    profile: Profile,
    experience: Experience,
    skills: Skill,
    education: Education,
    projects: Project,
    testimonials: Testimonial,
  } as const;

  it("names every required field of every section", () => {
    // Written by hand for readability, so this is what keeps it honest: a field
    // added to a schema without a default shows up here as a red test.
    const missing: string[] = [];
    for (const [section, schema] of Object.entries(SCHEMAS)) {
      for (const [field, type] of Object.entries(schema.shape)) {
        // Optional and defaulted fields accept undefined; required ones do not.
        const required = !(type as z.ZodTypeAny).safeParse(undefined).success;
        if (required && !SECTION_SHAPE_HELP.includes(field)) missing.push(`${section}.${field}`);
      }
    }
    expect(
      missing,
      `these are required by the schema but absent from the shapes shown to callers: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("negative control: the check would notice an absent field", () => {
    expect(SECTION_SHAPE_HELP).not.toContain("aFieldNoSchemaHas");
  });

  it("lists all six sections", () => {
    for (const section of Object.keys(SCHEMAS)) {
      expect(SECTION_SHAPE_HELP).toContain(`${section}:`);
    }
  });
});
