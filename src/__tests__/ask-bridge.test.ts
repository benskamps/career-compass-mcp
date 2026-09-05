import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { fileURLToPath } from "node:url";
import {
  parseStreamLine, buildClaudeArgs, resolveClaudeCommand, isAllowedOrigin, writeMcpConfig,
  CLAUDE_BIN_ENV, MAX_PROMPT_CHARS,
} from "../dashboard-lite/ask-bridge.js";
import { startLiteDashboard } from "../dashboard-lite/server.js";
import { renderLiteDashboard } from "../dashboard-lite/render.js";
import type { Pipeline } from "../schemas/career-schema.js";

/**
 * The Ask bridge — the dashboard click that reaches Claude (2.8.0).
 *
 * Nothing here spends a token: `fixtures/fake-claude.mjs` stands in for the
 * CLI and emits the same stream-json shapes the real one does. What IS pinned:
 * the request gate (method, origin, token, size, single-flight), the argv we
 * hand Claude Code (strict MCP config, no user settings, no shell/file tools),
 * the event parsing, and that the page only offers "Ask" when the bridge is on.
 */

const FAKE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "fake-claude.mjs");
const EMPTY: Pipeline = { applications: [], lastUpdated: new Date().toISOString() } as Pipeline;

describe("parseStreamLine", () => {
  it("lifts assistant text, tool names, and the result", () => {
    expect(parseStreamLine('{"type":"assistant","message":{"content":[{"type":"text","text":"pong"}]}}')).toEqual({ type: "text", text: "pong" });
    expect(parseStreamLine('{"type":"assistant","message":{"content":[{"type":"tool_use","name":"mcp__career-compass__pipeline_view","input":{}}]}}')).toEqual({ type: "tool", name: "pipeline_view" });
    expect(parseStreamLine('{"type":"result","subtype":"success","is_error":false,"result":"final","total_cost_usd":1.5}')).toEqual({ type: "done", text: "final", isError: false, costUsd: 1.5 });
    expect(parseStreamLine('{"type":"result","subtype":"error","is_error":true}')).toMatchObject({ type: "done", isError: true });
  });
  it("ignores noise: hooks, user echoes, blank and broken lines", () => {
    expect(parseStreamLine('{"type":"system","subtype":"hook_started"}')).toBeNull();
    expect(parseStreamLine('{"type":"user","message":{}}')).toBeNull();
    expect(parseStreamLine("")).toBeNull();
    expect(parseStreamLine("not json {")).toBeNull();
  });
});

describe("buildClaudeArgs", () => {
  it("locks Claude Code down to this package's tools and no user settings", () => {
    const a = buildClaudeArgs("hello", "C:/x/mcp.json");
    const kv = (k: string) => a[a.indexOf(k) + 1];
    expect(a.slice(0, 2)).toEqual(["-p", "hello"]);
    expect(kv("--output-format")).toBe("stream-json");
    expect(a).toContain("--verbose");
    expect(a).toContain("--strict-mcp-config");
    expect(kv("--mcp-config")).toBe("C:/x/mcp.json");
    expect(kv("--setting-sources")).toBe("project");
    expect(a).toContain("--no-session-persistence");
    expect(kv("--allowedTools")).toBe("mcp__career-compass");
    expect(kv("--disallowedTools")).toMatch(/\bBash\b/);
    expect(kv("--disallowedTools")).toMatch(/\bWrite\b/);
    expect(a).not.toContain("--dangerously-skip-permissions");
  });
});

describe("resolveClaudeCommand", () => {
  it("honours the env override and runs .mjs through node", () => {
    const cmd = resolveClaudeCommand({ [CLAUDE_BIN_ENV]: FAKE, PATH: "" });
    expect(cmd).toEqual({ command: process.execPath, args: [FAKE] });
  });
  it("returns null when nothing is on the PATH", () => {
    expect(resolveClaudeCommand({ PATH: "" })).toBeNull();
  });
});

describe("isAllowedOrigin", () => {
  it("accepts loopback origins only", () => {
    expect(isAllowedOrigin("http://127.0.0.1:3141")).toBe(true);
    expect(isAllowedOrigin("http://localhost:3141")).toBe(true);
    expect(isAllowedOrigin("http://[::1]:3141")).toBe(true);
    expect(isAllowedOrigin("http://evil.example")).toBe(false);
    expect(isAllowedOrigin("http://127.0.0.1.evil.example")).toBe(false);
    expect(isAllowedOrigin(undefined)).toBe(false);
    expect(isAllowedOrigin("null")).toBe(false);
  });
});

describe("writeMcpConfig", () => {
  it("wires exactly one server — this package — with the data dir", () => {
    const f = writeMcpConfig("D:/data", "C:/pkg/build/bin/cli.js");
    const cfg = JSON.parse(readFileSync(f, "utf-8"));
    expect(Object.keys(cfg.mcpServers)).toEqual(["career-compass"]);
    expect(cfg.mcpServers["career-compass"].args).toEqual(["C:/pkg/build/bin/cli.js"]);
    expect(cfg.mcpServers["career-compass"].env.CAREER_DATA_PATH).toBe("D:/data");
    rmSync(path.dirname(f), { recursive: true, force: true });
  });
});

describe("the page", () => {
  it("offers Ask only when the bridge is on, and never runs a paste-slot prompt", () => {
    const off = renderLiteDashboard(EMPTY, "D:/x");
    expect(off).not.toContain('id="ask-panel"');
    expect(off).toContain("const ASK=null");
    expect(off).toContain("Copy: track a job posting");
    const on = renderLiteDashboard(EMPTY, "D:/x", new Date(), true, { token: "tok123" });
    expect(on).toContain('id="ask-panel"');
    expect(on).toContain('"token":"tok123"');
    expect(on).toContain('class="ask-on"');
    expect(on).toContain("Ask Claude: track a job posting");
    expect(on).toContain('data-needs-paste="1"');
  });
});

describe("POST /ask end to end (fake claude)", () => {
  let server: Server; let port: number; let dataDir: string; let originalEnv: string | undefined; let originalData: string | undefined;
  const origin = () => `http://127.0.0.1:${port}`;

  beforeEach(async () => {
    originalEnv = process.env[CLAUDE_BIN_ENV]; originalData = process.env.CAREER_DATA_PATH;
    dataDir = mkdtempSync(path.join(tmpdir(), "cc-ask-"));
    process.env.CAREER_DATA_PATH = dataDir;
    process.env[CLAUDE_BIN_ENV] = FAKE;
    server = await startLiteDashboard(0, "127.0.0.1", { ask: { cmd: { command: process.execPath, args: [FAKE] }, timeoutMs: 3000 } });
    port = (server.address() as { port: number }).port;
  });
  afterEach(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    if (originalEnv === undefined) delete process.env[CLAUDE_BIN_ENV]; else process.env[CLAUDE_BIN_ENV] = originalEnv;
    if (originalData === undefined) delete process.env.CAREER_DATA_PATH; else process.env.CAREER_DATA_PATH = originalData;
    delete process.env.FAKE_CLAUDE_MODE;
    rmSync(dataDir, { recursive: true, force: true });
  });

  async function tokenFromPage(): Promise<string> {
    const html = await (await fetch(`${origin()}/`)).text();
    const m = /"token":"([a-f0-9]+)"/.exec(html);
    if (!m) throw new Error("no token in page");
    return m[1];
  }
  const post = (body: unknown, headers: Record<string, string>) =>
    fetch(`${origin()}/ask`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

  it("the page carries a token and the bridge answers a click with a streamed transcript", async () => {
    const token = await tokenFromPage();
    const r = await post({ prompt: "What should I do today?" }, { origin: origin(), "x-cc-ask-token": token });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/event-stream");
    const body = await r.text();
    const events = body.split("\n\n").filter((f) => f.startsWith("data: ")).map((f) => JSON.parse(f.slice(6)));
    expect(events.map((e) => e.type)).toEqual(["tool", "text", "done"]);
    expect(events[0].name).toBe("pipeline_view");
    expect(events[1].text).toContain("You asked: What should I do today?");
    expect(events[2]).toMatchObject({ isError: false, costUsd: 0.0123 });
  });

  it("refuses the wrong method, a foreign origin, a stale token, an oversized or empty prompt", async () => {
    const token = await tokenFromPage();
    expect((await fetch(`${origin()}/ask`, { headers: { origin: origin() } })).status).toBe(405);
    expect((await post({ prompt: "x" }, { origin: "http://evil.example", "x-cc-ask-token": token })).status).toBe(403);
    expect((await post({ prompt: "x" }, { "x-cc-ask-token": token })).status).toBe(403); // no Origin at all
    expect((await post({ prompt: "x" }, { origin: origin(), "x-cc-ask-token": "nope" })).status).toBe(403);
    expect((await post({ prompt: "x".repeat(MAX_PROMPT_CHARS + 1) }, { origin: origin(), "x-cc-ask-token": token })).status).toBe(413);
    expect((await post({ prompt: "   " }, { origin: origin(), "x-cc-ask-token": token })).status).toBe(400);
    expect((await post("not json", { origin: origin(), "x-cc-ask-token": token })).status).toBe(400);
  });

  it("is single-flight: a second ask while one runs gets 409", async () => {
    process.env.FAKE_CLAUDE_MODE = "hang";
    const token = await tokenFromPage();
    const first = post({ prompt: "slow" }, { origin: origin(), "x-cc-ask-token": token });
    await new Promise((r) => setTimeout(r, 400));
    const second = await post({ prompt: "again" }, { origin: origin(), "x-cc-ask-token": token });
    expect(second.status).toBe(409);
    const r1 = await first; // the hang is cut by the 3 s timeout
    const events = (await r1.text()).split("\n\n").filter((f) => f.startsWith("data: ")).map((f) => JSON.parse(f.slice(6)));
    expect(events.at(-1).type).toBe("error");
  });

  it("surfaces a Claude-side error as done+isError, and a silent exit as an error event", async () => {
    const token = await tokenFromPage();
    process.env.FAKE_CLAUDE_MODE = "error";
    let events = (await (await post({ prompt: "x" }, { origin: origin(), "x-cc-ask-token": token })).text()).split("\n\n").filter((f) => f.startsWith("data: ")).map((f) => JSON.parse(f.slice(6)));
    expect(events.at(-1)).toMatchObject({ type: "done", isError: true, text: "boom" });
    process.env.FAKE_CLAUDE_MODE = "silent";
    events = (await (await post({ prompt: "x" }, { origin: origin(), "x-cc-ask-token": token })).text()).split("\n\n").filter((f) => f.startsWith("data: ")).map((f) => JSON.parse(f.slice(6)));
    expect(events.at(-1)).toMatchObject({ type: "error" });
    expect(events.at(-1).message).toContain("without a result");
  });

  it("without the option, /ask does not exist and the page has no panel", async () => {
    const plain = await startLiteDashboard(0, "127.0.0.1");
    const p = (plain.address() as { port: number }).port;
    try {
      expect((await fetch(`http://127.0.0.1:${p}/ask`, { method: "POST", headers: { origin: `http://127.0.0.1:${p}` } })).status).toBe(404);
      expect(await (await fetch(`http://127.0.0.1:${p}/`)).text()).not.toContain('id="ask-panel"');
    } finally { await new Promise<void>((r) => plain.close(() => r())); }
  });
});

// Keep the fixture honest: it must parse as the real CLI's shapes do.
describe("fixture sanity", () => {
  it("fake-claude's lines all parse through parseStreamLine", () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "cc-fx-"));
    writeFileSync(path.join(tmp, "x"), "");
    rmSync(tmp, { recursive: true, force: true });
    expect(parseStreamLine(JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "hi" }] } }))).toEqual({ type: "text", text: "hi" });
  });
});
