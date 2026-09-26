import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Plugin-bundle guard: the directory listing runs the release package.json says.
 *
 * plugin/ is the Claude directory submission. Its .mcp.json has to pin an exact
 * npm version (the directory blocks unpinned `npx` launchers), and the directory
 * only ships a new plugin version when plugin.json's `version` changes. Both are
 * literals, so a routine `npm version` bump would leave every directory user on
 * the previous release with nothing going red. This test makes the bump loud.
 */

const repoRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../..",
);

const readJson = <T>(rel: string): T =>
  JSON.parse(readFileSync(path.join(repoRoot, rel), "utf-8")) as T;

const pkg = readJson<{ name: string; version: string }>("package.json");

describe("plugin bundle truth", () => {
  it("plugin.json version matches package.json", () => {
    const plugin = readJson<{ version: string }>(
      "plugin/.claude-plugin/plugin.json",
    );
    expect(plugin.version).toBe(pkg.version);
  });

  it(".mcp.json pins npx to exactly this release", () => {
    const mcp = readJson<{
      mcpServers: Record<string, { command: string; args: string[] }>;
    }>("plugin/.mcp.json");
    const server = mcp.mcpServers["career-compass"];
    expect(server.command).toBe("npx");
    expect(server.args).toContain(`${pkg.name}@${pkg.version}`);
  });

  it("README names the same pinned release", () => {
    const readme = readFileSync(
      path.join(repoRoot, "plugin/README.md"),
      "utf-8",
    );
    const pins = readme.match(/career-compass-mcp@[\d.]+/g) ?? [];
    expect(pins.length).toBeGreaterThan(0);
    for (const pin of pins) expect(pin).toBe(`${pkg.name}@${pkg.version}`);
  });
});
