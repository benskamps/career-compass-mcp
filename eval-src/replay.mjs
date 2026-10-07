#!/usr/bin/env node
// Replays the write-tool calls recorded in eval traces against the real server.
//
// A scored eval run answers every tool from a mock, so "trust 100%" says the model
// asked before writing; it says nothing about what a write would have done to the
// files. This replays each recorded call to a write tool, in order, against the
// built server on a scratch copy of the case's data (empty, or Alex Rivera's KB),
// and reports any call the real server refused or that lost stored data.
// No model calls, no cost. Keep traces with `claude plugin eval ... --keep-traces`
// (or copy each run's tracePath before the temp folder is cleaned up).
//
// Usage: npm run build:mcp && node eval-src/replay.mjs <trace.jsonl | folder> [--state kb|empty]

import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
const PREFIX = "mcp__plugin_career-compass_career-compass__";
const WRITES = new Set(["save_career_section", "pipeline_add", "pipeline_update", "capture_insight", "generate_rejection_response"]);

const args = process.argv.slice(2);
const stateArg = args.includes("--state") ? args[args.indexOf("--state") + 1] : null;
const targets = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--state");
if (!targets.length) {
  console.error("Usage: node eval-src/replay.mjs <trace.jsonl | folder> [--state kb|empty]");
  process.exit(1);
}

function traces(path) {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return path.endsWith(".jsonl") ? [path] : [];
  return readdirSync(path).flatMap((f) => traces(join(path, f)));
}

// Trace lines are JSON events; tool calls are any object with type "tool_use".
function toolCalls(file) {
  const calls = [];
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    if (v.type === "tool_use" && typeof v.name === "string" && v.name.startsWith(PREFIX)) {
      calls.push({ tool: v.name.slice(PREFIX.length), input: v.input ?? {} });
    }
    Object.values(v).forEach(walk);
  };
  for (const line of readFileSync(file, "utf-8").split("\n")) {
    if (!line.trim()) continue;
    try { walk(JSON.parse(line)); } catch { /* not JSON */ }
  }
  return calls;
}

function guessState(file) {
  if (stateArg) return stateArg;
  return /memory-|sweep-|routing-|offer-record|close-out|application-answers|injection|save-keeps/.test(file) ? "kb" : "empty";
}

async function replay(file) {
  const writes = toolCalls(file).filter((c) => WRITES.has(c.tool));
  if (!writes.length) return { file, writes: 0, problems: [] };
  const state = guessState(file);
  const dataDir = mkdtempSync(join(tmpdir(), "cc-replay-"));
  if (state === "kb") cpSync(join(repo, "data", "example"), dataDir, { recursive: true });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(repo, "build", "src", "index.js")],
    env: { ...process.env, CAREER_DATA_PATH: dataDir },
    stderr: "ignore",
  });
  const client = new Client({ name: "eval-replay", version: "1.0.0" });
  await client.connect(transport);
  const problems = [];
  try {
    for (const { tool, input } of writes) {
      const res = await client.callTool({ name: tool, arguments: input });
      const text = (res.content ?? []).map((c) => c.text ?? "").join("\n");
      if (res.isError) problems.push(`${tool}: error: ${text.split("\n")[0]}`);
      else if (/Not saved|removed: (?!none)/i.test(text)) problems.push(`${tool}: ${text.split("\n").find((l) => /Not saved|removed/i.test(l))}`);
    }
  } finally {
    await client.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
  return { file, writes: writes.length, problems };
}

let bad = 0;
for (const file of targets.flatMap(traces)) {
  const r = await replay(file);
  if (!r.writes) continue;
  console.log(`${r.problems.length ? "✗" : "✓"} ${r.file}: ${r.writes} write call(s)`);
  for (const p of r.problems) console.log(`    ${p}`);
  bad += r.problems.length;
}
process.exit(bad ? 1 : 0);
