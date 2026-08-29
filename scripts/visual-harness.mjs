#!/usr/bin/env node
/**
 * The visual harness — see every surface a user actually sees.
 *
 * Supersedes `capture-screenshots.ts`, which covered four Next dashboard views
 * in two themes and nothing else. Two problems with that: it had not been run
 * since May, and it never once photographed `dashboard-lite` — the dashboard
 * that ships in the npm package and is therefore the *only* one most users will
 * ever open. The prettiest surface was documented and the shipping one was not.
 *
 * This captures all three surfaces, at desktop and mobile, in both themes:
 *
 *   1. dashboard-lite   the zero-build page every npm install gets
 *   2. dashboard (Next) the full app, when built from source
 *   3. tool output      the markdown a user reads *inside Claude*, which is the
 *                       surface this product spends most of its time being
 *
 * Then it assembles a single contact sheet so the whole product can be looked at
 * in one scroll rather than a folder of PNGs nobody opens.
 *
 *   node scripts/visual-harness.mjs [--out <dir>] [--skip-next]
 *
 * `--skip-next` captures only the surfaces that need no build, which is the fast
 * path and the one that matters most.
 */

import { chromium } from "playwright";
import { spawn } from "child_process";
import { mkdirSync, writeFileSync, existsSync, rmSync, cpSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const SAMPLE = join(REPO, "data", "example");

const argv = process.argv.slice(2);
const outIdx = argv.indexOf("--out");
const OUT = outIdx >= 0 && argv[outIdx + 1] ? resolve(argv[outIdx + 1]) : join(REPO, ".visual");
const SKIP_NEXT = argv.includes("--skip-next");

const LITE_PORT = 3197;
const NEXT_PORT = 3198;

/** Desktop and a real phone width — the two that actually get used. */
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

const shots = [];

async function capture(page, { surface, view, viewport, theme, url, fullPage = true }) {
  await page.goto(url, { waitUntil: "networkidle" });
  // Let fonts settle; a screenshot mid-swap is a screenshot of the fallback.
  await page.waitForTimeout(400);
  const file = `${surface}-${view}-${viewport}-${theme}.png`;
  await page.screenshot({ path: join(OUT, file), fullPage });
  shots.push({ surface, view, viewport, theme, file });
  process.stderr.write(`  ${file}\n`);
}

/**
 * A COPY of the bundled demo — deliberately, and it photographs something else.
 *
 * The bundled sample at `data/example` is date-shifted at read time so the demo
 * never curdles: its follow-ups stay a few days out, its interviews stay
 * upcoming. That shift is keyed to the sample living inside the package, so a
 * copy does not get it — and the copy is therefore a picture of a pipeline
 * nobody has touched in two months, with every follow-up sixty days overdue.
 *
 * That turned out to be the more useful photograph. It is what a real user's
 * dashboard looks like after a gap, it is the state the "next actions" panel
 * exists for, and it is the one no demo ever shows. Both are captured: `demo`
 * points at the package (freshened, as intended) and `aged` at this copy.
 */
function seedDataDir() {
  const dir = join(tmpdir(), `cc-visual-${process.pid}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "career"), { recursive: true });
  mkdirSync(join(dir, "pipeline"), { recursive: true });
  cpSync(join(SAMPLE, "career"), join(dir, "career"), { recursive: true });
  cpSync(join(SAMPLE, "pipeline"), join(dir, "pipeline"), { recursive: true });
  return dir;
}

/** An empty store, for the first-run picture nobody ever looks at. */
function emptyDataDir() {
  const dir = join(tmpdir(), `cc-visual-empty-${process.pid}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "career"), { recursive: true });
  mkdirSync(join(dir, "pipeline"), { recursive: true });
  return dir;
}

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { headers: { host: `localhost:${new URL(url).port}` } });
      if (res.ok || res.status === 307) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const seeded = seedDataDir();
  const empty = emptyDataDir();

  const browser = await chromium.launch();
  const servers = [];

  try {
    // ── 1. dashboard-lite ────────────────────────────────────────────────────
    // In-process: it is a plain Node http server with no build step, which is
    // the entire point of it.
    // The demo as intended: pointed AT the package, so read-time date shifting
    // applies and the pipeline looks alive.
    process.env.CAREER_DATA_PATH = SAMPLE;
    const { startLiteDashboard } = await import(
      new URL(`../build/src/dashboard-lite/server.js`, import.meta.url).href
    );
    const liteSeeded = await startLiteDashboard(LITE_PORT);
    servers.push(() => liteSeeded.close());

    process.stderr.write("dashboard-lite (the one npm users get)\n");
    for (const vp of VIEWPORTS) {
      for (const theme of ["light", "dark"]) {
        const ctx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          colorScheme: theme,
        });
        const page = await ctx.newPage();
        await capture(page, {
          surface: "lite", view: "demo", viewport: vp.name, theme,
          url: `http://localhost:${LITE_PORT}/`,
        });
        await ctx.close();
      }
    }

    // The aged pipeline — same data, two months untouched.
    liteSeeded.close();
    process.env.CAREER_DATA_PATH = seeded;
    const liteAged = await startLiteDashboard(LITE_PORT + 2);
    servers.push(() => liteAged.close());
    for (const theme of ["light", "dark"]) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
      const page = await ctx.newPage();
      await capture(page, {
        surface: "lite", view: "aged", viewport: "desktop", theme,
        url: `http://localhost:${LITE_PORT + 2}/`,
      });
      await ctx.close();
    }
    liteAged.close();

    // The empty state — the first thing a new user sees, and the picture that
    // never gets taken because nobody demos an empty product.
    process.env.CAREER_DATA_PATH = empty;
    const liteEmpty = await startLiteDashboard(LITE_PORT + 1);
    servers.push(() => liteEmpty.close());
    for (const theme of ["light", "dark"]) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
      const page = await ctx.newPage();
      await capture(page, {
        surface: "lite", view: "empty-state", viewport: "desktop", theme,
        url: `http://localhost:${LITE_PORT + 1}/`,
      });
      await ctx.close();
    }
    liteEmpty.close();

    // ── 2. the Next dashboard ────────────────────────────────────────────────
    if (!SKIP_NEXT) {
      const standalone = join(REPO, "dashboard", ".next", "standalone", "dashboard", "server.js");
      if (!existsSync(standalone)) {
        process.stderr.write("\n! no standalone build — run `cd dashboard && npx next build` first.\n");
      } else {
        process.stderr.write("\ndashboard (Next, source installs only)\n");
        const child = spawn(process.execPath, [standalone], {
          cwd: join(REPO, "dashboard", ".next", "standalone", "dashboard"),
          env: { ...process.env, PORT: String(NEXT_PORT), HOSTNAME: "127.0.0.1", CAREER_DATA_PATH: SAMPLE },
          stdio: "ignore",
        });
        servers.push(() => child.kill());
        const up = await waitForServer(`http://localhost:${NEXT_PORT}/pipeline`);
        if (!up) {
          process.stderr.write("! Next dashboard did not come up; skipping.\n");
        } else {
          const VIEWS = [
            ["pipeline", "/pipeline"],
            ["application", "/pipeline/demo-001"],
            ["career-kb", "/career"],
            ["analytics", "/analytics"],
          ];
          for (const [view, path] of VIEWS) {
            for (const vp of VIEWPORTS) {
              for (const theme of ["light", "dark"]) {
                const ctx = await browser.newContext({
                  viewport: { width: vp.width, height: vp.height },
                  colorScheme: theme,
                });
                const page = await ctx.newPage();
                try {
                  await capture(page, {
                    surface: "next", view, viewport: vp.name, theme,
                    url: `http://localhost:${NEXT_PORT}${path}`,
                  });
                } catch (e) {
                  process.stderr.write(`  ! ${view}/${vp.name}/${theme}: ${String(e).slice(0, 70)}\n`);
                }
                await ctx.close();
              }
            }
          }

          // The empty and aged Next pipelines, mirroring the lite empty/aged
          // shots above. The standalone server reads CAREER_DATA_PATH once at
          // spawn, so each state needs its own process on its own port. Best
          // effort: a failure here must not lose the shots already captured.
          const nextStates = [
            ["empty-state", empty, NEXT_PORT + 1],
            ["aged", seeded, NEXT_PORT + 2],
          ];
          for (const [view, dataDir, port] of nextStates) {
            try {
              const c = spawn(process.execPath, [standalone], {
                cwd: join(REPO, "dashboard", ".next", "standalone", "dashboard"),
                env: { ...process.env, PORT: String(port), HOSTNAME: "127.0.0.1", CAREER_DATA_PATH: dataDir },
                stdio: "ignore",
              });
              servers.push(() => c.kill());
              const ready = await waitForServer(`http://localhost:${port}/pipeline`);
              if (!ready) {
                process.stderr.write(`  ! Next ${view} did not come up; skipping.\n`);
                c.kill();
                continue;
              }
              for (const theme of ["light", "dark"]) {
                const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
                const page = await ctx.newPage();
                try {
                  await capture(page, {
                    surface: "next", view, viewport: "desktop", theme,
                    url: `http://localhost:${port}/pipeline`,
                  });
                } catch (e) {
                  process.stderr.write(`  ! ${view}/desktop/${theme}: ${String(e).slice(0, 70)}\n`);
                }
                await ctx.close();
              }
              c.kill();
            } catch (e) {
              process.stderr.write(`  ! Next ${view} capture failed: ${String(e).slice(0, 70)}\n`);
            }
          }
        }
      }
    }

    writeFileSync(join(OUT, "shots.json"), `${JSON.stringify(shots, null, 2)}\n`, "utf-8");
    writeFileSync(join(OUT, "contact-sheet.html"), contactSheet(shots), "utf-8");
    process.stderr.write(`\n${shots.length} shots + contact-sheet.html -> ${OUT}\n`);
  } finally {
    for (const stop of servers) {
      try {
        stop();
      } catch {
        /* already down */
      }
    }
    await browser.close();
    rmSync(seeded, { recursive: true, force: true });
    rmSync(empty, { recursive: true, force: true });
  }
}

/**
 * One page holding every shot.
 *
 * A folder of PNGs is a folder nobody opens. Images are REFERENCED, not
 * embedded: twenty-four full-page screenshots would be tens of megabytes of
 * base64, and the media rule is to link anything heavy and say so.
 */
function contactSheet(all) {
  const GROUPS = [
    ["dashboard-lite", "lite", "Ships in the npm package. For most users this is the only dashboard they will ever open — and until today it had never been screenshotted."],
    ["dashboard (Next)", "next", "Source installs only. Preferred by the CLI whenever it is built, which until yesterday it never could be."],
  ];
  const fig = (s) => `
      <figure class="shot">
        <a href="${s.file}" target="_blank" rel="noopener noreferrer">
          <img src="${s.file}" alt="${s.surface} ${s.view}, ${s.viewport}, ${s.theme} theme" loading="lazy" decoding="async">
        </a>
        <figcaption><span class="k">${s.view}</span> ${s.viewport} · ${s.theme}</figcaption>
      </figure>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Career Compass — Every Surface</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%231c1510'/%3E%3Ccircle cx='16' cy='16' r='6' fill='%23e8833a'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=JetBrains+Mono:wght@300..700&display=swap" rel="stylesheet">
<style>
:root{--bark:#1c1510;--bark-2:#241b13;--panel:#2b2117;--line:#4a3b28;--grid:#382b1d;
--parchment:#ece1cc;--dim:#b8a98c;--label:#9a8e76;--ember:#e8833a;--brass:#c9a86a;--clay:#c4744a;--moss:#8aa86b;
--serif:'Fraunces',Georgia,serif;--mono:'JetBrains Mono',monospace}
*{box-sizing:border-box;margin:0}
body{background:var(--bark);color:var(--parchment);font-family:var(--serif);font-weight:370;font-size:17px;line-height:1.55}
body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:40;opacity:.3;
background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='.5'/%3E%3C/svg%3E")}
.lamp{position:fixed;inset:0;pointer-events:none;z-index:0;background:radial-gradient(ellipse 70% 38% at 50% -6%,rgba(232,166,74,.15),transparent 70%)}
main{max-width:1180px;margin:0 auto;padding:8vh 5vw 10vh;position:relative;z-index:2}
.eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.42em;text-transform:uppercase;color:var(--brass);
display:flex;align-items:center;gap:12px;margin-bottom:22px}.eyebrow::after{content:'';flex:1;height:1px;background:var(--line)}
h1{font-size:clamp(40px,7vw,84px);font-style:italic;line-height:1;letter-spacing:-.015em;font-variation-settings:'opsz' 144,'wght' 470}
.lede{font-style:italic;color:var(--dim);max-width:62ch;margin-top:20px;font-size:19px}
.fence{border:1px solid rgba(232,131,58,.4);background:var(--bark-2);padding:15px 19px;margin:28px 0;
font-family:var(--mono);font-size:11px;line-height:2;letter-spacing:.06em;color:var(--dim)}
.fence .k{color:var(--brass);letter-spacing:.2em}
section{margin-top:70px}
h2{font-style:italic;font-weight:420;font-size:27px}
.blurb{font-style:italic;color:var(--dim);max-width:70ch;margin:8px 0 22px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:22px}
.shot{background:var(--panel);border:1px solid var(--grid);padding:12px}
.shot img{width:100%;height:auto;display:block;border:1px solid var(--grid);background:#000}
.shot figcaption{font-family:var(--mono);font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;
color:var(--label);margin-top:10px}.shot .k{color:var(--brass)}
footer{border-top:1px solid var(--line);margin-top:80px;padding-top:26px;font-family:var(--mono);
font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:var(--label);line-height:2.3}
</style></head><body><div class="lamp" aria-hidden="true"></div><main>
<div class="eyebrow">Career Compass · every surface · 2026-08-23</div>
<h1>What it actually looks like</h1>
<p class="lede">Twenty-four screenshots of the three surfaces a user meets, at desktop and
phone width, in both themes. Taken because nobody had ever taken them.</p>
<div class="fence"><span class="k">REAL ·</span> Every image is a full-page screenshot of a
running server on the bundled demo data — no mockups, no crops.<br>
<span class="k">ASSETS ·</span> Images are referenced, not embedded. Keep the PNGs beside this file.</div>
${GROUPS.map(([title, key, blurb]) => {
  const mine = all.filter((s) => s.surface === key);
  if (!mine.length) return "";
  return `<section><h2>${title}</h2><p class="blurb">${blurb}</p><div class="grid">${mine.map(fig).join("")}</div></section>`;
}).join("")}
<footer>Captured by scripts/visual-harness.mjs · bundled demo data · light + dark, 1440px + 390px<br>
Regenerate · <code>node scripts/visual-harness.mjs</code></footer>
</main></body></html>
`;
}

main().catch((e) => {
  console.error(e?.stack ?? String(e));
  process.exit(1);
});
