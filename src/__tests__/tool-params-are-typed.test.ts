import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../server.js";

/**
 * Repo-wide guard for the bug class behind #34.
 *
 * `save_career_section`'s `data` was `z.unknown()`. Zod emits `{}` for that — a
 * required property carrying no `type` at all. A client with no type to hold
 * onto sends the value as a JSON string, the server's schema rejects the string,
 * and the tool refuses every call it ever receives. That shipped in v2.4.0 and
 * meant nobody could populate the Career KB.
 *
 * The per-tool regression test covers that one parameter. This covers the class:
 * no tool, present or future, may advertise a parameter with no type at all.
 * `z.unknown()` and `z.any()` both trip it.
 *
 * Deliberately a property of the ADVERTISED schema, not of a round trip. Every
 * round-trip test in this repo drives the server over InMemoryTransport with
 * native JS objects, which proves the server handles structured data and never
 * that a client sends it — the gap #34 lived in for an entire release.
 */

/** A schema says something about its type if it has any of these. */
const TYPE_KEYS = ["type", "anyOf", "oneOf", "allOf", "enum", "const", "$ref"];

function isUntyped(schema: unknown): boolean {
  if (schema === null || typeof schema !== "object") return true;
  const s = schema as Record<string, unknown>;
  return !TYPE_KEYS.some((k) => k in s);
}

describe("every tool parameter is advertised with a type", () => {
  it("no parameter is an untyped schema", async () => {
    const server = createServer();
    const client = new Client({ name: "param-type-guard", version: "0.0.0" });
    const [c, s] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(s), client.connect(c)]);

    const { tools } = await client.listTools();
    expect(tools.length, "no tools registered — the guard would pass vacuously").toBeGreaterThan(0);

    const offenders: string[] = [];
    let checked = 0;

    for (const tool of tools) {
      const props =
        ((tool.inputSchema as { properties?: Record<string, unknown> })?.properties) ?? {};
      for (const [param, schema] of Object.entries(props)) {
        checked++;
        if (isUntyped(schema)) offenders.push(`${tool.name}.${param}`);
      }
    }

    expect(checked, "no parameters inspected — the guard would pass vacuously").toBeGreaterThan(0);
    expect(
      offenders,
      `these parameters are advertised with no type, so clients will send them as ` +
        `JSON strings and the server will refuse every call (this is bug #34): ${offenders.join(", ")}`,
    ).toEqual([]);

    await client.close();
  });

  it("negative control: the check would catch an untyped schema", () => {
    // If isUntyped ever stops recognising `{}`, the guard above goes quiet
    // while the bug it exists for walks straight back in.
    expect(isUntyped({}), "an empty schema must count as untyped").toBe(true);
    expect(isUntyped({ description: "words only" }), "description alone is not a type").toBe(true);
    expect(isUntyped({ type: "string" })).toBe(false);
    expect(isUntyped({ anyOf: [{ type: "object" }] })).toBe(false);
    expect(isUntyped({ enum: ["a", "b"] })).toBe(false);
  });
});
