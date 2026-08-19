import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../server.js";
import { coerceSectionData } from "../career-kb.js";

/**
 * Regression: issue #34 — `save_career_section` never wrote, for anyone, on v2.4.0.
 *
 * `data` was `z.unknown()`, and zod emits `{}` for that: a required property with
 * no `type`. A client with no type to hold onto sends the value as a JSON string,
 * the section schema saw a string where it wanted an object or an array, and the
 * write was refused every time — which also meant a fresh install could never
 * leave the empty state, since this is the only tool that populates the KB.
 *
 * The existing shape tests pass native objects over InMemoryTransport, so they
 * were green throughout: they prove the server handles structured data, never
 * that a client sends it. These cover the gap between those two things.
 */

const textOf = (r: unknown) =>
  (((r as { content?: Array<{ text?: string }> }).content) ?? [])
    .map((p) => p.text ?? "").join("\n");

let client: Client;
let dataDir: string;
let original: string | undefined;

beforeEach(async () => {
  original = process.env.CAREER_DATA_PATH;
  dataDir = mkdtempSync(join(tmpdir(), "cc-json-string-"));
  process.env.CAREER_DATA_PATH = dataDir;
  const server = createServer();
  client = new Client({ name: "json-string-test", version: "0.0.0" });
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
    arguments: { section, data } as Record<string, unknown>,
  });
  return { isError: res.isError === true, text: textOf(res) };
}

describe("the advertised schema gives `data` a type", () => {
  it("is not the empty schema that caused the stringifying", async () => {
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "save_career_section");
    const data = (tool?.inputSchema as { properties?: Record<string, unknown> })
      ?.properties?.data as Record<string, unknown> | undefined;

    expect(data, "save_career_section has no `data` property").toBeDefined();

    // The exact bug: `{}` — a required property carrying no type at all.
    const keys = Object.keys(data ?? {}).filter((k) => k !== "description");
    expect(keys, "`data` is advertised as an untyped empty schema again").not.toEqual([]);

    const variants = (data?.anyOf ?? []) as Array<{ type?: string }>;
    const types = variants.map((v) => v.type);
    expect(types, "`data` no longer advertises an object form").toContain("object");
    expect(types, "`data` no longer advertises an array form").toContain("array");
  });
});

describe("a client that sends `data` as a JSON string still writes", () => {
  it("saves an object section (profile)", async () => {
    const res = await save("profile", JSON.stringify({
      name: "Test User",
      summary: "Operations leader.",
    }));
    expect(res.isError, res.text).toBe(false);
    expect(existsSync(join(dataDir, "career", "profile.yaml"))).toBe(true);
    expect(readFileSync(join(dataDir, "career", "profile.yaml"), "utf-8")).toContain("Test User");
  });

  it("saves an array section (education)", async () => {
    const res = await save("education", JSON.stringify([
      { degree: "BS Computer Science", institution: "State University", date: "2015" },
    ]));
    expect(res.isError, res.text).toBe(false);
    expect(readFileSync(join(dataDir, "career", "education.yaml"), "utf-8")).toContain("State University");
  });

  it("still refuses a wrong shape sent as a string, with the shape help", async () => {
    // Parsing must not become "accept anything" — a bad shape inside a valid
    // JSON string is still a bad shape, and the refusal still has to teach.
    const res = await save("experience", JSON.stringify([
      {
        role: "Manager", company: "Acme",
        startDate: "2021-03", endDate: "present",
        achievements: ["cut onboarding from 6 weeks to 9 days"],
      },
    ]));
    expect(res.isError).toBe(true);
    for (const field of ["metric", "context", "impact"]) {
      expect(res.text, `refusal never mentions ${field}`).toContain(field);
    }
    expect(existsSync(join(dataDir, "career", "experience.yaml"))).toBe(false);
  });

  it("names the real problem when the string isn't JSON at all", async () => {
    const res = await save("profile", "I am a senior operations leader.");
    expect(res.isError).toBe(true);
    expect(res.text).toContain("isn't valid JSON");
    // The refusal has to be distinguishable from a shape error, or the caller
    // retries by fixing fields that were never the problem.
    expect(res.text).not.toContain("(root): Invalid input");
    expect(existsSync(join(dataDir, "career", "profile.yaml"))).toBe(false);
  });

  it("rejects an empty string rather than writing nothing-shaped data", async () => {
    const res = await save("profile", "   ");
    expect(res.isError).toBe(true);
    expect(res.text).toContain("empty string");
    expect(existsSync(join(dataDir, "career", "profile.yaml"))).toBe(false);
  });
});

describe("coerceSectionData", () => {
  it("passes non-strings through untouched, by identity", () => {
    const obj = { name: "x" };
    const arr = [{ degree: "BS" }];
    // Identity matters: re-wrapping would quietly drop prototypes/extra fields
    // that the section schema is the one deciding about.
    expect(coerceSectionData(obj)).toEqual({ ok: true, value: obj });
    expect((coerceSectionData(arr) as { value: unknown }).value).toBe(arr);
  });

  it("parses a JSON string into the value the schema expects", () => {
    expect(coerceSectionData('{"name":"x"}')).toEqual({ ok: true, value: { name: "x" } });
    expect(coerceSectionData('[{"degree":"BS"}]')).toEqual({ ok: true, value: [{ degree: "BS" }] });
  });

  it("negative control: prose is not silently turned into data", () => {
    const res = coerceSectionData("just some prose");
    expect(res.ok).toBe(false);
    expect((res as { message: string }).message).toContain("isn't valid JSON");
  });
});
