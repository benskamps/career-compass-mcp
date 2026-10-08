#!/usr/bin/env node
// Records MCP mocks for the eval suite from the real, locally built server.
//
// `claude plugin eval` never starts the plugin's real server by default; it answers
// each MCP tool from a Markdown mock instead. Hand-written mocks would drift from
// what the server actually returns, so this script starts build/src/index.js
// against a known data folder, calls every tool once, and writes what came back.
//
// Each string argument is sent as a sentinel (__IN_<field>__) and every sentinel in
// the output is replaced by {{input.<field>}}, so the mock echoes whatever Claude
// actually sends, exactly as the real server would.
//
// Two states are recorded:
//   empty  - a fresh, empty data folder (a first-time user)
//   kb     - a copy of data/example (Alex Rivera, a populated Career KB and pipeline)
//
// Usage: npm run build:mcp && node eval-src/record-mocks.mjs
// Output: eval-src/mocks/<state>/career-compass/*.md and _tools.json

import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { EVAL_TODAY, shiftDates } from "./eval-date.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
const SERVER = "career-compass"; // the server's name in plugin/.mcp.json
const DISPLAY_PATH = "~/.career-compass";
// EVAL_MOCKS_ROOT lets the sync test record into a scratch folder and compare.
const MOCKS = process.env.EVAL_MOCKS_ROOT ?? join(here, "mocks");

// Arguments that need a real value to reach the interesting code path.
const OVERRIDES = {
  save_career_section: { section: "profile", data: { name: "__IN_name__", summary: "__IN_summary__" } },
  pipeline_update: { id: "__IN_id__" },
  interview_arc: { company: "__IN_company__" },
  // A real date reaches the date path; toMock turns it back into the input.
  pipeline_add: { dateApplied: "2001-02-03" },
};

// Recordings with fixed, realistic inputs, for cases whose answer depends on which
// application or company the tool is pointed at. A case opts in with `mocks: <variant>`.
const VARIANTS = {
  "kb-veridian": {
    state: "kb",
    calls: {
      prepare_interview: { company: "Veridian Health", role: "Director of Operations", interviewType: "final" },
      interview_arc: { company: "Veridian Health", role: "Director of Operations" },
    },
  },
  // The daily digest, with the sample shifted to EVAL_TODAY: a panel tomorrow,
  // a follow-up four days overdue, an offer clock running.
  "kb-today": {
    state: "kb",
    calls: { pipeline_view: { action: "next_actions" } },
  },
  "empty-today": {
    state: "empty",
    calls: { pipeline_view: { action: "next_actions" } },
  },
  // The Veridian debrief is older than five newer journal entries about other
  // companies, so a digest that only took the latest entries would lose it.
  "kb-veridian-crowded": {
    state: "kb",
    seed: (dir) => appendFileSync(join(dir, "career", "journal.yaml"), CROWDING_ENTRIES),
    calls: {
      prepare_interview: { company: "Veridian Health", role: "Director of Operations", interviewType: "final" },
    },
  },
  // An offer from a company already in the pipeline, so the offer review sees
  // that application and its older recorded offer.
  "kb-brightpath": {
    state: "kb",
    calls: {
      evaluate_offer: { company: "Brightpath Health", offerDetails: "__IN_offerDetails__" },
    },
  },
  "kb-meridian": {
    state: "kb",
    calls: {
      generate_cover_letter: { company: "Meridian Logistics Group", role: "Head of Customer Success" },
    },
  },
};

const CROWDING_ENTRIES = ["Lumen Digital", "Stratos Cloud", "Northwind Care", "Harborview Digital Health", "Quillfeather Health", "Cascade Health Partners"]
  .map((company, i) => shiftDates(`
- id: crowd00${i}
  date: "2026-06-1${i}T09:00:00.000Z"
  type: note
  company: ${company}
  summary: Read up on ${company} before applying; nothing decided yet.
  signals: []
  source: manual
  origin: user_said
`)).join("");

function sample(schema, field) {
  if (!schema) return `__IN_${field}__`;
  if (schema.enum) return schema.enum[0];
  if (schema.anyOf) return sample(schema.anyOf[0], field);
  switch (schema.type) {
    case "string": return `__IN_${field}__`;
    case "number": case "integer": return 1;
    case "boolean": return false;
    case "array": return [];
    case "object": {
      const out = {};
      for (const key of schema.required ?? []) out[key] = sample(schema.properties?.[key], key);
      return out;
    }
    default: return `__IN_${field}__`;
  }
}

function argsFor(tool) {
  const schema = tool.inputSchema ?? {};
  const args = {};
  for (const key of schema.required ?? []) args[key] = sample(schema.properties?.[key], key);
  return { ...args, ...(OVERRIDES[tool.name] ?? {}) };
}

function toMock(text, dataDir, isError) {
  const body = text
    .replaceAll(dataDir, DISPLAY_PATH)
    .replace(/__IN_([A-Za-z0-9_]+)__/g, (_, f) => `{{input.${f}}}`)
    // The untrusted-content fence takes a random nonce per call; pin it so a
    // re-record is byte-identical when the server hasn't changed.
    .replace(/UNTRUSTED_[0-9A-F]{8}/g, "UNTRUSTED_0E7A1C55")
    // Dated output would make every re-record a diff.
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, `${EVAL_TODAY}T12:00:00.000Z`)
    // No blanket replace of the real calendar day: the server's clock is pinned
    // to EVAL_TODAY, so the real day only shows up as a legitimate shifted date,
    // and on EVAL_TODAY + 1 that rewrote every "tomorrow" in the digest.
    .replaceAll("2001-02-03", "{{input.dateApplied}}")
    // pipeline_add mints a random id for the new application.
    .replace(/ID: `[0-9a-f]{8}`/g, "ID: `5eed0001`");
  const front = isError ? "---\nerror: true\n---\n\n" : "";
  return `${front}${body.trim()}\n`;
}

function freshDataDir(state) {
  const dir = mkdtempSync(join(tmpdir(), `cc-eval-${state}-`));
  if (state === "kb") {
    cpSync(join(repo, "data", "example"), dir, { recursive: true });
    shiftTree(dir);
  }
  return dir;
}

// The sample, moved to EVAL_TODAY (see eval-date.mjs).
function shiftTree(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) shiftTree(full);
    else if (entry.endsWith(".yaml")) writeFileSync(full, shiftDates(readFileSync(full, "utf-8")));
  }
}

// One server per call, on a fresh copy of the data, so a write recorded for one
// tool (pipeline_add, capture_insight) never leaks into another tool's mock.
async function withServer(state, fn, env = {}, seed) {
  const dataDir = freshDataDir(state);
  seed?.(dataDir);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(repo, "build", "src", "index.js")],
    env: { ...process.env, CAREER_COMPASS_TODAY: EVAL_TODAY, ...env, CAREER_DATA_PATH: dataDir },
    stderr: "ignore",
  });
  const client = new Client({ name: "eval-mock-recorder", version: "1.0.0" });
  await client.connect(transport);
  try {
    return await fn(client, dataDir);
  } finally {
    await client.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
}

async function callToMock(state, name, args, env, seed) {
  return withServer(state, async (client, dataDir) => {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n\n");
    return toMock(text, dataDir, result.isError);
  }, env, seed);
}

function cleanDir(dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function record(state) {
  const outDir = cleanDir(join(MOCKS, state, SERVER));
  const { tools } = await withServer(state, (client) => client.listTools());
  writeFileSync(join(outDir, "_tools.json"), JSON.stringify({ tools }, null, 2) + "\n");

  const skipped = [];
  for (const tool of tools) {
    // harvest_evidence reads a project folder on the user's disk; an eval run has none.
    if (tool.name === "harvest_evidence") { skipped.push(tool.name); continue; }
    try {
      writeFileSync(join(outDir, `${tool.name}.md`), await callToMock(state, tool.name, argsFor(tool)));
    } catch (err) {
      skipped.push(`${tool.name} (${err.message.split("\n")[0]})`);
    }
  }
  console.log(`${state}: ${tools.length - skipped.length} of ${tools.length} tools recorded`);
  if (skipped.length) console.log(`  skipped: ${skipped.join(", ")}`);
}

async function recordVariant(name, { state, calls, env, seed }) {
  const outDir = cleanDir(join(MOCKS, name, SERVER));
  for (const [tool, args] of Object.entries(calls)) {
    writeFileSync(join(outDir, `${tool}.md`), await callToMock(state, tool, args, env, seed));
  }
  console.log(`${name}: ${Object.keys(calls).length} tools recorded`);
}

await record("empty");
await record("kb");
for (const [name, variant] of Object.entries(VARIANTS)) await recordVariant(name, variant);
