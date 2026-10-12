import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Registry-metadata truth: server.json and package.json agree.
 *
 * The Official MCP Registry accepts a publish only if the npm package it
 * points at carries an `mcpName` equal to server.json's `name` — that is how
 * it proves we own the package. A mismatch does not fail the npm release; it
 * fails the registry step afterwards, quietly, and the listing goes stale.
 *
 * Versions are deliberately NOT checked here: release.yml stamps
 * package.json's version into server.json right before publishing, so a bump
 * PR only ever touches package.json.
 */

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const read = (f: string) => JSON.parse(readFileSync(path.join(repoRoot, f), "utf-8"));
const pkg = read("package.json") as { name: string; mcpName?: string };
const server = read("server.json") as {
  name: string;
  description: string;
  packages: { registryType: string; identifier: string; transport: { type: string } }[];
};

describe("registry metadata truth", () => {
  it("package.json mcpName matches server.json name", () => {
    expect(pkg.mcpName).toBe(server.name);
  });

  it("uses the io.github.<owner>/ namespace the GitHub login can publish to", () => {
    expect(server.name).toMatch(/^io\.github\.benskamps\//);
  });

  it("points at this npm package over stdio", () => {
    expect(server.packages).toHaveLength(1);
    expect(server.packages[0]).toMatchObject({ registryType: "npm", identifier: pkg.name, transport: { type: "stdio" } });
  });

  it("keeps the description within the registry's 100-character limit", () => {
    expect(server.description.length).toBeLessThanOrEqual(100);
  });
});
