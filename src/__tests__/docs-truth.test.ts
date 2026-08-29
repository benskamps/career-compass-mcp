import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, existsSync, readdirSync } from "fs";
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
const DASHBOARD_DIR = path.join(repoRoot, "dashboard");

/**
 * Every `.tsx`/`.ts` source file the dashboard actually ships to a user — its
 * app routes and components. Skips tests, stories, node_modules and the build
 * output, none of which a user reads.
 */
function dashboardSourceFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const SKIP_DIRS = new Set(["node_modules", ".next", ".storybook", "storybook-static"]);
  for (const dir of ["app", "components"]) {
    const base = path.join(root, dir);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const name = entry.name;
      if (!/\.(tsx|ts)$/.test(name)) continue;
      if (/\.(test|stories)\.(tsx|ts)$/.test(name)) continue;
      // Node types the recursive Dirent's parentPath; fall back to name only.
      const parent = (entry as unknown as { parentPath?: string; path?: string }).parentPath
        ?? (entry as unknown as { path?: string }).path
        ?? base;
      if (parent.split(path.sep).some((seg) => SKIP_DIRS.has(seg))) continue;
      out.push(path.join(parent, name));
    }
  }
  return out;
}

/**
 * Tool names the dashboard surfaces to a user. The convention across the app is
 * that a literal tool name is presented as inline code — `<code>pipeline_add</code>`
 * — so that (and only that) is what we treat as a tool mention. Lowercase
 * snake_case only: env vars (CAREER_DATA_PATH) are uppercase, shell examples
 * ("npm run build") have spaces, and neither is a tool name.
 */
function dashboardToolMentions(files: string[]): { token: string; file: string }[] {
  const CODE_TOKEN = /<code[^>]*>\s*([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\s*<\/code>/g;
  const found: { token: string; file: string }[] = [];
  for (const file of files) {
    const src = readFileSync(file, "utf-8");
    for (const m of src.matchAll(CODE_TOKEN)) {
      found.push({ token: m[1], file: path.relative(repoRoot, file) });
    }
  }
  return found;
}

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

  it("the dashboard only names tools that actually exist", async () => {
    // The README is not the only place a tool name can go stale. The dashboard
    // tells a user which tool to run — its empty state used to say "use
    // `manage_pipeline`", a tool that has never existed (the real ones are
    // `pipeline_add` / `pipeline_update` / `ingest_document`). A user who
    // followed that copy asked Claude for a tool it does not have. The README
    // guard above would never have caught it because it reads a different file.
    const { tools } = await client.listTools();
    const live = new Set(tools.map((t) => t.name));

    const files = dashboardSourceFiles(DASHBOARD_DIR);
    // If the dashboard tree is absent (e.g. a source-light checkout) there is
    // nothing to scan; the guard simply has no work rather than a false pass.
    if (files.length === 0) return;

    const mentions = dashboardToolMentions(files);
    const unknown = mentions.filter((m) => !live.has(m.token));
    expect(
      unknown,
      `the dashboard names tool(s) that are not registered: ` +
        unknown.map((u) => `\`${u.token}\` (${u.file})`).join(", ") +
        `. Live tools: ${[...live].sort().join(", ")}. ` +
        `A user who copies that name calls a tool Claude does not have.`,
    ).toEqual([]);
  });

  it("NC: the dashboard tool-name scan flags a non-existent tool", async () => {
    // Negative control for the guard above. Feeds the same extractor a synthetic
    // `<code>` mention of a tool that does not exist and asserts it is caught, so
    // a future refactor that quietly stops matching `<code>` tokens (and turns
    // the real guard into a silent always-pass) fails here instead.
    const { tools } = await client.listTools();
    const live = new Set(tools.map((t) => t.name));
    const CODE_TOKEN = /<code[^>]*>\s*([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\s*<\/code>/g;
    const synthetic = `<p>Open Claude and run <code class="x">nonexistent_tool</code>.</p>`;
    const tokens = [...synthetic.matchAll(CODE_TOKEN)].map((m) => m[1]);
    expect(tokens).toContain("nonexistent_tool");
    expect(tokens.filter((t) => !live.has(t))).toEqual(["nonexistent_tool"]);
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
