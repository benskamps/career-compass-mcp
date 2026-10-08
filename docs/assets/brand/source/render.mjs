// Renders the Career Compass brand images with headless Chromium. No network:
// every request is answered from this folder (pages, compass.js) or FONT_DIR (woff2).
//
//   FONT_DIR=/path/to/woff2 OUT_DIR=.. node render.mjs
//
// FONT_DIR must hold fraunces-{italic,normal}-latin.woff2 and jetbrainsmono-normal-latin.woff2.
// Writes raw 2x PNGs into OUT_DIR (default: the parent folder). Then shrink them to <= 600 KB:
//   python3 optimize.py RAW_DIR ..   (pass file names as args here to render only some)
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const FONT_DIR = process.env.FONT_DIR || join(here, '..', '..', 'demo', 'source', 'fonts');
const OUT_DIR = process.env.OUT_DIR || join(here, '..');
const SCALE = Number(process.env.SCALE || 2);
const ORIGIN = 'http://brand.local/';

const jobs = [
  { page: 'banner.html', q: '', w: 1600, h: 560, out: 'banner.png' },
  { page: 'banner.html', q: '?theme=dark', w: 1600, h: 560, out: 'banner-dark.png' },
  { page: 'social.html', q: '?w=1280&h=640', w: 1280, h: 640, out: 'social-preview.png' },
  { page: 'social.html', q: '?w=1200&h=630', w: 1200, h: 630, out: 'og.png' },
];
const only = process.argv.slice(2);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.css': 'text/css' };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
for (const j of jobs) {
  if (only.length && !only.includes(j.out)) continue;
  const ctx = await browser.newContext({ viewport: { width: j.w, height: j.h }, deviceScaleFactor: SCALE });
  await ctx.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin + '/' !== ORIGIN) return route.abort(); // no network, ever
    const p = decodeURIComponent(url.pathname.slice(1));
    const file = p.startsWith('fonts/') ? join(FONT_DIR, p.slice(6)) : join(here, p);
    try {
      route.fulfill({ status: 200, body: await readFile(file), contentType: types[extname(file)] || 'application/octet-stream' });
    } catch {
      route.fulfill({ status: 404, body: 'missing ' + p });
    }
  });
  const page = await ctx.newPage();
  await page.goto(ORIGIN + j.page + j.q, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const missing = await page.evaluate(() => ['Fraunces', '"JetBrains Mono"'].filter((f) => !document.fonts.check(`italic 40px ${f}`) && !document.fonts.check(`40px ${f}`)));
  if (missing.length) throw new Error('fonts not loaded: ' + missing.join(', '));
  await page.screenshot({ path: join(OUT_DIR, j.out), clip: { x: 0, y: 0, width: j.w, height: j.h } });
  console.log('rendered', j.out, `${j.w * SCALE}x${j.h * SCALE}`);
  await ctx.close();
}
await browser.close();
