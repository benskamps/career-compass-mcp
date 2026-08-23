#!/usr/bin/env node
/**
 * Stage the Next standalone build so it can actually serve itself.
 *
 * `output: "standalone"` writes a self-contained server — and deliberately does
 * NOT copy `.next/static` or `public/` into it. Next's docs say to copy them
 * yourself; nothing here ever did. The result was a dashboard that booted,
 * answered every route, returned 200 for its HTML, and served **no CSS and no
 * JavaScript at all**: raw unstyled markup, Times New Roman, blue underlined
 * links. Every request looked healthy. Every page looked broken.
 *
 * It went unnoticed for the most ordinary reason: nobody had ever looked at it.
 * The audit found that CI never built this dashboard and that `next build` did
 * not work at all; fixing the build made this reachable for the first time, and
 * the first screenshot ever taken of it showed the bug immediately.
 *
 * Run automatically as part of `npm run build:dashboard`.
 */

import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DASHBOARD = resolve(HERE, "..", "dashboard");
const STANDALONE = join(DASHBOARD, ".next", "standalone", "dashboard");

if (!existsSync(STANDALONE)) {
  console.error(
    `No standalone build at ${STANDALONE}.\n` +
      `Run \`npx next build\` in dashboard/ first — this script only stages what that produced.`,
  );
  process.exit(1);
}

const copies = [
  { from: join(DASHBOARD, ".next", "static"), to: join(STANDALONE, ".next", "static"), required: true },
  { from: join(DASHBOARD, "public"), to: join(STANDALONE, "public"), required: false },
];

for (const { from, to, required } of copies) {
  if (!existsSync(from)) {
    if (required) {
      console.error(`Expected ${from} to exist after a build. It does not — the build is incomplete.`);
      process.exit(1);
    }
    continue;
  }
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
  console.error(`staged ${from.replace(DASHBOARD, "dashboard")} -> ${to.replace(DASHBOARD, "dashboard")}`);
}

console.error("standalone build is now self-serving (CSS + JS included).");
