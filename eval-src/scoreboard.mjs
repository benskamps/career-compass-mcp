#!/usr/bin/env node
// Rolls `claude plugin eval` results up to the axes in the satisfaction plan.
//
// Every grader file is named "<axis>--<check>.md", so an axis score is the share of
// that axis's grader verdicts that passed, across every with-plugin run. Graders the
// eval tool leaves out of its own score (the Skill-fired check, `arm: with-only`)
// still count here: they are indicators of exactly what the axes measure.
//
// Usage:
//   node eval-src/scoreboard.mjs                 latest result in each suite
//   node eval-src/scoreboard.mjs a.json b.json   specific result files
//   node eval-src/scoreboard.mjs --append        also add a row to eval-src/scoreboard.md

import { existsSync, readdirSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
const AXES = ["activation", "false-fire", "first-reply", "task", "honesty", "surface", "memory", "trust", "retention", "voice"];

function latest(suite) {
  const dir = join(repo, "plugin", suite, "results");
  if (!existsSync(dir)) return null;
  const runs = readdirSync(dir).filter((d) => existsSync(join(dir, d, "aggregate-result.json"))).sort();
  return runs.length ? join(dir, runs.at(-1), "aggregate-result.json") : null;
}

const args = process.argv.slice(2);
const append = args.includes("--append");
let files = args.filter((a) => a.endsWith(".json"));
for (const f of files.filter((f) => !existsSync(f))) console.error(`Skipping ${f}: not found`);
files = files.filter((f) => existsSync(f));
if (!files.length) files = ["evals", "evals-chat"].map(latest).filter(Boolean);
if (!files.length) {
  console.error("No results found. Run the suites first (see eval-src/README.md).");
  process.exit(1);
}

const tally = Object.fromEntries(AXES.map((a) => [a, { pass: 0, total: 0 }]));
const deltas = [];
const worst = [];
let cost = 0;
let judgeCost = 0;
let minRuns = Infinity;
let version = "?";
let model = "?";

for (const file of files) {
  const result = JSON.parse(readFileSync(file, "utf-8"));
  cost += result.costUsd ?? 0;
  version = result.suite?.plugins?.[0]?.version ?? version;
  for (const c of result.cases) {
    const runs = c.arms?.with ?? [];
    if (!c.name.startsWith("trigger-")) minRuns = Math.min(minRuns, runs.length);
    for (const arm of Object.values(c.arms ?? {})) {
      for (const r of arm ?? []) judgeCost += r.judgeCostUsd ?? 0;
    }
    model = c.model ?? model;
    for (const run of runs) {
      for (const g of run.graders ?? []) {
        let axis = g.name.split("--")[0];
        // A Skill call on a should-not-fire prompt is the false-fire rate.
        if (g.name === "activation--no-false-fire") axis = "false-fire";
        if (!tally[axis]) continue;
        tally[axis].total += 1;
        if (axis === "false-fire" ? !g.passed : g.passed) tally[axis].pass += 1;
      }
    }
    const withScore = c.aggregates?.score ?? c.arms?.with?.[0]?.score;
    const without = c.arms?.without;
    if (without?.length) {
      const mean = (rs) => rs.reduce((s, r) => s + r.score, 0) / rs.length;
      deltas.push(mean(runs) - mean(without));
    }
    if (typeof withScore === "number" && withScore < 1 && !c.name.startsWith("trigger-")) {
      worst.push([c.name, withScore]);
    }
  }
}

const pct = ({ pass, total }) => (total ? `${Math.round((100 * pass) / total)}%` : "n/a");

// 95% Wilson score interval. A percentage from a handful of verdicts is a guess,
// so every number on the board carries its n and its interval.
export function wilson(pass, total, z = 1.96) {
  if (!total) return null;
  const p = pass / total;
  const denom = 1 + (z * z) / total;
  const centre = (p + (z * z) / (2 * total)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}
const withCi = ({ pass, total }) => {
  const ci = wilson(pass, total);
  if (!ci) return "n/a";
  return `${pass}/${total} · ${pct({ pass, total })} (CI ${Math.round(100 * ci[0])}–${Math.round(100 * ci[1])}%)`;
};
const date = new Date().toISOString().slice(0, 10);

// The results file's costUsd leaves out the judge; the true cost of a run is both.
const totalCost = cost + judgeCost;
console.log(`\nCareer Compass ${version} · ${date} · ${files.length} result file(s) · $${totalCost.toFixed(2)} ` +
  `($${cost.toFixed(2)} runs + $${judgeCost.toFixed(2)} judge)\n`);
if (minRuns < 3) {
  console.log(`⚠ Some cases have ${minRuns} run(s). Release decisions need 3 or more runs per case; ` +
    "quote these numbers as n of m, not as conclusions.\n");
}
console.log("| Axis | Passed / verdicts · score (95% CI) |");
console.log("| --- | --- |");
for (const a of AXES) {
  const label = a === "false-fire" ? "false fires (lower is better)" : a;
  console.log(`| ${label} | ${withCi(tally[a])} |`);
}
if (deltas.length) {
  const mean = deltas.reduce((s, d) => s + d, 0) / deltas.length;
  console.log(`\nMean Δ over the no-plugin baseline: ${mean >= 0 ? "+" : ""}${mean.toFixed(2)} across ${deltas.length} cases`);
}
if (worst.length) {
  console.log("\nLowest-scoring quality cases:");
  for (const [name, score] of worst.sort((x, y) => x[1] - y[1]).slice(0, 8)) {
    console.log(`- ${name}: ${score.toFixed(2)}`);
  }
}

if (append) {
  const board = join(here, "scoreboard.md");
  if (!existsSync(board)) {
    writeFileSync(board,
      "# Eval scoreboard\n\nOne row per scored release or branch. Written by `node eval-src/scoreboard.mjs --append`.\n" +
      "Activation is the share of should-fire prompts where the skill fired; false fires is the share of\n" +
      "should-not-fire prompts where it fired anyway.\n\n" +
      `| Date | Version | ${AXES.join(" | ")} | Cost |\n| ${["---", "---", ...AXES.map(() => "---"), "---"].join(" | ")} |\n`);
  }
  appendFileSync(board, `| ${date} | ${version} | ${AXES.map((a) => withCi(tally[a])).join(" | ")} | $${totalCost.toFixed(2)} |\n`);
  console.log(`\nAppended a row to ${board}`);
}
