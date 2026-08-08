#!/usr/bin/env node
/**
 * Rewrite `manifest.json`'s `tools[]` from what the server actually serves.
 *
 * The manifest is the only thing Claude Desktop reads before it starts the
 * server, so its descriptions are the only copy a stranger sees while deciding
 * whether to install — and they were hand-maintained. Five of the seventeen had
 * drifted a generation behind the code: `ingest_document` still promised to
 * "add to your Career KB" after that tool was made extraction-only, so the
 * listing advertised a write the tool refuses to perform.
 *
 * `tools_generated` stays false. That flag tells the host the *server* produces
 * its tool list at runtime, which is a different claim. This is a build step —
 * the generated list is committed, and manifest-truth.test.ts fails when the
 * file and the server disagree, so drift is caught in CI and not only at pack
 * time.
 *
 * Usage:
 *   node scripts/gen-manifest-tools.mjs            # rewrite if needed
 *   node scripts/gen-manifest-tools.mjs --check    # exit 1 if it would change
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(repoRoot, "manifest.json");
const serverModule = path.join(repoRoot, "build", "src", "server.js");

/** The tools the server serves, over a real client connection. */
async function servedTools() {
  const { createServer } = await import(pathToFileURL(serverModule).href);
  const server = createServer();
  const client = new Client({ name: "gen-manifest-tools", version: "0.0.0" });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  try {
    const { tools } = await client.listTools();
    return tools.map((t) => ({ name: t.name, description: t.description ?? "" }));
  } finally {
    await client.close();
  }
}

/**
 * Keep the file's existing all-ASCII encoding.
 *
 * manifest.json is checked in with every non-ASCII character as a unicode
 * escape. Both forms are valid JSON, but emitting literals instead would bury
 * the first real change under a hundred lines of encoding noise.
 */
function escapeNonAscii(json) {
  let out = "";
  for (const ch of json) {
    const code = ch.codePointAt(0);
    out += code > 127 ? "\\u" + code.toString(16).padStart(4, "0") : ch;
  }
  return out;
}

async function main() {
  const check = process.argv.includes("--check");
  const before = readFileSync(manifestPath, "utf-8");
  const manifest = JSON.parse(before);

  const tools = await servedTools();
  if (tools.length === 0) {
    console.error("gen-manifest-tools: the server served no tools — refusing to empty the manifest");
    process.exit(1);
  }

  manifest.tools = tools;
  const after = escapeNonAscii(JSON.stringify(manifest, null, 2)) + "\n";

  if (after === before) {
    console.log(`gen-manifest-tools: manifest.json already matches the server (${tools.length} tools)`);
    return;
  }
  if (check) {
    console.error("gen-manifest-tools: manifest.json disagrees with the server. Run `npm run gen:manifest`.");
    process.exit(1);
  }

  writeFileSync(manifestPath, after, "utf-8");
  console.log(`gen-manifest-tools: rewrote manifest.json tools[] from the server (${tools.length} tools)`);
}

await main();
