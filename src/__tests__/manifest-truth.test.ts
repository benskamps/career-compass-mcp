import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../server.js";
import { escapeNonAscii, renderManifest } from "../manifest-format.js";

/**
 * Manifest-truth guard: the extension manifest must describe the live server.
 *
 * `manifest.json` is the only thing Claude Desktop reads before it ever starts
 * the server. Its `tools[]` array is what the extension listing shows, so a
 * tool missing from it is a tool the user is never told they have — the server
 * serves it, and nothing surfaces it. Nothing in the build connects the two:
 * the manifest is hand-maintained, `tools_generated` is false, and adding a
 * tool to the server touches no file that would remind anyone to update it.
 *
 * That gap already cost a release. `career-compass-2.3.0.mcpb` was packed with
 * a manifest listing 14 tools while the server served 15. The missing one was
 * `save_career_section` — the only tool that can write the Career KB, added in
 * 9b342c0 as the fix for the first-run flow, and the exact reason the
 * submission hold was called. The bundle shipped under-advertising the
 * capability the whole quality loop existed to restore.
 *
 * So this test derives both sides from reality rather than from a list someone
 * has to remember to update: the manifest side is read off disk, the server
 * side comes from a real `tools/list` over a real transport. It is checked in
 * both directions, because the two failures are different bugs — a manifest
 * that is missing a tool hides a capability, and a manifest that invents one
 * promises a capability that does not exist.
 */

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

interface Manifest {
  version: string;
  tools: { name: string; description?: string }[];
}

const manifest = JSON.parse(
  readFileSync(path.join(repoRoot, "manifest.json"), "utf-8"),
) as Manifest;

const pkgVersion = (
  JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf-8")) as {
    version: string;
  }
).version;

interface ToolEntry { name: string; description?: string }

/** The tools the server actually serves, over a real client connection. */
async function servedTools(): Promise<ToolEntry[]> {
  const server = createServer();
  const client = new Client({ name: "manifest-truth-test", version: "0.0.0" });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(s), client.connect(c)]);
  try {
    const { tools } = await client.listTools();
    return tools.map((t) => ({ name: t.name, description: t.description }));
  } finally {
    await client.close();
  }
}

async function servedToolNames(): Promise<string[]> {
  return (await servedTools()).map((t) => t.name).sort();
}

/**
 * Tools whose manifest copy no longer says what the server says.
 *
 * Extracted so the guard can be pointed at a doctored manifest and shown to
 * fail: a comparison that has only ever seen matching inputs is not evidence
 * that it compares anything.
 */
export function descriptionMismatches(
  listed: ToolEntry[],
  served: ToolEntry[],
): { name: string; listed: string; served: string }[] {
  const byName = new Map(served.map((t) => [t.name, t.description ?? ""]));
  return listed
    .filter((t) => byName.has(t.name) && byName.get(t.name) !== (t.description ?? ""))
    .map((t) => ({ name: t.name, listed: t.description ?? "", served: byName.get(t.name)! }));
}

const manifestToolNames = manifest.tools.map((t) => t.name).sort();

describe("manifest truth: manifest.json describes the live server surface", () => {
  it("lists every tool the server actually serves", async () => {
    const served = await servedToolNames();
    const missing = served.filter((name) => !manifestToolNames.includes(name));
    expect(
      missing,
      `the server serves these tools but manifest.json does not list them, so ` +
        `Claude Desktop will never advertise them: ${missing.join(", ")}. ` +
        `Add an entry to manifest.json's tools[] for each.`,
    ).toEqual([]);
  });

  it("does not list a tool the server has stopped serving", async () => {
    const served = await servedToolNames();
    const phantom = manifestToolNames.filter((name) => !served.includes(name));
    expect(
      phantom,
      `manifest.json advertises these tools but the server does not serve them, ` +
        `so the extension listing promises capabilities that do not exist: ` +
        `${phantom.join(", ")}. Remove them from manifest.json or restore them ` +
        `in the server.`,
    ).toEqual([]);
  });

  it("agrees with the server on the tool count (guards both directions at once)", async () => {
    const served = await servedToolNames();
    expect(manifestToolNames).toEqual(served);
  });

  it("lists each tool exactly once", () => {
    // A duplicated entry would let the two directional checks above both pass
    // while the listing shows the same tool twice.
    const seen = new Set<string>();
    const dupes = manifestToolNames.filter((n) => (seen.has(n) ? true : (seen.add(n), false)));
    expect(dupes, `duplicate tool entries in manifest.json: ${dupes.join(", ")}`).toEqual([]);
  });

  it("gives every listed tool a description (it is the only copy the user sees)", () => {
    const undescribed = manifest.tools
      .filter((t) => !t.description || t.description.trim().length === 0)
      .map((t) => t.name);
    expect(
      undescribed,
      `manifest.json tools with no description: ${undescribed.join(", ")}`,
    ).toEqual([]);
  });

  it("describes each tool the way the server describes it", async () => {
    // Names alone were not enough. Five of seventeen descriptions were a
    // generation stale in 2.3.0 — worst, ingest_document still offered to "add
    // to your Career KB" months after it was made extraction-only, so the
    // extension listing advertised a write the tool refuses to do. The manifest
    // copy is the only copy a stranger reads before installing.
    const drifted = descriptionMismatches(manifest.tools, await servedTools());
    expect(
      drifted.map((d) => d.name),
      drifted
        .map((d) => `${d.name}\n  manifest: ${d.listed}\n  server:   ${d.served}`)
        .join("\n\n") + "\n\nRun `npm run gen:manifest` to regenerate manifest.json from the server.",
    ).toEqual([]);
  });

  it("negative control: a doctored description is caught", async () => {
    const served = await servedTools();
    const doctored = manifest.tools.map((t, i) =>
      i === 0 ? { ...t, description: "something the server never said" } : t,
    );
    expect(descriptionMismatches(doctored, served).map((d) => d.name)).toEqual([
      manifest.tools[0].name,
    ]);
  });

  it("is checked in exactly as the generator writes it", async () => {
    // The description comparison above parses both sides, so it is blind to how
    // the file is encoded. That blind spot shipped: v2.4.0 (18ec920) checked the
    // manifest back in with literal em dashes instead of the `\uXXXX` escapes
    // every prior revision used. Every test stayed green, while
    // `gen-manifest-tools.mjs --check` began failing on clean main with
    // "manifest.json disagrees with the server" for copy that was correct, and
    // `npm run gen:manifest` churned ten untouched lines on every run.
    //
    // Comparing the bytes closes that gap — and because it is the same renderer
    // the generator uses, a green run here means `--check` is green too.
    const onDisk = readFileSync(path.join(repoRoot, "manifest.json"), "utf-8");
    const served = await servedTools();
    const rendered = renderManifest(
      JSON.parse(onDisk) as Record<string, unknown>,
      served.map((t) => ({ name: t.name, description: t.description ?? "" })),
    );
    // Normalized: `core.autocrlf=true` checks this file out with CRLF on
    // Windows while the committed blob is LF. Encoding is the invariant here,
    // not line endings.
    const eol = (s: string) => s.replace(/\r\n/g, "\n");
    expect(
      eol(onDisk),
      "manifest.json is not byte-identical to what `npm run gen:manifest` " +
        "would write. Run it and commit the result.",
    ).toBe(eol(rendered));
  });

  it("is checked in with no literal non-ASCII characters", () => {
    // States the invariant directly, so a failure says *what* is wrong rather
    // than only that two large strings differ.
    const onDisk = readFileSync(path.join(repoRoot, "manifest.json"), "utf-8");
    const literals = [...onDisk].filter((ch) => ch.codePointAt(0)! > 127);
    expect(
      [...new Set(literals)].join(" "),
      "manifest.json must be checked in all-ASCII, with non-ASCII characters " +
        "as \\uXXXX escapes, so a copy change is not buried in encoding noise.",
    ).toBe("");
  });

  it("escapes astral characters as surrogate pairs that survive a round trip", () => {
    // JSON's \u escape is exactly four hex digits. Formatting a whole code
    // point with one escape produced five digits, so an emoji re-parsed as a
    // different character followed by a stray digit — valid JSON, silently
    // wrong copy. No manifest string has one today; this keeps the first one
    // from being corrupted quietly.
    const encoded = escapeNonAscii(JSON.stringify({ d: "ship it \u{1F600}" }));
    expect(encoded).toContain("\\ud83d\\ude00");
    expect((JSON.parse(encoded) as { d: string }).d).toBe("ship it \u{1F600}");
  });

  it("carries the same version as package.json", () => {
    // The bundle is built from both files. If they disagree, Claude Desktop
    // advertises one version while the server's initialize handshake reports
    // another, and there is no way for a user to tell which is real.
    expect(
      manifest.version,
      `manifest.json is ${manifest.version} but package.json is ${pkgVersion}`,
    ).toBe(pkgVersion);
  });
});
