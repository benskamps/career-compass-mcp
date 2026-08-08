#!/usr/bin/env node
import { homedir } from "os";
import { join, resolve } from "path";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { createServer as createNetServer } from "net";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

/** The dashboard binds loopback and nothing else. Declared here because this
 *  file executes top-level: findPort() runs during module evaluation, so a
 *  const declared further down is still in its temporal dead zone. */
const LOOPBACK = "127.0.0.1";

const args = process.argv.slice(2);

// ─── Version ─────────────────────────────────────────────────────────────────
const __cliDir = fileURLToPath(new URL(".", import.meta.url));

/**
 * Re-exported from src/version.ts so the CLI and the MCP server resolve the
 * version through exactly one code path. Kept as a named export here because
 * cli-version.test.ts exercises it directly.
 */
import { readPkgVersion } from "../src/version.js";
import { bundledSampleDir } from "../src/sample-data.js";
export { readPkgVersion };

const pkgVersion = readPkgVersion(__cliDir);

if (args.includes("--version") || args.includes("-v")) {
  console.log(`career-compass-mcp v${pkgVersion}`);
  process.exit(0);
}

// ─── Help ────────────────────────────────────────────────────────────────────
if (args.includes("--help") || args.includes("-h")) {
  console.log(`
career-compass-mcp v${pkgVersion}

Usage:
  career-compass-mcp                         Run MCP server (stdio)
  career-compass-mcp dashboard               Open web dashboard (full if built, else lite)
  career-compass-mcp dashboard --sample      Open the bundled Alex Rivera demo
  career-compass-mcp dashboard --lite        Force the zero-build lite dashboard
  career-compass-mcp dashboard --port 3000   Specify port (default: 3141)
  career-compass-mcp dashboard --no-open     Start without opening browser

Options:
  -h, --help       Show this help message
  -v, --version    Show version number
  --sample         Serve the bundled read-only demo (alias: --demo).
                   Ignores CAREER_DATA_PATH; writes nothing.
  --lite           Use the built-in zero-build dashboard (no Next.js build needed)
  --port <number>  Dashboard port (default: 3141)
  --no-open        Don't auto-open browser

Your data folder is CAREER_DATA_PATH, or ~/.career-compass when that is unset.
`);
  process.exit(0);
}

const isDashboard = args[0] === "dashboard";

if (!isDashboard) {
  // Run MCP server on stdio (existing behavior)
  await import("../src/index.js");
} else {
  // Dashboard mode
  const portArg = args.indexOf("--port");
  let requestedPort = 3141;
  if (portArg >= 0) {
    const portValue = parseInt(args[portArg + 1], 10);
    if (isNaN(portValue) || portValue < 1 || portValue > 65535) {
      console.error(`Error: Invalid port "${args[portArg + 1]}". Must be a number between 1 and 65535.`);
      process.exit(1);
    }
    requestedPort = portValue;
  }
  const noOpen = args.includes("--no-open");
  const forceLite = args.includes("--lite");
  const useSample = args.includes("--sample") || args.includes("--demo");

  const dataPath = resolveDataPath(useSample);

  // Find available port
  const port = await findPort(requestedPort);

  // Resolve standalone server path
  // __cliDir is build/bin/ at runtime; go up two levels to repo root
  const standalonePath = join(__cliDir, "..", "..", "dashboard", ".next", "standalone", "dashboard", "server.js");

  // Decide which dashboard to serve:
  //   --lite always uses the built-in zero-build dashboard.
  //   Otherwise prefer the full Next.js dashboard when it has been built.
  //   If the full build is absent (e.g. the npm install), fall back to lite
  //   instead of erroring — the dashboard now always works.
  const useLite = forceLite || !existsSync(standalonePath);

  if (useLite) {
    process.env.CAREER_DATA_PATH = dataPath; // loadPipeline() reads this
    const { startLiteDashboard } = await import("../src/dashboard-lite/server.js");
    if (!forceLite) {
      console.error("Full dashboard isn't built in this install — starting the built-in lite dashboard.");
      console.error("(Run `npm run build` from source for the full Next.js dashboard with kanban drag, analytics, and Career KB views.)");
    }
    const server = await startLiteDashboard(port);
    console.error(`Lite dashboard running at http://localhost:${port}`);
    if (!noOpen) openBrowser(`http://localhost:${port}`);
    const shutdownLite = () => { server.close(); process.exit(0); };
    process.on("SIGINT", shutdownLite);
    process.on("SIGTERM", shutdownLite);
    // Keep the process alive on the listening server.
    await new Promise(() => {});
  } else {
    // Start Next.js standalone server
    const child = spawn("node", [standalonePath], {
      env: {
        ...process.env,
        PORT: String(port),
        HOSTNAME: "localhost",
        CAREER_DATA_PATH: dataPath,
      },
      stdio: ["pipe", "pipe", "inherit"],
    });

    child.stdout?.on("data", (data: Buffer) => {
      const output = data.toString();
      if (output.includes("Ready") || output.includes("started")) {
        console.error(`Dashboard running at http://localhost:${port}`);
        if (!noOpen) {
          openBrowser(`http://localhost:${port}`);
        }
      }
    });

    const shutdown = () => { child.kill("SIGTERM"); process.exit(0); };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }
}

/**
 * Find a free port, probing the exact address the dashboard will bind.
 *
 * `listen(port)` with no host binds every interface, which is the wrong test in
 * two ways: it can call a port free when something already holds it on
 * 127.0.0.1, and for the moment it is open it accepts connections from the
 * network — on a tool whose entire promise is that nothing leaves the machine.
 * Probe loopback, bind loopback.
 */
function findPort(preferred: number): Promise<number> {
  return new Promise((resolve) => {
    const server = createNetServer();
    server.listen(preferred, LOOPBACK, () => { server.close(() => resolve(preferred)); });
    server.on("error", () => {
      const fallback = createNetServer();
      fallback.listen(0, LOOPBACK, () => {
        const addr = fallback.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        fallback.close(() => resolve(port));
      });
    });
  });
}

function ensureDataDirs(dir: string): void {
  mkdirSync(join(dir, "career"), { recursive: true });
  mkdirSync(join(dir, "pipeline"), { recursive: true });
}

/**
 * Decide which folder the dashboard serves, and refuse the one case that used
 * to fail silently.
 *
 * The README's own demo line was `CAREER_DATA_PATH=data/example npx -y
 * career-compass-mcp dashboard --lite`. That path is relative, and npx runs it
 * from wherever the user happens to be standing — so unless they were inside a
 * clone of this repo it resolved to a folder that did not exist, which this
 * function's predecessor then created. The result was an empty dashboard, a
 * stray `./data/example/` left in their working directory, and no indication
 * that either had happened. `--sample` is the flag that command actually
 * wanted: it resolves the demo inside the installed package, wherever npx put
 * it.
 *
 * A missing CAREER_DATA_PATH is now refused rather than conjured. Creating a
 * directory the user did not ask for is the more surprising of the two
 * behaviours — the default `~/.career-compass` is still created without
 * ceremony, because that one *is* what they asked for by not choosing.
 */
function resolveDataPath(useSample: boolean): string {
  if (useSample) {
    const sample = bundledSampleDir();
    if (!sample) {
      console.error("Error: --sample serves the bundled demo (data/example/), which is missing from this install.");
      console.error("Reinstall the package, or drop --sample and point CAREER_DATA_PATH at your own folder.");
      process.exit(1);
    }
    console.error(`Serving the bundled Alex Rivera demo — read-only, nothing is written:\n  ${sample}`);
    return sample;
  }

  const configured = process.env.CAREER_DATA_PATH;
  if (!configured) {
    const fallback = join(homedir(), ".career-compass");
    ensureDataDirs(fallback);
    return fallback;
  }

  const abs = resolve(configured);
  if (!existsSync(abs)) {
    console.error(`Error: CAREER_DATA_PATH points at a folder that does not exist:\n  ${abs}`);
    if (abs !== configured) {
      console.error(`  (resolved from "${configured}" against ${process.cwd()})`);
    }
    console.error("");
    console.error("Nothing was created: an empty folder here would open an empty dashboard and");
    console.error("leave a stray directory behind. One of these is probably what you meant:");
    console.error("");
    console.error("  To see the bundled demo:");
    console.error("      career-compass-mcp dashboard --sample");
    console.error("  To use your own data in the default folder (~/.career-compass):");
    console.error("      clear CAREER_DATA_PATH from your environment");
    console.error("  To really use this folder:");
    console.error(`      mkdir "${abs}"`);
    process.exit(1);
  }
  ensureDataDirs(abs);
  return abs;
}

function openBrowser(url: string): void {
  const cmd = process.platform === "win32" ? "start" : process.platform === "darwin" ? "open" : "xdg-open";
  spawn(cmd, [url], { shell: true, stdio: "ignore", detached: true }).unref();
}
