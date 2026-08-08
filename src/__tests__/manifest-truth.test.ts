import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../server.js";

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

/** The tool names the server actually serves, over a real client connection. */
async function servedToolNames(): Promise<string[]> {
  const server = createServer();
  const client = new Client({ name: "manifest-truth-test", version: "0.0.0" });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(s), client.connect(c)]);
  try {
    const { tools } = await client.listTools();
    return tools.map((t) => t.name).sort();
  } finally {
    await client.close();
  }
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
