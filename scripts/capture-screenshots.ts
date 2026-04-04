import { chromium } from "playwright";
import { spawn } from "child_process";
import { mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = join(__dirname, "../docs/screenshots");
const PORT = 3099;
const BASE = `http://localhost:${PORT}`;

const VIEWS = [
  { path: "/pipeline", name: "pipeline-kanban" },
  { path: "/pipeline/demo-001", name: "application-detail" },
  { path: "/career", name: "career-kb" },
  { path: "/analytics", name: "analytics" },
];

async function main() {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  // Start dev server
  const server = spawn(
    "npx",
    ["next", "dev", "--turbopack", "--port", String(PORT)],
    {
      cwd: join(__dirname, "../dashboard"),
      env: {
        ...process.env,
        CAREER_DATA_PATH: join(__dirname, "../data/example"),
      },
      stdio: "pipe",
      shell: true,
    }
  );

  // Wait for ready
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      resolve();
    }, 30000);
    server.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      if (
        text.includes("Ready") ||
        text.includes("started") ||
        text.includes(String(PORT))
      ) {
        clearTimeout(timeout);
        // Give it a moment to fully initialize
        setTimeout(resolve, 2000);
      }
    });
    server.on("error", reject);
  });

  const browser = await chromium.launch();

  try {
    for (const theme of ["dark", "light"] as const) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        colorScheme: theme,
      });
      const page = await context.newPage();

      for (const view of VIEWS) {
        await page.goto(`${BASE}${view.path}`, { waitUntil: "networkidle" });
        // Extra wait for charts/animations to settle
        await page.waitForTimeout(1000);
        await page.screenshot({
          path: join(SCREENSHOT_DIR, `${view.name}-${theme}.png`),
        });
        console.log(`  ${view.name}-${theme}.png`);
      }

      await context.close();
    }
  } finally {
    await browser.close();
    server.kill();
  }

  console.log(`\nScreenshots saved to ${SCREENSHOT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
