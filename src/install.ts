import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "fs";
import { execFileSync } from "child_process";
import { homedir } from "os";
import { join, delimiter } from "path";

/**
 * `career-compass-mcp install` — said and done.
 *
 * Every install route in the README still ended with a person opening a JSON
 * file. This finds the Claude clients on the machine and writes the entry for
 * them: Claude Desktop's config file (backed up first, other servers untouched),
 * Claude Code through its own `claude mcp add`, and Cursor's mcp.json. Clients
 * that are not installed are skipped and named, so the report says exactly what
 * happened and what to restart.
 *
 * Nothing here needs a shell; every config is read and written as JSON. The
 * only spawn is Claude Code's own CLI, argv-only.
 */

export type ClientId = "claude-desktop" | "claude-code" | "cursor";

export interface InstallOptions {
  dataPath?: string;          // sets CAREER_DATA_PATH in every entry
  only?: ClientId[];          // limit to these clients
  dryRun?: boolean;
  // Injectable for tests
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  home?: string;
  exec?: (cmd: string, args: string[]) => string; // runs Claude Code's CLI
}

export interface ClientResult {
  client: ClientId;
  label: string;
  status: "added" | "updated" | "present" | "skipped" | "dry-run" | "failed";
  detail: string;
  restart?: string;
}

/** The server entry, in the shape each client expects. */
export function serverEntry(platform: NodeJS.Platform, dataPath?: string): Record<string, unknown> {
  // Claude Desktop on Windows spawns without a shell, so `npx` (a .cmd) has to
  // go through cmd. Everywhere else `npx` resolves directly.
  const base = platform === "win32"
    ? { command: "cmd", args: ["/c", "npx", "-y", "career-compass-mcp"] }
    : { command: "npx", args: ["-y", "career-compass-mcp"] };
  return dataPath ? { ...base, env: { CAREER_DATA_PATH: dataPath } } : base;
}

export function claudeDesktopConfigPath(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, home: string): string {
  if (platform === "win32") return join(env.APPDATA ?? join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
  if (platform === "darwin") return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  return join(env.XDG_CONFIG_HOME ?? join(home, ".config"), "Claude", "claude_desktop_config.json");
}

export function cursorConfigPath(home: string): string {
  return join(home, ".cursor", "mcp.json");
}

export function claudeCodeOnPath(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string | null {
  const names = platform === "win32" ? ["claude.exe", "claude.cmd", "claude"] : ["claude"];
  for (const dir of (env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    for (const n of names) { const p = join(dir, n); if (existsSync(p)) return p; }
  }
  return null;
}

/**
 * Merge our entry into an `mcpServers` config object. Pure. Returns the new
 * object and whether anything changed. An existing entry with a different
 * `env` keeps its env unless the caller supplied one — a user's chosen data
 * folder must not be silently reset to the default.
 */
export function mergeServersConfig(
  existing: Record<string, unknown> | null,
  entry: Record<string, unknown>,
): { next: Record<string, unknown>; change: "added" | "updated" | "present" } {
  const cfg: Record<string, unknown> = existing ? structuredClone(existing) : {};
  const servers = (cfg.mcpServers && typeof cfg.mcpServers === "object" ? cfg.mcpServers : {}) as Record<string, unknown>;
  const current = servers["career-compass"] as Record<string, unknown> | undefined;
  let merged = { ...entry };
  if (current && !("env" in entry) && current.env) merged = { ...merged, env: current.env };
  const change: "added" | "updated" | "present" = !current ? "added"
    : JSON.stringify(current) === JSON.stringify(merged) ? "present" : "updated";
  cfg.mcpServers = { ...servers, "career-compass": merged };
  return { next: cfg, change };
}

function readJson(file: string): Record<string, unknown> | null {
  if (!existsSync(file)) return null;
  const raw = readFileSync(file, "utf-8").trim();
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${file} is not a JSON object`);
  return parsed as Record<string, unknown>;
}

function writeJsonWithBackup(file: string, obj: Record<string, unknown>): string | null {
  mkdirSync(join(file, ".."), { recursive: true });
  let backup: string | null = null;
  if (existsSync(file)) {
    backup = `${file}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    copyFileSync(file, backup);
  }
  writeFileSync(file, JSON.stringify(obj, null, 2) + "\n", "utf-8");
  return backup;
}

function installJsonClient(
  client: ClientId, label: string, file: string, installedMarker: string, entry: Record<string, unknown>,
  opts: InstallOptions, restart: string,
): ClientResult {
  if (!existsSync(installedMarker)) {
    return { client, label, status: "skipped", detail: `${label} not found (no ${installedMarker}).` };
  }
  let existing: Record<string, unknown> | null;
  try { existing = readJson(file); }
  catch (e) { return { client, label, status: "failed", detail: `${file} could not be parsed: ${(e as Error).message}. Fix it or move it aside, then run install again.` }; }
  const { next, change } = mergeServersConfig(existing, entry);
  if (change === "present") return { client, label, status: "present", detail: `Already configured in ${file}.` };
  if (opts.dryRun) return { client, label, status: "dry-run", detail: `Would ${change === "added" ? "add" : "update"} career-compass in ${file}.` };
  const backup = writeJsonWithBackup(file, next);
  return {
    client, label, status: change,
    detail: `${change === "added" ? "Added to" : "Updated in"} ${file}${backup ? ` (backup: ${backup})` : ""}.`,
    restart,
  };
}

export function installClaudeDesktop(opts: InstallOptions, platform: NodeJS.Platform, env: NodeJS.ProcessEnv, home: string): ClientResult {
  const file = claudeDesktopConfigPath(platform, env, home);
  return installJsonClient("claude-desktop", "Claude Desktop", file, join(file, ".."), serverEntry(platform, opts.dataPath), opts, "Restart Claude Desktop.");
}

export function installCursor(opts: InstallOptions, platform: NodeJS.Platform, home: string): ClientResult {
  const file = cursorConfigPath(home);
  // Cursor spawns through a shell on every platform, so plain npx is fine there.
  const entry = serverEntry(platform === "win32" ? "linux" : platform, opts.dataPath);
  return installJsonClient("cursor", "Cursor", file, join(home, ".cursor"), entry, opts, "Restart Cursor (or reload its MCP settings).");
}

export function installClaudeCode(opts: InstallOptions, platform: NodeJS.Platform, env: NodeJS.ProcessEnv, exec: (cmd: string, args: string[]) => string): ClientResult {
  const label = "Claude Code";
  const bin = claudeCodeOnPath(platform, env);
  if (!bin) return { client: "claude-code", label, status: "skipped", detail: "Claude Code not found on PATH." };
  let present = false;
  try { exec(bin, ["mcp", "get", "career-compass"]); present = true; } catch { present = false; }
  if (present) return { client: "claude-code", label, status: "present", detail: "Already registered (claude mcp get career-compass)." };
  const args = ["mcp", "add", "career-compass", "-s", "user"];
  if (opts.dataPath) args.push("-e", `CAREER_DATA_PATH=${opts.dataPath}`);
  args.push("--", "npx", "-y", "career-compass-mcp");
  if (opts.dryRun) return { client: "claude-code", label, status: "dry-run", detail: `Would run: claude ${args.join(" ")}` };
  try {
    exec(bin, args);
    return { client: "claude-code", label, status: "added", detail: `Registered for every project: claude ${args.join(" ")}`, restart: "Open a new Claude Code session." };
  } catch (e) {
    return { client: "claude-code", label, status: "failed", detail: `claude mcp add failed: ${(e as Error).message}` };
  }
}

const defaultExec = (cmd: string, args: string[]) => execFileSync(cmd, args, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true });

export function runInstall(opts: InstallOptions = {}): ClientResult[] {
  const platform = opts.platform ?? process.platform;
  const env = opts.env ?? process.env;
  const home = opts.home ?? homedir();
  const exec = opts.exec ?? defaultExec;
  const want = (c: ClientId) => !opts.only || opts.only.includes(c);
  const out: ClientResult[] = [];
  if (want("claude-desktop")) out.push(installClaudeDesktop(opts, platform, env, home));
  if (want("claude-code")) out.push(installClaudeCode(opts, platform, env, exec));
  if (want("cursor")) out.push(installCursor(opts, platform, home));
  return out;
}

const GLYPH: Record<ClientResult["status"], string> = { added: "✅", updated: "✅", present: "✅", skipped: "·", "dry-run": "○", failed: "❌" };

/** The report a person reads. Says what happened, what to restart, and what to say to Claude first. */
export function renderInstallReport(results: ClientResult[], opts: { dryRun?: boolean } = {}): string {
  const lines = [opts.dryRun ? "Career Compass — install (dry run, nothing written)" : "Career Compass — install", ""];
  for (const r of results) lines.push(`${GLYPH[r.status]} ${r.label} — ${r.detail}`);
  const done = results.filter((r) => r.status === "added" || r.status === "updated" || r.status === "present");
  const restarts = [...new Set(results.filter((r) => r.restart && r.status !== "present").map((r) => r.restart!))];
  lines.push("");
  if (done.length === 0) {
    lines.push("No Claude client was found on this machine. Install Claude Desktop, Claude Code, or Cursor and run this again —");
    lines.push("or wire any MCP client by hand: command `npx`, args `-y career-compass-mcp`.");
  } else {
    if (restarts.length) lines.push(restarts.join(" "));
    lines.push("Then say to Claude: \"Run the Career Compass setup check.\"");
    lines.push("First conversation: \"Set up my Career KB. Here's my résumé:\" — and paste it.");
  }
  lines.push("See it with nobody's data: npx -y career-compass-mcp dashboard --sample");
  return lines.join("\n");
}

/** Parse `install` flags from argv (after the subcommand). */
export function parseInstallArgs(args: string[]): Pick<InstallOptions, "dataPath" | "only" | "dryRun"> {
  const opts: Pick<InstallOptions, "dataPath" | "only" | "dryRun"> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--data" && args[i + 1]) { opts.dataPath = args[++i]; }
    else if (a === "--client" && args[i + 1]) {
      const v = args[++i];
      const map: Record<string, ClientId> = { desktop: "claude-desktop", "claude-desktop": "claude-desktop", code: "claude-code", "claude-code": "claude-code", cursor: "cursor" };
      if (!map[v]) throw new Error(`Unknown client "${v}". Use desktop, code, or cursor.`);
      opts.only = [...(opts.only ?? []), map[v]];
    }
  }
  return opts;
}
