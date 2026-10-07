import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../server.js";

/**
 * Plugin skill frontmatter guard.
 *
 * `allowed-tools` lets a skill's turn run a tool without a permission prompt.
 * That is only acceptable for tools that cannot write: a write tool listed here
 * would turn "the user approves each save" into "nothing asks". So every entry
 * must name one of this server's tools by its plugin-qualified name, and that
 * tool must declare readOnlyHint: true. The hints themselves are proven true by
 * tool-annotations.test.ts.
 *
 * Commands (every skill but the main one) must keep disable-model-invocation, and
 * the main skill must route each command's ask by name, because claude.ai chat
 * has no slash commands.
 */

const SKILLS_DIR = fileURLToPath(new URL("../../plugin/skills", import.meta.url));
const PREFIX = "mcp__plugin_career-compass_career-compass__";

function frontmatter(name: string): Record<string, unknown> {
  const text = readFileSync(path.join(SKILLS_DIR, name, "SKILL.md"), "utf-8");
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  expect(match, `${name}/SKILL.md has no frontmatter`).not.toBeNull();
  return parseYaml(match![1]) as Record<string, unknown>;
}

const skills = readdirSync(SKILLS_DIR).filter((d) => existsSync(path.join(SKILLS_DIR, d, "SKILL.md")));

describe("plugin skill frontmatter", () => {
  it("allowed-tools lists only this server's read-only tools", async () => {
    const server = createServer();
    const client = new Client({ name: "skill-frontmatter-test", version: "0.0.0" });
    const [c, s] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(s), client.connect(c)]);
    try {
      const { tools } = await client.listTools();
      const readOnly = new Set(tools.filter((t) => t.annotations?.readOnlyHint === true).map((t) => t.name));
      let listed = 0;
      for (const name of skills) {
        const allowed = frontmatter(name)["allowed-tools"];
        if (allowed === undefined) continue;
        expect(Array.isArray(allowed), `${name}: allowed-tools should be a list`).toBe(true);
        for (const entry of allowed as string[]) {
          expect(entry.startsWith(PREFIX), `${name}: ${entry} is not a Career Compass tool`).toBe(true);
          expect(readOnly.has(entry.slice(PREFIX.length)), `${name}: ${entry} is not readOnlyHint: true`).toBe(true);
          listed++;
        }
      }
      expect(listed).toBeGreaterThan(0);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("every command skill is user-invoked only, and the main skill routes it in plain words", () => {
    const main = readFileSync(path.join(SKILLS_DIR, "career-compass", "SKILL.md"), "utf-8");
    for (const name of skills.filter((n) => n !== "career-compass")) {
      const fm = frontmatter(name);
      expect(fm.name).toBe(name);
      expect(fm["disable-model-invocation"], `${name} should be disable-model-invocation`).toBe(true);
    }
    for (const name of ["debrief", "week", "sweep", "answer"]) {
      expect(skills).toContain(name);
      expect(main).toContain(`the ${name} method`);
    }
  });
});
