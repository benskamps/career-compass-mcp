import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { openCard, sealCard, userIdFor } from "../src/crypto";
import { readIdToken, googleAuthorizeUrl } from "../src/google";
import { buildServer } from "../src/mcp";
import { privacyPage } from "../src/pages";
import { CardStore, MAX_CARD_BYTES, MAX_SAVES_PER_DAY, MemoryRowStore } from "../src/store";

const SECRET = "x".repeat(40);
const CARD = "Career Compass card\nTarget: Senior PM, fintech\nLive: Acme (interview Nov 14)";

describe("crypto", () => {
  it("round-trips a card and binds it to the user", async () => {
    const sealed = await sealCard(SECRET, "g_a", CARD);
    expect(sealed).not.toContain("Senior PM");
    expect(await openCard(SECRET, "g_a", sealed)).toBe(CARD);
    await expect(openCard(SECRET, "g_b", sealed)).rejects.toThrow();
    await expect(openCard("y".repeat(40), "g_a", sealed)).rejects.toThrow();
  });

  it("hashes the account id deterministically and never stores it raw", async () => {
    const a = await userIdFor(SECRET, "google", "1234567890");
    expect(a).toBe(await userIdFor(SECRET, "google", "1234567890"));
    expect(a).not.toContain("1234567890");
    expect(a).not.toBe(await userIdFor("y".repeat(40), "google", "1234567890"));
  });

  it("refuses a short secret", async () => {
    await expect(sealCard("short", "g_a", CARD)).rejects.toThrow(/CARD_KEY/);
  });
});

describe("CardStore", () => {
  const make = (now = { t: Date.UTC(2026, 10, 10) }) => {
    const rows = new MemoryRowStore();
    return { rows, now, store: new CardStore(rows, SECRET, () => now.t) };
  };

  it("stores only ciphertext", async () => {
    const { rows, store } = make();
    await store.save("g_a", CARD);
    expect(JSON.stringify([...rows.rows.values()])).not.toContain("fintech");
    expect((await store.read("g_a"))?.card).toBe(CARD);
  });

  it("keeps one previous version and can undo", async () => {
    const { store } = make();
    await store.save("g_a", "v1");
    const second = await store.save("g_a", "v2");
    expect(second).toMatchObject({ ok: true, replaced: true });
    expect(await store.undo("g_a")).toBe(true);
    expect((await store.read("g_a"))?.card).toBe("v1");
  });

  it("rejects empty and oversized cards", async () => {
    const { store } = make();
    expect(await store.save("g_a", "   ")).toMatchObject({ ok: false, reason: "empty" });
    expect(await store.save("g_a", "é".repeat(MAX_CARD_BYTES))).toMatchObject({ ok: false, reason: "too_large" });
  });

  it("limits saves per UTC day", async () => {
    const { store, now } = make();
    for (let i = 0; i < MAX_SAVES_PER_DAY; i++) expect((await store.save("g_a", `v${i}`)).ok).toBe(true);
    expect(await store.save("g_a", "one more")).toMatchObject({ ok: false, reason: "rate_limited" });
    now.t += 86_400_000;
    expect((await store.save("g_a", "next day")).ok).toBe(true);
  });

  it("deletes records idle for a year, and reading counts as use", async () => {
    const { store, now } = make();
    await store.save("g_old", "old");
    await store.save("g_reader", "kept");
    now.t += 300 * 86_400_000;
    await store.read("g_reader");
    now.t += 70 * 86_400_000;
    expect(await store.deleteIdle()).toBe(1);
    expect(await store.read("g_old")).toBeNull();
    expect((await store.read("g_reader"))?.card).toBe("kept");
  });
});

async function connect(revoked = { n: 0 }) {
  const store = new CardStore(new MemoryRowStore(), SECRET);
  const server = buildServer({ store, userId: "g_test", revokeAccess: async () => void revoked.n++ });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "test", version: "1" });
  await client.connect(b);
  return { client, revoked };
}

const textOf = (r: unknown) => (r as { content: { text: string }[] }).content[0].text;

describe("MCP tools", () => {
  it("lists the four tools with the annotations the directory requires", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["delete_my_data", "get_my_card", "restore_previous_card", "save_my_card"]);
    for (const t of tools) {
      expect(t.annotations?.title ?? t.title).toBeTruthy();
      expect(typeof t.annotations?.readOnlyHint).toBe("boolean");
    }
    expect(tools.find((t) => t.name === "get_my_card")?.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((t) => t.name === "delete_my_data")?.annotations?.destructiveHint).toBe(true);
  });

  it("saves, reads back inside an untrusted fence, and deletes", async () => {
    const { client, revoked } = await connect();
    expect(textOf(await client.callTool({ name: "get_my_card", arguments: {} }))).toMatch(/No card saved yet/);
    await client.callTool({ name: "save_my_card", arguments: { card: CARD } });
    const read = textOf(await client.callTool({ name: "get_my_card", arguments: {} }));
    expect(read).toContain(CARD);
    expect(read).toMatch(/BEGIN_UNTRUSTED_\w{8}/);
    expect(textOf(await client.callTool({ name: "delete_my_data", arguments: {} }))).toMatch(/^Deleted/);
    expect(revoked.n).toBe(1);
    expect(textOf(await client.callTool({ name: "get_my_card", arguments: {} }))).toMatch(/No card saved yet/);
  });

  it("reports an oversized card as an error result", async () => {
    const { client } = await connect();
    const r = await client.callTool({ name: "save_my_card", arguments: { card: "a".repeat(MAX_CARD_BYTES + 1) } });
    expect(r.isError).toBe(true);
  });
});

describe("Google sign-in", () => {
  const token = (claims: object) => `h.${btoa(JSON.stringify(claims)).replace(/=+$/, "")}.s`;
  const ok = { sub: "42", aud: "cid", iss: "https://accounts.google.com", exp: 2_000_000_000 };

  it("accepts a valid id_token and checks audience, issuer and expiry", () => {
    expect(readIdToken(token(ok), "cid", 1_900_000_000).sub).toBe("42");
    expect(() => readIdToken(token({ ...ok, aud: "other" }), "cid", 1_900_000_000)).toThrow(/audience/);
    expect(() => readIdToken(token({ ...ok, iss: "evil" }), "cid", 1_900_000_000)).toThrow(/issuer/);
    expect(() => readIdToken(token(ok), "cid", 2_100_000_000)).toThrow(/expired/);
  });

  it("asks Google for openid only, with PKCE", () => {
    const u = new URL(googleAuthorizeUrl({ clientId: "cid", redirectUri: "https://m/callback", state: "s", challenge: "c" }));
    expect(u.searchParams.get("scope")).toBe("openid");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
  });
});

describe("privacy policy", () => {
  it("covers the topics the directory review requires", () => {
    const p = privacyPage("contact@example");
    for (const h of ["What we collect", "How it is used and stored", "Third parties", "Retention and deletion", "Contact"]) {
      expect(p).toContain(`<h2>${h}</h2>`);
    }
  });
});
