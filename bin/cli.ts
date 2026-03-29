#!/usr/bin/env node
import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { createServer as createNetServer } from "net";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const args = process.argv.slice(2);
const isDashboard = args[0] === "dashboard";

if (!isDashboard) {
  // Run MCP server on stdio (existing behavior)
  await import("../src/index.js");
} else {
  // Dashboard mode
  const portArg = args.indexOf("--port");
  const requestedPort = portArg >= 0 ? parseInt(args[portArg + 1], 10) : 3141;
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
  const __dirname = fileURLToPath(new URL(".", import.meta.url));
  const standalonePath = join(__dirname, "..", "dashboard", ".next", "standalone", "dashboard", "server.js");

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
