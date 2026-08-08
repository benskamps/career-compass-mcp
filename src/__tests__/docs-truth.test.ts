import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../server.js";

/**
 * Docs-truth guard: the README must describe the server that actually exists.
 *
 * The README is the only thing a stranger reads before deciding to install, and
 * it is the one artifact with no compiler, no types, and no runtime behind it —
 * so it drifts silently and in one direction. `capture_insight` shipped on main
 * and the tool table stayed at eleven rows. `data/example/` was called "a fully
 * populated sample" while two of the six career files the README's own directory
 * diagram lists did not exist, leaving `career://projects` and
 * `career://education` resolving to `[]` for anyone trying the sample.
 *
 * Rather than re-describe the surface here (which would just be a third copy to
 * drift), this reads the live registered surface from a connected MCP client and
 * asserts the README mentions all of it. It costs nothing to keep passing and it
 * makes "add a tool, forget the docs" a red test instead of a stranger's
 * surprise.
 */

const repoRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../..",
);
const README = readFileSync(path.join(repoRoot, "README.md"), "utf-8");
const EXAMPLE_DATA_PATH = path.join(repoRoot, "data", "example");

describe("docs truth: the README describes the real surface", () => {
  let client: Client;
  let originalDataPath: string | undefined;

  beforeAll(async () => {
    originalDataPath = process.env.CAREER_DATA_PATH;
    process.env.CAREER_DATA_PATH = EXAMPLE_DATA_PATH;
    const server = createServer();
    client = new Client({ name: "docs-truth", version: "0.0.0" });
    const [c, s] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(s), client.connect(c)]);
  });

  afterAll(async () => {
    await client?.close();
    if (originalDataPath === undefined) delete process.env.CAREER_DATA_PATH;
    else process.env.CAREER_DATA_PATH = originalDataPath;
  });

  it("documents every registered tool", async () => {
    const { tools } = await client.listTools();
    const undocumented = tools
      .map((t) => t.name)
      .filter((name) => !README.includes(`\`${name}\``));
    expect(
      undocumented,
      `registered but absent from README.md: ${undocumented.join(", ")}. ` +
        `Add a row to the Tools table.`,
    ).toEqual([]);
  });

  it("documents every registered prompt", async () => {
    const { prompts } = await client.listPrompts();
    const undocumented = prompts
      .map((p) => p.name)
      .filter((name) => !README.includes(`\`${name}\``));
    expect(undocumented, `prompts absent from README.md: ${undocumented.join(", ")}`).toEqual([]);
  });

  it("points every embedded image at a file that exists", () => {
    // The bundle now stages exactly the images the README references (see
    // readmeImages() in scripts/pack-mcpb.mjs) — it used to ship none of them,
    // so the first page a reviewer opened had four broken images. A reference
    // to a file that is not in the repo fails the pack; catching it here names
    // the broken link instead of failing a release build.
    const referenced = [...README.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)]
      .map((m) => m[1])
      .filter((r) => !/^[a-z]+:/i.test(r));
    expect(
      referenced.length,
      "the README should embed at least the dashboard screenshots",
    ).toBeGreaterThan(0);

    const missing = referenced.filter((r) => !existsSync(path.join(repoRoot, r)));
    expect(
      missing,
      `README.md embeds images that are not in the repo: ${missing.join(", ")}. ` +
        `They render as broken on GitHub and would fail the mcpb pack.`,
    ).toEqual([]);
  });

  it("has no duplicate H2 heading", () => {
    const headings = [...README.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
    const seen = new Set<string>();
    const dupes = headings.filter((h) => (seen.has(h) ? true : (seen.add(h), false)));
    expect(
      dupes,
      `duplicate H2 heading(s): ${dupes.join(", ")}. Two sections under one title ` +
        `means a reader can't tell which is current.`,
    ).toEqual([]);
  });

  it("ships every career file the README's directory diagram promises", () => {
    // The diagram is the contract for what "a fully populated sample" contains.
    // Tree lines are prefixed with pipe/space guides: `│   ├── projects.yaml`.
    const promised = [...README.matchAll(/[└├]──\s+(\w+)\.yaml/g)].map((m) => m[1]);
    expect(promised.length, "README directory diagram should list career yaml files").toBeGreaterThan(3);

    const missing = promised.filter((section) => {
      const inCareer = path.join(EXAMPLE_DATA_PATH, "career", `${section}.yaml`);
      const inPipeline = path.join(EXAMPLE_DATA_PATH, "pipeline", `${section}.yaml`);
      return !existsSync(inCareer) && !existsSync(inPipeline);
    });
    expect(
      missing,
      `README promises a "fully populated sample" but data/example/ has no ${missing.join(", ")}. ` +
        `Those resources resolve to [] for anyone trying the sample.`,
    ).toEqual([]);
  });

  it("resolves every career resource to non-empty sample data", async () => {
    const { resources } = await client.listResources();
    const empty: string[] = [];
    for (const r of resources) {
      if (r.uri === "career://full" || r.uri.startsWith("pipeline://")) continue;
      const read = await client.readResource({ uri: r.uri });
      const text = (read.contents?.[0] as { text?: string } | undefined)?.text ?? "";
      if (text.trim() === "[]" || text.trim() === "{}" || text.trim() === "") empty.push(r.uri);
    }
    expect(
      empty,
      `these resources are empty against data/example/: ${empty.join(", ")}. ` +
        `The sample is what a first-time user explores; empty sections read as broken.`,
    ).toEqual([]);
  });
});
