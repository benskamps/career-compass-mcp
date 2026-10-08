// Re-render the Career Compass demo: node docs/assets/demo/source/render.mjs
// Needs: playwright (repo devDependency) + a Chromium, and ffmpeg on PATH. No network.
// Env: CHROMIUM=/path/to/chrome (optional), FRAMES_DIR (optional scratch dir), STILLS=t1,t2 (optional).
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const out = dirname(here); // docs/assets/demo
const page_url = pathToFileURL(join(here, 'index.html')).href;
const frames = process.env.FRAMES_DIR || join(tmpdir(), 'cc-demo-frames');
const exe = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const FPS = 30;           // master frames; GIF uses every other one (15fps)
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });

const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
// block anything that is not a local file
await page.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
await page.goto(page_url);
await page.evaluate(() => window.ready);
const dur = await page.evaluate(() => window.DURATION);
const posterT = await page.evaluate(() => window.POSTER_T);

const n = Math.round(dur * FPS);
for (let i = 0; i < n; i++) {
  await page.evaluate(t => window.seek(t), i / FPS);
  await page.screenshot({ path: join(frames, `f${String(i).padStart(5, '0')}.png`) });
  if (i % 60 === 0) process.stdout.write(`frame ${i}/${n}\n`);
}
await page.evaluate(t => window.seek(t), posterT);
await page.screenshot({ path: join(out, 'poster.png') });
if (process.env.STILLS) for (const t of process.env.STILLS.split(',')) {
  await page.evaluate(t => window.seek(t), +t);
  await page.screenshot({ path: join(frames, `still-${t}.png`) });
}
await browser.close();

const ff = (...a) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a], { stdio: 'inherit' });
const inp = ['-framerate', String(FPS), '-i', join(frames, 'f%05d.png')];

ff(...inp, '-c:v', 'libx264', '-preset', 'slow', '-crf', process.env.CRF || '23', '-pix_fmt', 'yuv420p',
   '-movflags', '+faststart', '-tune', 'animation', join(out, 'demo.mp4'));

const gifFps = process.env.GIF_FPS || '15';
const pal = join(frames, 'palette.png');
const pre = `fps=${gifFps},scale=960:-1:flags=lanczos`;
ff(...inp, '-vf', `${pre},palettegen=max_colors=128:stats_mode=diff`, pal);
ff(...inp, '-i', pal, '-lavfi', `${pre}[x];[x][1:v]paletteuse=dither=${process.env.DITHER || 'bayer:bayer_scale=4'}:diff_mode=rectangle`,
   '-loop', '0', join(out, 'demo.gif'));

for (const f of ['demo.mp4', 'demo.gif', 'poster.png'])
  console.log(f, (statSync(join(out, f)).size / 1048576).toFixed(2), 'MB');
