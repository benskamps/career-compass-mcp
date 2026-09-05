import { spawn, type ChildProcess } from "child_process";
import { existsSync, writeFileSync, mkdtempSync } from "fs";
import { randomBytes } from "crypto";
import { tmpdir } from "os";
import { delimiter, join, dirname } from "path";
import { fileURLToPath } from "url";
import type { IncomingMessage, ServerResponse } from "http";
import { isAllowedHost, hostnameOf } from "../loopback-guard.js";

/**
 * The Ask bridge — the dashboard click that actually reaches Claude.
 *
 * The lite dashboard is a page in an ordinary browser, and Claude Desktop has
 * no door a web page can knock on. Until 2.7.0 every button therefore COPIED a
 * prompt and asked the user to paste it — the one piece of friction the whole
 * surface could not remove on its own.
 *
 * This module removes it for users who have Claude Code installed. The lite
 * server already runs on the user's machine with their rights, so it can run
 * Claude Code headless (`claude -p … --output-format stream-json`) with THIS
 * package wired in as the only MCP server, and stream the answer back into the
 * page. The click becomes a real, tool-using Claude turn; the dashboard stays
 * read-only itself — every write still happens inside Claude, through the same
 * validated tools, with the same .bak safety.
 *
 * Opt-in, twice: the user passes `--ask-claude`, AND the `claude` binary has to
 * be present. Without both, the page keeps its copy buttons and loses nothing.
 *
 * Security posture (the page is an unauthenticated local origin):
 *   - POST only, loopback Host AND loopback Origin (a page in another tab can
 *     reach 127.0.0.1 too — the Origin check is what stops it);
 *   - a per-process random token, embedded in the page, required in a header;
 *   - prompts capped in length; one ask in flight at a time; the child is
 *     killed when the browser goes away; no shell — argv only;
 *   - Claude Code is run with `--strict-mcp-config` (only our server),
 *     `--setting-sources project` from the data dir (no user hooks, no user
 *     MCP servers), `--no-session-persistence`, and file/shell tools disallowed.
 */

export interface ClaudeCommand { command: string; args: string[]; }

/** Env override, mostly for tests: a path to a script or binary to run instead of `claude`. */
export const CLAUDE_BIN_ENV = "CAREER_COMPASS_CLAUDE_BIN";

/** Find Claude Code on this machine, or null. */
export function resolveClaudeCommand(env: NodeJS.ProcessEnv = process.env): ClaudeCommand | null {
  const override = env[CLAUDE_BIN_ENV];
  if (override) {
    if (/\.(mjs|cjs|js)$/i.test(override)) return { command: process.execPath, args: [override] };
    return { command: override, args: [] };
  }
  const names = process.platform === "win32" ? ["claude.exe", "claude.cmd", "claude"] : ["claude"];
  for (const dir of (env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    for (const n of names) {
      const p = join(dir, n);
      if (existsSync(p)) return { command: p, args: [] };
    }
  }
  return null;
}

/** Absolute path of this package's CLI entry, so Claude Code can launch our MCP server. */
export function ownCliPath(): string {
  // build/src/dashboard-lite/ask-bridge.js → build/bin/cli.js
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "bin", "cli.js");
}

/** Write the one-server MCP config Claude Code will use. Returns its path. */
export function writeMcpConfig(dataDir: string, cliPath: string = ownCliPath()): string {
  const dir = mkdtempSync(join(tmpdir(), "cc-ask-"));
  const file = join(dir, "mcp.json");
  const cfg = {
    mcpServers: {
      "career-compass": { command: process.execPath, args: [cliPath], env: { CAREER_DATA_PATH: dataDir } },
    },
  };
  writeFileSync(file, JSON.stringify(cfg), "utf-8");
  return file;
}

export const ASK_SYSTEM_PROMPT =
  "You are answering from the Career Compass dashboard, a small panel beside the user's job-search board. " +
  "Use the career-compass tools for every fact about the user's pipeline and Career KB; never guess at their data. " +
  "Be concrete and brief: lead with the answer, then the next step. Plain prose or short bullets; no headings deeper than one level. " +
  "If you change the pipeline or the KB, say exactly what changed in one line at the end so the user knows to reload the board.";

export function buildClaudeArgs(prompt: string, mcpConfigPath: string): string[] {
  return [
    "-p", prompt,
    "--output-format", "stream-json",
    "--verbose",
    "--strict-mcp-config",
    "--mcp-config", mcpConfigPath,
    "--setting-sources", "project",
    "--no-session-persistence",
    // The bare server name allows every tool that server exposes (Claude Code's
    // documented form); a trailing wildcard is not part of the grammar.
    "--allowedTools", "mcp__career-compass",
    "--disallowedTools", "Bash,Edit,Write,MultiEdit,NotebookEdit,WebFetch,WebSearch,Agent",
    "--append-system-prompt", ASK_SYSTEM_PROMPT,
  ];
}

export type AskEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string }
  | { type: "done"; text?: string; isError: boolean; costUsd?: number }
  | { type: "error"; message: string };

/** One NDJSON line of `--output-format stream-json` → the event the page cares about, or null. */
export function parseStreamLine(line: string): AskEvent | null {
  const t = line.trim();
  if (!t.startsWith("{")) return null;
  let obj: Record<string, unknown>;
  try { obj = JSON.parse(t); } catch { return null; }
  if (obj.type === "assistant") {
    const content = (obj.message as { content?: Array<Record<string, unknown>> } | undefined)?.content ?? [];
    const texts: string[] = [];
    let tool: string | null = null;
    for (const block of content) {
      if (block.type === "text" && typeof block.text === "string") texts.push(block.text);
      if (block.type === "tool_use" && typeof block.name === "string") tool = block.name;
    }
    if (texts.length) return { type: "text", text: texts.join("\n") };
    if (tool) return { type: "tool", name: tool.replace(/^mcp__career-compass__/, "") };
    return null;
  }
  if (obj.type === "result") {
    return {
      type: "done",
      text: typeof obj.result === "string" ? obj.result : undefined,
      isError: obj.is_error === true || obj.subtype === "error",
      costUsd: typeof obj.total_cost_usd === "number" ? obj.total_cost_usd : undefined,
    };
  }
  return null;
}

export interface RunAskOptions {
  prompt: string;
  cmd: ClaudeCommand;
  mcpConfigPath: string;
  cwd: string;
  onEvent: (e: AskEvent) => void;
  timeoutMs?: number;
}

/** Spawn Claude Code for one prompt and forward its events. Resolves when the child exits. */
export function runAsk(opts: RunAskOptions): { child: ChildProcess; finished: Promise<number | null> } {
  const args = [...opts.cmd.args, ...buildClaudeArgs(opts.prompt, opts.mcpConfigPath)];
  const child = spawn(opts.cmd.command, args, {
    cwd: opts.cwd,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    shell: false,
  });
  let buf = "";
  let stderr = "";
  let sawDone = false;
  child.stdout?.setEncoding("utf-8");
  child.stdout?.on("data", (chunk: string) => {
    buf += chunk;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
      const ev = parseStreamLine(line);
      if (ev) { if (ev.type === "done") sawDone = true; opts.onEvent(ev); }
    }
  });
  child.stderr?.setEncoding("utf-8");
  child.stderr?.on("data", (c: string) => { stderr = (stderr + c).slice(-2000); });
  const timer = setTimeout(() => { try { child.kill(); } catch { /* gone */ } }, opts.timeoutMs ?? 240_000);
  const finished = new Promise<number | null>((resolve) => {
    child.on("error", (err) => {
      clearTimeout(timer);
      opts.onEvent({ type: "error", message: `Could not start Claude Code: ${err.message}` });
      resolve(null);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (buf.trim()) { const ev = parseStreamLine(buf); if (ev) { if (ev.type === "done") sawDone = true; opts.onEvent(ev); } }
      if (!sawDone) {
        opts.onEvent({
          type: "error",
          message: code === 0
            ? "Claude Code finished without a result."
            : `Claude Code exited with code ${code}.${stderr.trim() ? " " + stderr.trim().split("\n").slice(-3).join(" · ") : ""}`,
        });
      }
      resolve(code);
    });
  });
  return { child, finished };
}

export interface AskBridge {
  /** Per-process token the page must send back. */
  token: string;
  /** The request handler for POST /ask. */
  handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
}

export const MAX_PROMPT_CHARS = 4000;

/** Loopback-origin check: a page served from another origin must not be able to drive Claude. */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    return isAllowedHost(u.host) && hostnameOf(u.host) !== null;
  } catch { return false; }
}

export function createAskBridge(opts: { dataDir: string; cmd: ClaudeCommand; mcpConfigPath?: string; timeoutMs?: number }): AskBridge {
  const token = randomBytes(24).toString("hex");
  const mcpConfigPath = opts.mcpConfigPath ?? writeMcpConfig(opts.dataDir);
  let inFlight = false;

  const send = (res: ServerResponse, ev: AskEvent) => { res.write(`data: ${JSON.stringify(ev)}\n\n`); };

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const text = (code: number, body: string) => { res.writeHead(code, { "content-type": "text/plain; charset=utf-8" }); res.end(body); };
    if (req.method !== "POST") return text(405, "POST only.");
    if (!isAllowedOrigin(req.headers.origin as string | undefined)) return text(403, "Only the dashboard's own page may ask.");
    if (req.headers["x-cc-ask-token"] !== token) return text(403, "Missing or stale ask token — reload the dashboard.");
    if (inFlight) return text(409, "Claude is already working on a question from this dashboard. Wait for it to finish.");

    let raw = "";
    for await (const chunk of req) { raw += chunk; if (raw.length > MAX_PROMPT_CHARS * 4) return text(413, "Prompt too long."); }
    let prompt: unknown;
    try { prompt = (JSON.parse(raw) as { prompt?: unknown }).prompt; } catch { return text(400, "Body must be JSON: {\"prompt\": \"…\"}"); }
    if (typeof prompt !== "string" || !prompt.trim()) return text(400, "prompt is required.");
    if (prompt.length > MAX_PROMPT_CHARS) return text(413, `Prompt too long (max ${MAX_PROMPT_CHARS} characters).`);

    inFlight = true;
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    });
    const { child, finished } = runAsk({
      prompt, cmd: opts.cmd, mcpConfigPath, cwd: opts.dataDir, timeoutMs: opts.timeoutMs,
      onEvent: (ev) => send(res, ev),
    });
    req.on("close", () => { try { child.kill(); } catch { /* already gone */ } });
    await finished;
    inFlight = false;
    res.end();
  }

  return { token, handle };
}
