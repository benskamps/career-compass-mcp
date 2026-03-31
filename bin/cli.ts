#!/usr/bin/env node
import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { createServer as createNetServer } from "net";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const args = process.argv.slice(2);

// ─── Version ─────────────────────────────────────────────────────────────────
const __cliDir = fileURLToPath(new URL(".", import.meta.url));
let pkgVersion = "unknown";
try {
  const pkgJson = JSON.parse(readFileSync(join(__cliDir, "..", "..", "package.json"), "utf-8"));
  pkgVersion = pkgVersion;
} catch { /* package.json not found — version will show as "unknown" */ }

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
  career-compass-mcp dashboard               Open web dashboard
  career-compass-mcp dashboard --port 3000   Specify port (default: 3141)
  career-compass-mcp dashboard --no-open     Start without opening browser

Options:
  -h, --help       Show this help message
  -v, --version    Show version number
  --port <number>  Dashboard port (default: 3141)
  --no-open        Don't auto-open browser
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

  // Resolve data path
  const dataPath = process.env.CAREER_DATA_PATH ?? join(homedir(), ".career-compass");
  if (!existsSync(dataPath)) {
    mkdirSync(join(dataPath, "career"), { recursive: true });
    mkdirSync(join(dataPath, "pipeline"), { recursive: true });
  }

  // Find available port
  const port = await findPort(requestedPort);

  // Resolve standalone server path
  // __cliDir is build/bin/ at runtime; go up two levels to repo root
  const standalonePath = join(__cliDir, "..", "..", "dashboard", ".next", "standalone", "dashboard", "server.js");

  if (!existsSync(standalonePath)) {
    console.error("Dashboard not built. Run 'npm run build' first.");
    process.exit(1);
  }

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

function findPort(preferred: number): Promise<number> {
  return new Promise((resolve) => {
    const server = createNetServer();
    server.listen(preferred, () => { server.close(() => resolve(preferred)); });
    server.on("error", () => {
      const fallback = createNetServer();
      fallback.listen(0, () => {
        const addr = fallback.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        fallback.close(() => resolve(port));
      });
    });
  });
}

function openBrowser(url: string): void {
  const cmd = process.platform === "win32" ? "start" : process.platform === "darwin" ? "open" : "xdg-open";
  spawn(cmd, [url], { shell: true, stdio: "ignore", detached: true }).unref();
}
