#!/usr/bin/env node
/**
 * build-report.mjs — assemble the architectural-gauntlet HTML report.
 *
 * Two inputs, one output, no clock:
 *   docs/architecture-audit.md   the canonical document (owns the mermaid sources)
 *   docs/report/_template.html   the house-style reading surface (owns the prose)
 *
 * The template carries `<!--SLOT:FIG-NN-->` tokens. This script renders every
 * ```mermaid fence in the audit through the html-artifacts diagram tool and
 * splices the resulting <figure> into its slot. Author the diagram once, in the
 * document that argues for it; the page can never disagree with the audit.
 *
 * Deterministic: no timestamps, no randomness. Same audit + same template →
 * byte-identical HTML.
 *
 *   node docs/report/build-report.mjs [--out <path.html>]
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const AUDIT = join(REPO, "docs", "architecture-audit.md");
const TEMPLATE = join(HERE, "_template.html");
const FIGDIR = join(HERE, "figures");

/** The house diagram tool. Lives with the skill so every artifact renders alike. */
const TOOL = join(
  process.env.HOME ?? process.env.USERPROFILE ?? "",
  ".claude", "skills", "html-artifacts", "tools", "render-mermaid.mjs",
);

const argv = process.argv.slice(2);
const outIdx = argv.indexOf("--out");
const OUT = outIdx >= 0 && argv[outIdx + 1]
  ? resolve(argv[outIdx + 1])
  : join(REPO, "docs", "report", "career-compass-architectural-gauntlet.html");

const skipRender = argv.includes("--no-render");

if (!skipRender) {
  if (!existsSync(TOOL)) {
    console.error(`Diagram tool not found at ${TOOL}\n` +
      `Install it: cd ~/.claude/skills/html-artifacts/tools && npm install\n` +
      `Or re-run with --no-render to reuse docs/report/figures/.`);
    process.exit(2);
  }
  await mkdir(FIGDIR, { recursive: true });
  const r = spawnSync(process.execPath, [TOOL, "--in", AUDIT, "--out", FIGDIR, "--prefix", "cc-fig"], {
    stdio: "inherit",
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const figures = JSON.parse(await readFile(join(FIGDIR, "diagrams.json"), "utf-8"));
const blocks = (await readFile(join(FIGDIR, "diagrams.html"), "utf-8"))
  .split(/\n\n(?=<figure)/)
  .map((s) => s.trim())
  .filter(Boolean);

if (blocks.length !== figures.length) {
  console.error(`figure count mismatch: ${blocks.length} blocks vs ${figures.length} entries`);
  process.exit(1);
}

let html = await readFile(TEMPLATE, "utf-8");
for (const [i, block] of blocks.entries()) {
  const token = `<!--SLOT:FIG-${String(i + 1).padStart(2, "0")}-->`;
  if (!html.includes(token)) {
    console.error(`template has no ${token} — every rendered figure must have a home.`);
    process.exit(1);
  }
  html = html.replace(token, block);
}

const orphan = /<!--SLOT:FIG-\d+-->/.exec(html);
if (orphan) {
  console.error(`template still has an unfilled slot: ${orphan[0]}`);
  process.exit(1);
}

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, html, "utf-8");
console.error(`\n${blocks.length} figures spliced → ${OUT}`);
