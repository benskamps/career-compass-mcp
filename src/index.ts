#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { ensureDataDirs } from "./storage/file-store.js";
import { setClaimHolderLabel } from "./storage/write-claim.js";
import { stdioBanner } from "./stdio-banner.js";

async function main(): Promise<void> {
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
  process.exit(1);
});
