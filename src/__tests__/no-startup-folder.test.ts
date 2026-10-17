import { describe, it, expect, afterEach } from "vitest";
import { spawn } from "child_process";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Starting the server creates nothing on disk.
 *
 * A plugin installed on claude.ai is synced into Claude Code, which starts this
 * server in every session whether or not the person ever asks a job question.
 * It used to create ~/.career-compass/career and /pipeline on each start, so
 * hundreds of people who never used it got a hidden folder in their home
 * directory. The first save creates the folder now, and check_setup reports
 * a folder that isn't there yet as a fresh install, not a problem.
 */

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const builtServer = path.join(repoRoot, "build", "src", "index.js");

const temps: string[] = [];
afterEach(() => {
  for (const d of temps.splice(0)) {
    try {
      rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // Left in the OS temp directory, which is what it is for.
    }
  }
});

/** Sends JSON-RPC lines to the server and returns each response by id. */
function rpc(home: string, messages: object[], waitFor: number[]): Promise<Map<number, any>> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, USERPROFILE: home };
    delete env.CAREER_DATA_PATH;
    const child = spawn(process.execPath, [builtServer], { env, stdio: ["pipe", "pipe", "pipe"] });
    const results = new Map<number, any>();
    let buf = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`timed out; got ids ${[...results.keys()].join(",")}`));
    }, 20_000);
    child.stdout.on("data", (d) => {
      buf += d;
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const msg = JSON.parse(line);
        if (typeof msg.id === "number") results.set(msg.id, msg);
        if (waitFor.every((id) => results.has(id))) {
          clearTimeout(timer);
          child.kill();
          resolve(results);
        }
      }
    });
    child.on("error", reject);
    for (const m of messages) child.stdin.write(JSON.stringify(m) + "\n");
  });
}

describe.skipIf(!existsSync(builtServer))("server startup", () => {
  it("creates no data folder until something is saved", async () => {
    const home = mkdtempSync(path.join(tmpdir(), "cc-nofolder-"));
    temps.push(home);

    const out = await rpc(
      home,
      [
        {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } },
        },
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
        {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "check_setup", arguments: { checkForUpdates: false } },
        },
        {
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: { name: "pipeline_view", arguments: { action: "next_actions" } },
        },
      ],
      [1, 2, 3, 4],
    );

    expect(out.get(2).result.tools.length).toBeGreaterThan(0);
    expect(existsSync(path.join(home, ".career-compass")), "starting the server created the data folder").toBe(false);

    const setup = out.get(3).result.content.map((c: { text: string }) => c.text).join("\n");
    expect(setup).toMatch(/Nothing is broken/);
    expect(setup).not.toMatch(/Restart your MCP client/);
    expect(out.get(4).result.isError ?? false).toBe(false);
    expect(existsSync(path.join(home, ".career-compass")), "a read created the data folder").toBe(false);
  });

  it("creates the folder on the first save", async () => {
    const home = mkdtempSync(path.join(tmpdir(), "cc-firstsave-"));
    temps.push(home);

    const out = await rpc(
      home,
      [
        {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } },
        },
        { jsonrpc: "2.0", method: "notifications/initialized" },
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "pipeline_add", arguments: { company: "Acme", role: "Data Analyst" } },
        },
      ],
      [1, 2],
    );

    expect(out.get(2).result.isError ?? false).toBe(false);
    expect(existsSync(path.join(home, ".career-compass", "pipeline", "applications.yaml"))).toBe(true);
  });
});
