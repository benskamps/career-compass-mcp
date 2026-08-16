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
const formatModule = path.join(repoRoot, "build", "src", "manifest-format.js");

// Both live under build/ because this script runs after `npm run build:mcp`
// (see the `gen:manifest` package script). The encoding rules are shared with
// manifest-truth.test.ts, which imports the TypeScript source directly — a
// second copy here is exactly how the checked-in file and the generator drifted
// apart in the first place.
const { renderManifest } = await import(pathToFileURL(formatModule).href);

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

async function main() {
  const check = process.argv.includes("--check");
  const before = readFileSync(manifestPath, "utf-8");
  const manifest = JSON.parse(before);

  const tools = await servedTools();
  if (tools.length === 0) {
    console.error("gen-manifest-tools: the server served no tools — refusing to empty the manifest");
    process.exit(1);
  }

  const after = renderManifest(manifest, tools);

  // Compare with line endings normalized. This repo is developed on Windows
  // with `core.autocrlf=true`, so a fresh checkout has CRLF in the working copy
  // while the committed blob and this generator both use LF. A raw byte compare
  // reports every clean Windows checkout as drifted.
  const eol = (s) => s.replace(/\r\n/g, "\n");

  if (eol(after) === eol(before)) {
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
