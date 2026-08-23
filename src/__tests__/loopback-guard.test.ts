import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { isAllowedHost, hostnameOf, LOOPBACK, ALLOWED_HOSTNAMES } from "../loopback-guard.js";

/**
 * Gate 0's negative control.
 *
 * The audit's two P0s were not that the guard was wrong — it was correct, and
 * well argued, inside `dashboard-lite`. They were that the *other* dashboard,
 * the one `bin/cli.ts` prefers whenever it has been built and the only one that
 * can write, had no guard at all. So this file asserts two different things:
 *
 *   1. the guard itself refuses what it must (the classic unit tests), and
 *   2. **every surface that can serve the Career KB actually applies it** —
 *      which is the part that was missing and the part that can silently
 *      regress the moment someone adds a third viewer.
 */

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

describe("loopback guard — what it refuses", () => {
  it("accepts the four loopback names, with or without a port", () => {
    for (const h of ["localhost", "127.0.0.1", "[::1]", "::1"]) {
      expect(isAllowedHost(h), h).toBe(true);
    }
    expect(isAllowedHost("localhost:3141")).toBe(true);
    expect(isAllowedHost("127.0.0.1:3141")).toBe(true);
    expect(isAllowedHost("[::1]:3141")).toBe(true);
  });

  it("refuses a rebound attacker hostname", () => {
    // The actual attack: a name the attacker owns, resolving to 127.0.0.1.
    for (const h of [
      "evil.example",
      "evil.example:3141",
      "career-compass.evil.example",
      "localhost.evil.example", // the near-miss a prefix check would pass
    ]) {
      expect(isAllowedHost(h), h).toBe(false);
    }
  });

  it("refuses a malformed Host rather than parsing out something loopback-ish", () => {
    for (const h of ["localhost:evil.com", "[::1]evil.com", "127.0.0.1 evil", "localhost:", ":3141"]) {
      expect(isAllowedHost(h), h).toBe(false);
    }
  });

  it("refuses a missing Host", () => {
    expect(isAllowedHost(undefined)).toBe(false);
    expect(isAllowedHost(null)).toBe(false);
    expect(isAllowedHost("")).toBe(false);
    expect(isAllowedHost("   ")).toBe(false);
  });

  it("is case-insensitive, because Host is", () => {
    expect(isAllowedHost("LOCALHOST")).toBe(true);
    expect(isAllowedHost("LocalHost:3141")).toBe(true);
  });

  it("does not treat a bind wildcard as a name it answers to", () => {
    expect(ALLOWED_HOSTNAMES.has("0.0.0.0")).toBe(false);
    expect(isAllowedHost("0.0.0.0:3141")).toBe(false);
  });

  it("hostnameOf strips only a numeric port", () => {
    expect(hostnameOf("localhost:3141")).toBe("localhost");
    expect(hostnameOf("[::1]:3141")).toBe("[::1]");
    expect(hostnameOf("::1")).toBe("::1");
    expect(hostnameOf("localhost:notaport")).toBeNull();
  });
});

describe("loopback guard — every serving surface applies it", () => {
  const read = (f: string) => readFileSync(path.join(repoRoot, f), "utf-8");

  it("dashboard-lite refuses before it parses a path", () => {
    const src = read("src/dashboard-lite/server.ts");
    expect(src).toContain("isAllowedHost");
    // Order matters: a refused origin must not learn which paths exist.
    expect(src.indexOf("isAllowedHost")).toBeLessThan(src.indexOf("req.url"));
  });

  it("the Next dashboard has a proxy that applies the shared guard", () => {
    const mw = path.join(repoRoot, "dashboard/proxy.ts");
    expect(
      existsSync(mw),
      "dashboard/proxy.ts is missing — the Next dashboard renders the whole " +
        "Career KB and holds the only write path outside the MCP server. It must " +
        "not answer a request whose Host it has not checked.",
    ).toBe(true);
    const src = readFileSync(mw, "utf-8");
    expect(src).toContain("isAllowedHost");
    expect(src).toContain("@shared/loopback-guard");
    expect(src).toContain("403");
  });

  it("the Next proxy matches every path, with no carve-outs", () => {
    const src = readFileSync(path.join(repoRoot, "dashboard/proxy.ts"), "utf-8");
    // Assert against the `config` export only. The file's prose explains why the
    // usual _next/static exclusions are absent, and a whole-file grep would read
    // that explanation as the thing it warns about.
    const config = /export const config\s*=\s*{[\s\S]*?};/.exec(src)?.[0] ?? "";
    expect(config, "no `export const config` found in the proxy").not.toBe("");
    expect(config).toMatch(/matcher:\s*["'`]\/:path\*/);
    // The usual Next matcher excludes _next/static, _next/image and favicon.
    // Those exclusions are the shape of a hole; assert none of them came back.
    expect(config).not.toContain("_next");
    expect(config).not.toContain("(?!");
  });

  it("both surfaces bind the loopback literal, never the name", () => {
    expect(LOOPBACK).toBe("127.0.0.1");
    const cli = read("bin/cli.ts");
    // The Next standalone child is handed the literal via the shared constant.
    expect(cli).toContain("HOSTNAME: LOOPBACK");
    expect(cli).not.toContain('HOSTNAME: "localhost"');
  });

  it("the guard is defined once", () => {
    // A second copy is how the two surfaces drifted apart in the first place.
    const lite = read("src/dashboard-lite/server.ts");
    expect(lite).toContain("../loopback-guard.js");
    expect(lite).not.toMatch(/const ALLOWED_HOSTNAMES\s*[:=]/);
    expect(lite).not.toMatch(/function hostnameOf/);
  });
});
