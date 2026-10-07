#!/usr/bin/env node
// Builds an "MCP-only" copy of the plugin: the server without any skill.
//
// Every scored run has the skill present, so the server's own discoverability
// (its tool names, descriptions and instructions, which is all a standalone npm
// user or a session with tool search gets) has never been measured on its own.
// This writes plugin-mcp-only/ next to plugin/ with skills/ removed and the
// Skill-fired graders dropped, so the tools suite scores routing and quality from
// the server alone.
//
// Usage: npm run eval:build && node eval-src/mcp-only.mjs
//   claude plugin eval plugin-mcp-only --tag quality --runs 3 $COMMON --json tools-mcp-only.json

import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(repo, "plugin");
const out = join(repo, "plugin-mcp-only");

rmSync(out, { recursive: true, force: true });
cpSync(src, out, { recursive: true, filter: (p) => !p.includes(`${join(src, "evals-chat")}`) && !/\/results(\/|$)/.test(p) });
rmSync(join(out, "skills"), { recursive: true, force: true });

let dropped = 0;
for (const c of readdirSync(join(out, "evals"))) {
  const g = join(out, "evals", c, "graders", "activation--skill-fired.md");
  if (existsSync(g)) { rmSync(g); dropped++; }
}
console.log(`${out}: skills removed, ${dropped} skill-fired graders dropped`);
