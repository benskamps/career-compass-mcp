import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
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

  // The directory's npx policy hold exists to check exactly which release runs.
  // A bare `npx career-compass-mcp …` in the plugin runs whatever is newest on
  // npm, outside the version a reviewer read.
  it.each(pluginTextFiles())("%s runs no unpinned npx command", (rel) => {
    const text = readFileSync(path.join(repoRoot, rel), "utf-8");
    const bare = text.match(/npx(?:\s+-y)?\s+career-compass-mcp(?!@)/g) ?? [];
    expect(bare, `unpinned npx in ${rel}`).toEqual([]);
    for (const pin of text.match(/career-compass-mcp@[\d.]+/g) ?? []) {
      expect(pin, `stale pin in ${rel}`).toBe(`${pkg.name}@${pkg.version}`);
    }
  });

  it("negative control: the unpinned pattern catches a bare command", () => {
    expect("npx -y career-compass-mcp dashboard".match(/npx(?:\s+-y)?\s+career-compass-mcp(?!@)/g)).not.toBeNull();
  });

  it("data folder comes from a userConfig option that has a default", () => {
    // The directory flags plugins that read settings from the user's
    // environment; a userConfig option is the declared route. Cowork skips an
    // MCP server whose option has no default, so the default is required too.
    const plugin = readJson<{
      userConfig?: Record<string, { type: string; default?: unknown; sensitive?: boolean }>;
    }>("plugin/.claude-plugin/plugin.json");
    const opt = plugin.userConfig?.data_path;
    expect(opt?.type).toBe("directory");
    expect(typeof opt?.default).toBe("string");
    expect(opt?.sensitive ?? false).toBe(false);
    const mcp = readJson<{
      mcpServers: Record<string, { env?: Record<string, string> }>;
    }>("plugin/.mcp.json");
    expect(mcp.mcpServers["career-compass"].env).toEqual({
      CAREER_DATA_PATH: "${user_config.data_path}",
    });
  });

  it("plugin README does not name the environment variable", () => {
    const readme = readFileSync(path.join(repoRoot, "plugin/README.md"), "utf-8");
    expect(readme).not.toMatch(/CAREER_DATA_PATH|environment variable/);
  });
});

function pluginTextFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(path.join(repoRoot, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (/\.(md|json)$/.test(e.name)) out.push(rel);
    }
  };
  walk("plugin");
  return out;
}
