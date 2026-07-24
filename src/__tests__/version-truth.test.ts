import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PKG_VERSION } from "../version.js";
import { createServer } from "../server.js";

/**
 * Version-truth guard: one version, everywhere.
 *
 * An MCP server introduces itself in the `initialize` handshake, and that
 * `serverInfo.version` is the only version a client ever sees — there is no
 * second channel to cross-check it against. If it is a string literal, a
 * routine `npm version` bump leaves the server telling every client it is the
 * previous release, indefinitely, with nothing going red.
 *
 * This repo had three copies of "2.0.0": package.json, the literal in
 * src/server.ts, and an assertion literal in server-e2e.test.ts. Two of the
 * three had to be remembered by hand on every release, and the third made the
 * test suite go red *because of a correct bump* — training the reflex to
 * "just update the literal," which is precisely the habit that lets the server
 * literal drift next time.
 *
 * The fix is structural (src/version.ts resolves package.json at runtime), so
 * what this test locks is the invariant rather than any particular number:
 * whatever package.json says is what the handshake says. It will keep passing
 * across every future release without edits — and go red the moment someone
 * reintroduces a literal.
 */

const repoRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../..",
);

const pkgVersion = (
  JSON.parse(
    readFileSync(path.join(repoRoot, "package.json"), "utf-8"),
  ) as { version: string }
).version;

describe("version truth: package.json is the only source", () => {
  it("resolves the real version, not 'unknown'", () => {
    expect(PKG_VERSION).not.toBe("unknown");
    expect(PKG_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("matches package.json exactly", () => {
    expect(PKG_VERSION).toBe(pkgVersion);
  });

  it("is what the MCP server reports in the initialize handshake", () => {
    // Reach the same object the SDK sends as serverInfo, without needing a
    // full client round-trip — that path is covered by server-e2e.
    const server = createServer();
    const info = (
      server.server as unknown as {
        _serverInfo: { name: string; version: string };
      }
    )._serverInfo;

    expect(info.name).toBe("career-compass");
    expect(info.version).toBe(pkgVersion);
  });

  it("has no hardcoded version literal left in src/ or bin/", () => {
    // Cheap structural lock: the only place a semver literal belongs is
    // package.json. Doc comments and test *fixtures* are fine; executable
    // `version: "x.y.z"` assignments are not.
    const files = [
      "src/server.ts",
      "src/version.ts",
      "bin/cli.ts",
    ];
    const offenders: string[] = [];
    for (const rel of files) {
      const src = readFileSync(path.join(repoRoot, rel), "utf-8");
      for (const [i, line] of src.split("\n").entries()) {
        if (line.trimStart().startsWith("*")) continue; // doc comment
        if (/\bversion:\s*["'`]\d+\.\d+\.\d+/.test(line)) {
          offenders.push(`${rel}:${i + 1} ${line.trim()}`);
        }
      }
    }
    expect(
      offenders,
      `hardcoded version literal(s):\n  ${offenders.join("\n  ")}\n` +
        `Use PKG_VERSION from src/version.ts so a bump cannot drift.`,
    ).toEqual([]);
  });
});
