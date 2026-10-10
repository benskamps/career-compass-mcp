import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  serverEntry, claudeDesktopConfigPath, mergeServersConfig, runInstall, renderInstallReport, parseInstallArgs, pinnedSpec,
} from "../install.js";
import { PKG_VERSION } from "../version.js";

const SPEC = `career-compass-mcp@${PKG_VERSION}`;

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
    expect(serverEntry("win32")).toEqual({ command: "cmd", args: ["/c", "npx", "-y", SPEC] });
    expect(serverEntry("darwin")).toEqual({ command: "npx", args: ["-y", SPEC] });
    expect(serverEntry("linux", "/d/data")).toMatchObject({ env: { CAREER_DATA_PATH: "/d/data" } });
  });

  it("pins the exact version, so npx never reinstalls over a copy another launch is running", () => {
    // A bare name makes npx ask the registry on every launch and reify into one
    // shared cache folder per release; Claude Desktop's two simultaneous starts
    // collided there and left a half-written folder npx kept running (2026-10 log).
    expect(PKG_VERSION).toMatch(/^\d+\.\d+\.\d+/);
    expect(serverEntry("darwin", undefined, "9.8.7")).toEqual({ command: "npx", args: ["-y", "career-compass-mcp@9.8.7"] });
    expect(pinnedSpec("unknown")).toBe("career-compass-mcp");
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
    const exec = (cmd: string, args: string[]) => { calls.push([cmd, ...args]); if (args[1] === "get") throw new Error("not found"); return ""; };
    const env = { APPDATA: appdata, PATH: binDir };

    const res = runInstall({ platform: "win32", env, home, exec, dataPath: "D:/career" });
    expect(res.map((r) => [r.client, r.status])).toEqual([["claude-desktop", "added"], ["claude-code", "added"], ["cursor", "added"]]);
    const cfg = JSON.parse(readFileSync(path.join(claudeDir, "claude_desktop_config.json"), "utf-8"));
    expect(cfg.mcpServers.other).toEqual({ command: "x" });
    expect(cfg.mcpServers["career-compass"]).toEqual({ command: "cmd", args: ["/c", "npx", "-y", SPEC], env: { CAREER_DATA_PATH: "D:/career" } });
    expect(readdirSync(claudeDir).some((f) => f.startsWith("claude_desktop_config.json.bak-"))).toBe(true);
    expect(calls.find((c) => c[2] === "add")?.slice(1)).toEqual(["mcp", "add", "career-compass", "-s", "user", "-e", "CAREER_DATA_PATH=D:/career", "--", "npx", "-y", SPEC]);
    // One serial warm-up of the pinned version, after the configs are written.
    expect(calls.at(-1)).toEqual(["cmd", "/c", "npx", "-y", SPEC, "--version"]);
    const cursor = JSON.parse(readFileSync(path.join(home, ".cursor", "mcp.json"), "utf-8"));
    expect(cursor.mcpServers["career-compass"].command).toBe("npx");
    const report = renderInstallReport(res);
    expect(report).toContain("Restart Claude Desktop.");
    expect(report).toContain("Run the Career Compass setup check");

    // Second run: everything present, nothing rewritten, no second backup.
    const before = readdirSync(claudeDir).length;
    const again = runInstall({ platform: "win32", env, home, exec: (_c, a) => (a[1] === "get" ? `npx -y ${SPEC}` : ""), dataPath: "D:/career" });
    expect(again.map((r) => r.status)).toEqual(["present", "present", "present"]);
    expect(readdirSync(claudeDir).length).toBe(before);
  });

  it("leaves Claude Code alone when the Career Compass plugin already runs the server", () => {
    // A directory install starts the same server. `claude mcp add` on top of it
    // would list every tool twice.
    const binDir = path.join(home, "bin"); mkdirSync(binDir); writeFileSync(path.join(binDir, "claude.exe"), "");
    const calls: string[][] = [];
    const exec = (_cmd: string, args: string[]) => {
      calls.push(args);
      if (args[0] === "plugin") return JSON.stringify([{ id: "design@synced" }, { id: "career-compass@claude-plugins", enabled: true }]);
      throw new Error("not found");
    };
    const res = runInstall({ platform: "win32", env: { APPDATA: appdata, PATH: binDir }, home, exec, only: ["claude-code"] });
    expect(res.map((r) => r.status)).toEqual(["present"]);
    expect(res[0].detail).toMatch(/plugin/i);
    expect(calls.some((a) => a[0] === "mcp" && a[1] === "add"), "registered a second copy next to the plugin").toBe(false);

    // Negative control: a different plugin whose name merely contains ours is not it.
    const other = (_cmd: string, args: string[]) => {
      if (args[0] === "plugin") return JSON.stringify([{ id: "career-compass-extras@someone" }]);
      if (args[1] === "get") throw new Error("not found");
      return "";
    };
    const res2 = runInstall({ platform: "win32", env: { APPDATA: appdata, PATH: binDir }, home, exec: other, only: ["claude-code"] });
    expect(res2.map((r) => r.status)).toEqual(["added"]);
  });

  it("moves an older unpinned setup onto this version: Desktop entry rewritten, Code re-registered", () => {
    const claudeDir = path.join(appdata, "Claude"); mkdirSync(claudeDir);
    const file = path.join(claudeDir, "claude_desktop_config.json");
    writeFileSync(file, JSON.stringify({ mcpServers: { "career-compass": { command: "cmd", args: ["/c", "npx", "-y", "career-compass-mcp"], env: { CAREER_DATA_PATH: "D:/mine" } } } }), "utf-8");
    const binDir = path.join(home, "bin"); mkdirSync(binDir); writeFileSync(path.join(binDir, "claude.exe"), "");
    const calls: string[][] = [];
    const exec = (_c: string, a: string[]) => { calls.push(a); if (a[0] === "plugin") throw new Error("old cli"); return a[1] === "get" ? "Command: npx\nArgs: -y career-compass-mcp" : ""; };
    const res = runInstall({ platform: "win32", env: { APPDATA: appdata, PATH: binDir }, home, exec, only: ["claude-desktop", "claude-code"] });
    expect(res.map((r) => r.status)).toEqual(["updated", "updated"]);
    expect(JSON.parse(readFileSync(file, "utf-8")).mcpServers["career-compass"]).toEqual({ command: "cmd", args: ["/c", "npx", "-y", SPEC], env: { CAREER_DATA_PATH: "D:/mine" } });
    const removeAt = calls.findIndex((a) => a[1] === "remove");
    const addAt = calls.findIndex((a) => a[1] === "add");
    expect(removeAt).toBeGreaterThan(-1);
    expect(addAt).toBeGreaterThan(removeAt);
  });

  it("a failed warm-up is reported but does not count as a failed install", () => {
    const claudeDir = path.join(appdata, "Claude"); mkdirSync(claudeDir);
    const exec = (c: string) => { if (c === "cmd") throw new Error("ENOTFOUND registry.npmjs.org\nmore"); return ""; };
    const res = runInstall({ platform: "win32", env: winEnv(), home, exec, only: ["claude-desktop"] });
    expect(res.map((r) => [r.client, r.status])).toEqual([["claude-desktop", "added"], ["npx-cache", "failed"]]);
    expect(res[1].detail).toContain("ENOTFOUND registry.npmjs.org");
    expect(res[1].detail).not.toContain("more");
    expect(renderInstallReport(res)).toContain("Restart Claude Desktop.");
  });

  it("dry-run writes nothing and names what it would do", () => {
    const claudeDir = path.join(appdata, "Claude"); mkdirSync(claudeDir);
    const res = runInstall({ platform: "win32", env: winEnv(), home, dryRun: true, exec: () => { throw new Error("no"); }, only: ["claude-desktop"] });
    expect(res).toHaveLength(1);
    expect(res[0].status).toBe("dry-run");
    expect(existsSync(path.join(claudeDir, "claude_desktop_config.json"))).toBe(false);
    const report = renderInstallReport(res, { dryRun: true });
    expect(report).toContain("dry run, nothing written");
    expect(report).not.toContain("No Claude client was found"); // it just listed one it would configure
    expect(report).toContain("Run it without --dry-run");
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
