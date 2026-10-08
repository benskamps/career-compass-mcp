// Re-captures the tool result shown in the demo. From the repo root, after `npm run build:mcp`:
//   node docs/assets/demo/source/material/capture.mjs
// Runs the built server on a copy of the bundled sample data and writes explore.md beside this file.
// reply.md is what Claude wrote back when given exactly that result and "Do I fit this?".
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..", "..", "..", "..");
const data = mkdtempSync(join(tmpdir(), "cc-demo-"));
cpSync(join(repo, "data", "example"), data, { recursive: true });

const transport = new StdioClientTransport({
  command: "node",
  args: [join(repo, "build", "src", "index.js")],
  env: { ...process.env, CAREER_DATA_PATH: data },
});
const client = new Client({ name: "demo-capture", version: "1.0.0" });
await client.connect(transport);
const result = await client.callTool({
  name: "explore_opportunity",
  arguments: {
    posting: readFileSync(join(here, "posting.txt"), "utf-8"),
    company: "Ledgerline",
    sourceFitLabel: "LinkedIn: Top applicant · strong match",
  },
});
writeFileSync(join(here, "explore.md"), result.content[0].text);
await client.close();
