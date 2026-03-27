#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { ensureDataDirs } from "./storage/file-store.js";

async function main(): Promise<void> {
  await ensureDataDirs();

  const server = createServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);

  // Silence console.log to avoid polluting STDIO transport
  // Use console.error for any debug output
  console.error("Career Compass MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
