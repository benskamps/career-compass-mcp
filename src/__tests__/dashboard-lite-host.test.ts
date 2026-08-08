import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { request } from "node:http";
import type { Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLiteDashboardServer, isAllowedHost } from "../dashboard-lite/server.js";

/**
 * Guard: the lite dashboard only answers to loopback Host headers.
 *
 * Binding 127.0.0.1 keeps the network out but not the browser. A page on any
 * site can resolve a name it owns to 127.0.0.1 and then talk to this server
 * same-origin (DNS rebinding); the only thing separating that request from a
 * real one is the `Host` header. Without this check, a user's whole pipeline —
 * companies, salaries, contacts, interview notes — is readable by any site they
 * happen to have open while the dashboard is running.
 */

let server: Server;
let port: number;
let dataDir: string;
let originalDataPath: string | undefined;

function get(host: string | null): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port,
        path: "/",
        // setHost:false stops Node from adding its own Host header, which is
        // what lets this test send the attacker's name (and send none at all).
        setHost: false,
        headers: host === null ? {} : { host },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf-8");
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

beforeAll(async () => {
  originalDataPath = process.env.CAREER_DATA_PATH;
  dataDir = await mkdtemp(join(tmpdir(), "cc-host-"));
  process.env.CAREER_DATA_PATH = dataDir;
  server = createLiteDashboardServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  port = typeof addr === "object" && addr ? addr.port : 0;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (originalDataPath === undefined) delete process.env.CAREER_DATA_PATH;
  else process.env.CAREER_DATA_PATH = originalDataPath;
  await rm(dataDir, { recursive: true, force: true });
});

describe("lite dashboard Host allowlist", () => {
  it("serves a normal loopback request", async () => {
    const res = await get(`127.0.0.1:${port}`);
    expect(res.status).toBe(200);
    expect(res.body).toContain("Career Compass");
  });

  it("serves localhost and the IPv6 loopback literal", async () => {
    expect((await get(`localhost:${port}`)).status).toBe(200);
    expect((await get(`[::1]:${port}`)).status).toBe(200);
  });

  it("refuses a rebound hostname with 403 and renders nothing", async () => {
    const res = await get("evil.example");
    expect(res.status).toBe(403);
    // The refusal must not leak the pipeline it was protecting.
    expect(res.body).not.toContain("<!doctype html>");
    expect(res.body).toContain("evil.example");
  });

  it("refuses a rebound hostname that carries our port", async () => {
    expect((await get(`evil.example:${port}`)).status).toBe(403);
  });

  it("refuses a request with no Host header at all", async () => {
    // Node's own parser answers 400 before the handler runs — HTTP/1.1 requires
    // Host. The claim under test is that such a request never reaches the
    // renderer, not which of the two refusals it gets.
    const res = await get(null);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body).not.toContain("<!doctype html>");
  });

  it("classifies host values without a server", () => {
    // Unit-level, so the allowlist stays honest even if the transport changes.
    expect(isAllowedHost("localhost")).toBe(true);
    expect(isAllowedHost("LOCALHOST:3141")).toBe(true);
    expect(isAllowedHost("127.0.0.1:3141")).toBe(true);
    expect(isAllowedHost("[::1]:3141")).toBe(true);
    expect(isAllowedHost("::1")).toBe(true);
    expect(isAllowedHost(undefined)).toBe(false);
    expect(isAllowedHost("")).toBe(false);
    expect(isAllowedHost("attacker.test")).toBe(false);
    // Names that merely *contain* a loopback name are not loopback.
    expect(isAllowedHost("localhost.attacker.test")).toBe(false);
    expect(isAllowedHost("127.0.0.1.attacker.test")).toBe(false);
    // A non-loopback address that would reach us on a multi-homed host.
    expect(isAllowedHost("192.168.1.20:3141")).toBe(false);
  });

  it("refuses a loopback name with something other than a port after it", () => {
    // The first parse split on ":" and kept the left half without ever looking
    // at the right half, so anything could ride along behind a colon and still
    // read as "localhost". No browser can put these bytes on the wire — Host is
    // built from the URL authority — so this was never a live rebinding hole.
    // It was still a parser answering a question it had not been asked: only
    // `:<digits>` is a port, and everything else is a malformed header.
    for (const hostile of [
      "localhost:evil.com",
      "localhost:80@evil.com",
      "localhost:3141x",
      "127.0.0.1:evil.com",
      "127.0.0.1:80:evil.com",
      "[::1]evil.com",
      "[::1]:3141/../evil",
      "::1:evil.com",
      "localhost:",
      "localhost evil.com",
    ]) {
      expect(isAllowedHost(hostile), `${hostile} must not pass as loopback`).toBe(false);
    }
  });

  it("still accepts the well-formed shapes around them", () => {
    // Strictness must not cost the real ones.
    for (const good of ["localhost", "localhost:3141", "127.0.0.1:80", "[::1]", "[::1]:65535", "::1"]) {
      expect(isAllowedHost(good), `${good} must pass as loopback`).toBe(true);
    }
  });

  it("403s a loopback name carrying a foreign authority, over the wire", async () => {
    for (const hostile of ["localhost:evil.com", "localhost:80@evil.com", "[::1]evil.com"]) {
      const res = await get(hostile);
      expect(res.status, `${hostile} was served`).toBe(403);
      expect(res.body).not.toContain("<!doctype html>");
    }
  });
});
