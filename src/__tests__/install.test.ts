import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  serverEntry, claudeDesktopConfigPath, mergeServersConfig, runInstall, renderInstallReport, parseInstallArgs,
} from "../install.js";

/**
 * `career-compass-mcp install` — said and done, pinned.
 * Every test runs against a fake home + APPDATA in a temp dir and a fake
 * `claude` executable via the injectable exec, so nothing touches the real
 * machine's clients.
 */

let home: string; let appdata: string;
beforeEach(() => { home = mkdtempSync(path.join(tmpdir(), "cc-inst-home-")); appdata = path.join(home, "AppData", "Roaming"); mkdirSync(appdata, { recursive: true }); });
afterEach(() => rmSync(home, { recursive: true, force: true }));

const winEnv = () => ({ APPDATA: appdata, PATH: "" });

describe("serverEntry", () => {
  it("goes through cmd on Windows and plain npx elsewhere; env only when a data path is given", () => {
    expect(serverEntry("win32")).toEqual({ command: "cmd", args: ["/c", "npx", "-y", "career-compass-mcp"] });
    expect(serverEntry("darwin")).toEqual({ command: "npx", args: ["-y", "career-compass-mcp"] });
    expect(serverEntry("linux", "/d/data")).toMatchObject({ env: { CAREER_DATA_PATH: "/d/data" } });
  });
});

describe("claudeDesktopConfigPath", () => {
  it("resolves per OS", () => {
    expect(claudeDesktopConfigPath("win32", { APPDATA: "C:\\A" }, "C:\\H")).toBe(path.join("C:\\A", "Claude", "claude_desktop_config.json"));
    expect(claudeDesktopConfigPath("darwin", {}, "/Users/x")).toBe(path.join("/Users/x", "Library", "Application Support", "Claude", "claude_desktop_config.json"));
    expect(claudeDesktopConfigPath("linux", {}, "/home/x")).toBe(path.join("/home/x", ".config", "Claude", "claude_desktop_config.json"));
    expect(claudeDesktopConfigPath("linux", { XDG_CONFIG_HOME: "/xdg" }, "/home/x")).toBe(path.join("/xdg", "Claude", "claude_desktop_config.json"));
  });
});

describe("mergeServersConfig", () => {
  const entry = serverEntry("darwin");
  it("adds to an empty or missing config without touching other servers", () => {
    const { next, change } = mergeServersConfig({ mcpServers: { other: { command: "x" } }, theme: "dark" }, entry);
    expect(change).toBe("added");
    expect(next).toEqual({ theme: "dark", mcpServers: { other: { command: "x" }, "career-compass": entry } });
    expect(mergeServersConfig(null, entry).change).toBe("added");
  });
  it("is idempotent, and keeps a user's chosen data folder when we did not supply one", () => {
    const withEnv = { ...entry, env: { CAREER_DATA_PATH: "/my/data" } };
    expect(mergeServersConfig({ mcpServers: { "career-compass": withEnv } }, entry)).toMatchObject({ change: "present" });
    expect(mergeServersConfig({ mcpServers: { "career-compass": entry } }, entry).change).toBe("present");
    const r = mergeServersConfig({ mcpServers: { "career-compass": { command: "old", args: [], env: { CAREER_DATA_PATH: "/my/data" } } } }, entry);
    expect(r.change).toBe("updated");
    expect((r.next.mcpServers as Record<string, unknown>)["career-compass"]).toEqual(withEnv);
  });
});

describe("runInstall (fake machine)", () => {
  it("skips clients that are not installed and says so", () => {
    const res = runInstall({ platform: "win32", env: winEnv(), home, exec: () => { throw new Error("no"); } });
    expect(res.map((r) => r.status)).toEqual(["skipped", "skipped", "skipped"]);
    const report = renderInstallReport(res);
    expect(report).toContain("No Claude client was found");
    expect(report).toContain("dashboard --sample");
  });

  it("writes Claude Desktop's config with a backup, registers Claude Code once, writes Cursor", () => {
    const claudeDir = path.join(appdata, "Claude"); mkdirSync(claudeDir);
    writeFileSync(path.join(claudeDir, "claude_desktop_config.json"), JSON.stringify({ mcpServers: { other: { command: "x" } } }), "utf-8");
    mkdirSync(path.join(home, ".cursor"));
    const binDir = path.join(home, "bin"); mkdirSync(binDir); writeFileSync(path.join(binDir, "claude.exe"), "");
    const calls: string[][] = [];
    const exec = (_cmd: string, args: string[]) => { calls.push(args); if (args[1] === "get") throw new Error("not found"); return ""; };
    const env = { APPDATA: appdata, PATH: binDir };

    const res = runInstall({ platform: "win32", env, home, exec, dataPath: "D:/career" });
    expect(res.map((r) => [r.client, r.status])).toEqual([["claude-desktop", "added"], ["claude-code", "added"], ["cursor", "added"]]);
    const cfg = JSON.parse(readFileSync(path.join(claudeDir, "claude_desktop_config.json"), "utf-8"));
    expect(cfg.mcpServers.other).toEqual({ command: "x" });
    expect(cfg.mcpServers["career-compass"]).toEqual({ command: "cmd", args: ["/c", "npx", "-y", "career-compass-mcp"], env: { CAREER_DATA_PATH: "D:/career" } });
    expect(readdirSync(claudeDir).some((f) => f.startsWith("claude_desktop_config.json.bak-"))).toBe(true);
    expect(calls.at(-1)).toEqual(["mcp", "add", "career-compass", "-s", "user", "-e", "CAREER_DATA_PATH=D:/career", "--", "npx", "-y", "career-compass-mcp"]);
    const cursor = JSON.parse(readFileSync(path.join(home, ".cursor", "mcp.json"), "utf-8"));
    expect(cursor.mcpServers["career-compass"].command).toBe("npx");
    const report = renderInstallReport(res);
    expect(report).toContain("Restart Claude Desktop.");
    expect(report).toContain("Run the Career Compass setup check");

    // Second run: everything present, nothing rewritten, no second backup.
    const before = readdirSync(claudeDir).length;
    const again = runInstall({ platform: "win32", env, home, exec: (_c, a) => (a[1] === "get" ? "ok" : ""), dataPath: "D:/career" });
    expect(again.map((r) => r.status)).toEqual(["present", "present", "present"]);
    expect(readdirSync(claudeDir).length).toBe(before);
  });

  it("dry-run writes nothing and names what it would do", () => {
    const claudeDir = path.join(appdata, "Claude"); mkdirSync(claudeDir);
    const res = runInstall({ platform: "win32", env: winEnv(), home, dryRun: true, exec: () => { throw new Error("no"); }, only: ["claude-desktop"] });
    expect(res).toHaveLength(1);
    expect(res[0].status).toBe("dry-run");
    expect(existsSync(path.join(claudeDir, "claude_desktop_config.json"))).toBe(false);
    expect(renderInstallReport(res, { dryRun: true })).toContain("dry run, nothing written");
  });

  it("refuses to clobber a config it cannot parse", () => {
    const claudeDir = path.join(appdata, "Claude"); mkdirSync(claudeDir);
    writeFileSync(path.join(claudeDir, "claude_desktop_config.json"), "{ not json", "utf-8");
    const res = runInstall({ platform: "win32", env: winEnv(), home, only: ["claude-desktop"] });
    expect(res[0].status).toBe("failed");
    expect(res[0].detail).toContain("could not be parsed");
    expect(readFileSync(path.join(claudeDir, "claude_desktop_config.json"), "utf-8")).toBe("{ not json");
  });
});

describe("parseInstallArgs", () => {
  it("reads --dry-run, --data, --client (with aliases) and rejects unknown clients", () => {
    expect(parseInstallArgs(["--dry-run", "--data", "/x", "--client", "desktop", "--client", "code"])).toEqual({ dryRun: true, dataPath: "/x", only: ["claude-desktop", "claude-code"] });
    expect(() => parseInstallArgs(["--client", "emacs"])).toThrow(/Unknown client/);
  });
});
