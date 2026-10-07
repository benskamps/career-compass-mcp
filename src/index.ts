#!/usr/bin/env node
import { nodeVersionWarning } from "./node-version.js";

// Before anything else is loaded: on an old Node the failure, if there is one,
// comes from an import below, and the one useful line has to be out first.
// stderr only — stdout is the MCP stdio channel and a stray byte there breaks
// the protocol. The server then starts anyway rather than exiting: nothing
// below needs a 22-only API today, so on Node 20 it most likely works, and a
// warning plus a working server beats a clean exit and no tools at all.
const versionWarning = nodeVersionWarning(process.versions.node);
if (versionWarning) process.stderr.write(`${versionWarning}\n`);

async function main(): Promise<void> {
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const { createServer } = await import("./server.js");
  const { ensureDataDirs } = await import("./storage/file-store.js");
  const { setClaimHolderLabel } = await import("./storage/write-claim.js");
  const { stdioBanner } = await import("./stdio-banner.js");

  // Names this process in a write-claim refusal, so "another process is writing"
  // tells the user which one to close.
  setClaimHolderLabel("MCP server");
  await ensureDataDirs();

  const server = createServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);

  // Silence console.log to avoid polluting STDIO transport
  // Use console.error for any debug output
  console.error(stdioBanner(Boolean(process.stdin.isTTY)));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  if (versionWarning) console.error(versionWarning);
  process.exit(1);
});
