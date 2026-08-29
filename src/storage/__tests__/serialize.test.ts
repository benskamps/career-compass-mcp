import { describe, it, expect } from "vitest";
import { serializeOn, __chainCount } from "../serialize.js";

/**
 * The in-process serialization primitive keeps one promise chain per key in a
 * Map. It used to never delete a settled key, so a long-lived server leaked one
 * dead entry per distinct key forever — keys are resolved data-dir/file paths
 * and `write-claim:<dir>` strings. This is the negative control for the prune:
 * once every serialized op on a key resolves, the map drops the key.
 */

/** Let the post-settle prune microtasks/macrotasks run. */
const flush = () => new Promise((r) => setTimeout(r, 5));

describe("serializeOn chain pruning", () => {
  it("serializes calls on one key and prunes the entry once they settle", async () => {
    const order: number[] = [];
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        serializeOn("k", async () => {
          order.push(i);
          await new Promise((r) => setTimeout(r, 1));
        }),
      ),
    );
    // Still serialized in dispatch order.
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

    await flush();
    expect(__chainCount(), "the settled key was not pruned").toBe(0);
  });

  it("prunes every key after N distinct keys resolve", async () => {
    await Promise.all(
      Array.from({ length: 50 }, (_, i) => serializeOn(`key-${i}`, async () => i)),
    );
    await flush();
    expect(__chainCount(), "distinct keys leaked into the chains map").toBe(0);
  });

  it("a rejection still prunes the key (both-settle continuation preserved)", async () => {
    await serializeOn("boom", async () => {
      throw new Error("x");
    }).catch(() => {});
    // A later call on the same key still runs — the chain was not wedged.
    let ran = false;
    await serializeOn("boom", async () => {
      ran = true;
    });
    expect(ran).toBe(true);
    await flush();
    expect(__chainCount()).toBe(0);
  });
});
