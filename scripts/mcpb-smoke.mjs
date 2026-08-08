#!/usr/bin/env node
/**
 * Load the staged server out of the staging tree's own dependencies.
 *
 * The bundle carries its own `node_modules`, installed production-only into
 * staging and then pruned of upstream test suites. Both of those steps can in
 * principle remove something the server imports, and neither the leak guard nor
 * the packer would notice — they check names, not whether the thing runs. The
 * failure would surface as a Claude Desktop extension that installs and then
 * does nothing.
 *
 * Importing `build/src/server.js` by absolute path is enough to prove the tree:
 * ESM resolves that module's own bare imports from the staging directory, so
 * the SDK, zod and yaml all have to be present and loadable, and constructing
 * the server runs every tool registration.
 *
 * Usage: node scripts/mcpb-smoke.mjs <staging-dir>
 */

import path from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";

const stagingDir = process.argv[2];
if (!stagingDir) {
  console.error("mcpb-smoke: usage: node scripts/mcpb-smoke.mjs <staging-dir>");
  process.exit(2);
}

const entry = path.join(stagingDir, "build", "src", "server.js");
if (!existsSync(entry)) {
  console.error(`mcpb-smoke: no server entry point at ${entry}`);
  process.exit(2);
}

const { createServer } = await import(pathToFileURL(entry).href);
if (typeof createServer !== "function") {
  console.error("mcpb-smoke: build/src/server.js does not export createServer");
  process.exit(1);
}

const server = createServer();
if (!server) {
  console.error("mcpb-smoke: createServer() returned nothing");
  process.exit(1);
}

console.log("mcpb-smoke: OK — the staged server loads against the bundle's own dependencies");
