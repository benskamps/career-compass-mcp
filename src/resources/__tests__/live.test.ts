import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { registerLiveResources, __internals } from "../live.js";

/**
 * Live resources, driven against a real directory and a real watcher.
 *
 * The temptation with a watch-based feature is to unit-test the mapping table
 * and call it covered. That tests the description, not the behaviour — and the
 * behaviours that matter here are the ones that only appear when actual files
 * move: that a save does not emit a burst, that the machinery of saving
 * (`.bak`, `.tmp`, `.write-claim`) stays invisible, and that nothing is watched
 * at all until a host subscribes.
 */

let dir: string;
let server: McpServer;
let live: ReturnType<typeof registerLiveResources>;
let updates: string[];

/** Reach the handlers the same way the transport does. */
function handler(schema: typeof SubscribeRequestSchema | typeof UnsubscribeRequestSchema) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlers = (server.server as any)._requestHandlers as Map<string, Function>;
  const method = schema.shape.method.value as string;
  const fn = handlers.get(method);
  if (!fn) throw new Error(`no handler registered for ${method}`);
  return (uri: string) => fn({ method, params: { uri } }, {});
}

const subscribe = (uri: string) => handler(SubscribeRequestSchema)(uri);
const unsubscribe = (uri: string) => handler(UnsubscribeRequestSchema)(uri);

/** Let the OS deliver watch events, which are inherently asynchronous. */
const settle = () => new Promise((r) => setTimeout(r, 120));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cc-live-"));
  mkdirSync(join(dir, "career"), { recursive: true });
  mkdirSync(join(dir, "pipeline"), { recursive: true });
  process.env.CAREER_DATA_PATH = dir;

  updates = [];
  server = new McpServer({ name: "test", version: "0.0.0" });
  vi.spyOn(server.server, "sendResourceUpdated").mockImplementation(async ({ uri }) => {
    updates.push(uri);
  });
  live = registerLiveResources(server);
});

afterEach(() => {
  live.close();
  delete process.env.CAREER_DATA_PATH;
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("live resources", () => {
  it("declares the subscribe capability, or no host will ever ask", () => {
    // The handlers below are unreachable without this — a feature that looks
    // implemented and is never invoked. Asserted by spying on the registration
    // rather than reading the server's private capability state, so this test
    // does not depend on SDK internals it has no right to.
    const fresh = new McpServer({ name: "cap-probe", version: "0.0.0" });
    const spy = vi.spyOn(fresh.server, "registerCapabilities");
    const handle = registerLiveResources(fresh);
    try {
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ resources: expect.objectContaining({ subscribe: true }) }),
      );
    } finally {
      handle.close();
    }
  });

  it("watches nothing until a host subscribes", async () => {
    writeFileSync(join(dir, "career", "profile.yaml"), "name: Ada\n");
    await settle();
    live.__flush();
    expect(updates, "changes were tracked before anyone subscribed").toEqual([]);
  });

  it("notifies the subscribed resource when its file changes", async () => {
    await subscribe("career://profile");
    writeFileSync(join(dir, "career", "profile.yaml"), "name: Ada\n");
    await settle();
    live.__flush();
    expect(updates).toContain("career://profile");
  });

  it("notifies a pipeline subscriber when the dashboard moves a card", async () => {
    await subscribe("career://pipeline");
    writeFileSync(join(dir, "pipeline", "applications.yaml"), "applications: []\n");
    await settle();
    live.__flush();
    expect(updates).toContain("career://pipeline");
  });

  it("does NOT notify a resource nobody subscribed to", async () => {
    await subscribe("career://profile");
    writeFileSync(join(dir, "career", "skills.yaml"), "- name: Rust\n");
    await settle();
    live.__flush();
    expect(updates).not.toContain("career://skills");
  });

  it("dirties the aggregate resource when any section changes", async () => {
    await subscribe("career://full");
    writeFileSync(join(dir, "career", "experience.yaml"), "- company: Acme\n");
    await settle();
    live.__flush();
    expect(updates).toContain("career://full");
  });

  it("coalesces a write burst into ONE notification", async () => {
    // Every save here is backup-copy + temp-write + rename, and editors add
    // their own events. Without debouncing, one card move spends a host's
    // context re-reading the same file three times.
    await subscribe("career://pipeline");
    const p = join(dir, "pipeline", "applications.yaml");
    for (let i = 0; i < 5; i++) writeFileSync(p, `applications: [] # ${i}\n`);
    await settle();
    live.__flush();
    expect(updates.filter((u) => u === "career://pipeline")).toHaveLength(1);
  });

  it("stays silent about the machinery of saving", async () => {
    await subscribe("career://pipeline");
    await subscribe("career://full");
    const p = join(dir, "pipeline");
    // Exactly what atomicWriteYaml and the write claim leave behind.
    writeFileSync(join(p, "applications.yaml.2026-08-22T00-00-00-000Z.bak"), "x");
    writeFileSync(join(p, ".applications.yaml.abc123.tmp"), "x");
    writeFileSync(join(dir, ".write-claim"), "{}");
    await settle();
    live.__flush();
    expect(updates, `internal files leaked: ${updates.join(", ")}`).toEqual([]);
  });

  it("stops watching when the last subscriber leaves", async () => {
    await subscribe("career://profile");
    await unsubscribe("career://profile");
    expect(live.subscriptions()).toEqual([]);
    writeFileSync(join(dir, "career", "profile.yaml"), "name: Grace\n");
    await settle();
    live.__flush();
    expect(updates).toEqual([]);
  });

  it("survives subscribing before the data dir exists", async () => {
    rmSync(dir, { recursive: true, force: true });
    // A first-run install has nothing to watch. Subscribing then is not an error.
    await expect(subscribe("career://profile")).resolves.toBeDefined();
  });

  it("classifies internal files by rule, not by luck", () => {
    const { isInternal } = __internals;
    expect(isInternal(".write-claim")).toBe(true);
    expect(isInternal("profile.yaml.2026-01-01T00-00-00-000Z.bak")).toBe(true);
    expect(isInternal(".profile.yaml.uuid.tmp")).toBe(true);
    expect(isInternal("profile.yaml")).toBe(false);
    expect(isInternal("applications.yaml")).toBe(false);
  });

  it("maps every watched file to a resource that actually exists", () => {
    // A typo here is a file that silently never notifies.
    for (const uri of Object.values(__internals.FILE_TO_URI)) {
      expect(uri).toMatch(/^career:\/\/[a-z]+$/);
    }
  });

  // ── NC (WP-3 item 3): the journal is part of career://full ──────────────────
  it("dirties career://journal and career://full when the journal is appended", async () => {
    // `capture_insight` appends to career/journal.yaml, which is a section of
    // the merged KB. Before the FILE_TO_URI entry existed, that write was
    // invisible: a subscriber to career://full never learned part of its own
    // document had changed. Deleting the "journal.yaml" mapping in live.ts turns
    // this test red on both assertions — the negative control.
    await subscribe("career://journal");
    await subscribe("career://full");
    writeFileSync(join(dir, "career", "journal.yaml"), "- id: sig-1\n  note: shipped\n");
    await settle();
    live.__flush();
    expect(updates).toContain("career://journal");
    expect(updates).toContain("career://full");
  });

  // ── NC (WP-3 item 1): watcher survives directory death ──────────────────────
  // Measured on Windows: deleting the watched dir emits an unbounded
  // self-referential rename storm and leaves the handle bound to the dead inode
  // forever (0 events after recreation; a fresh subscribe would not re-arm). The
  // defect and its measurement are Windows-specific, so the storm assertion runs
  // there; the fix tears the dead watcher down and re-arms lazily on subscribe.
  it.skipIf(process.platform !== "win32")(
    "tears down the storming watcher on directory death and re-arms on the next subscribe",
    async () => {
      await subscribe("career://profile");
      expect(live.__watched()).toContain("career");

      // Kill the watched directory → self-referential rename storm on Windows.
      rmSync(join(dir, "career"), { recursive: true, force: true });
      await settle();
      await settle();
      // (a) No runaway storm: the dead watcher was closed on the first
      // self-referential event, so the subdir shows as disarmed rather than
      // firing ~157k events/s against a dead handle.
      expect(live.__watched(), "the storming watcher was not torn down").not.toContain("career");

      // Recreate the directory and re-subscribe: the next subscribe re-arms.
      mkdirSync(join(dir, "career"), { recursive: true });
      await subscribe("career://profile");
      expect(live.__watched(), "the watcher did not re-arm after recreation").toContain("career");

      // (b) A subsequent write produces EXACTLY ONE notification — not zero (a
      // dead handle, the old behaviour) and not a burst.
      updates.length = 0;
      writeFileSync(join(dir, "career", "profile.yaml"), "name: Ada\n");
      await settle();
      live.__flush();
      expect(updates.filter((u) => u === "career://profile")).toHaveLength(1);
    },
  );
});
