import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, readdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  withWriteClaim,
  inspectWriteClaim,
  isWriteClaimUnavailable,
  breakStaleClaim,
  CLAIM_TTL_MS,
  __pidAlive,
} from "../write-claim.js";

/**
 * Gate 2's negative control.
 *
 * The audit's P1 was that `withDataLock` serializes writes *within a process*
 * while the repository ships two writing processes — the MCP server and the Next
 * dashboard's Server Actions. The failure mode is not a crash: both writers
 * report success and the later rename silently wins.
 *
 * So the assertion that matters is not "the claim can be taken". It is
 * **"a second holder is refused, and nothing is written"** — the test below that
 * would have failed before write-claim.ts existed.
 */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cc-claim-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const claimFile = () => join(dir, ".write-claim");

/** A claim held by a pid that is certainly not running. */
function plantForeignClaim(ageMs = 0, pid = 0x7ffffffe) {
  writeFileSync(
    claimFile(),
    JSON.stringify({
      pid,
      nonce: "planted",
      acquiredAt: new Date(Date.now() - ageMs).toISOString(),
      holder: "some other process",
    }),
    "utf-8",
  );
}

describe("write claim", () => {
  it("runs the body and releases the claim afterwards", async () => {
    const seen: string[] = [];
    const result = await withWriteClaim(dir, async () => {
      seen.push(readFileSync(claimFile(), "utf-8"));
      return "done";
    });
    expect(result).toBe("done");
    expect(seen).toHaveLength(1);
    expect(existsSync(claimFile())).toBe(false);
  });

  it("releases the claim even when the body throws", async () => {
    await expect(
      withWriteClaim(dir, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(existsSync(claimFile())).toBe(false);
  });

  // ── the negative control ──────────────────────────────────────────────────

  it("REFUSES a live foreign holder, and does not run the body", async () => {
    // The assertion that would have failed before write-claim.ts existed.
    //
    // Deliberately NOT nested inside an outer claim. It used to be, which was
    // wrong twice over: nesting is now correctly re-entrant (so the inner call
    // would pass straight through and the test would assert nothing), and
    // before that it deadlocked once same-dir callers began queueing. Plant the
    // foreign claim on disk and come at it from the top, which is what a second
    // process actually does.
    expect(FOREIGN_PID, "no live foreign pid available; the refusal is unexercisable").not.toBeNull();
    plantForeignClaim(0, FOREIGN_PID!);

    let ran = false;
    let err: unknown;
    try {
      await withWriteClaim(dir, async () => {
        ran = true;
      });
    } catch (e) {
      err = e;
    }

    expect(ran, "the body ran while another process held the claim").toBe(false);
    expect(isWriteClaimUnavailable(err)).toBe(true);
    expect(existsSync(claimFile()), "the foreign claim was destroyed").toBe(true);
  });

  it("names the holder so the user knows what to close", async () => {
    expect(FOREIGN_PID).not.toBeNull();
    plantForeignClaim(0, FOREIGN_PID!);

    let err: unknown;
    try {
      await withWriteClaim(dir, async () => {});
    } catch (e) {
      err = e;
    }
    expect(isWriteClaimUnavailable(err)).toBe(true);
    expect((err as Error).message).toMatch(/Another Career Compass process is writing/);
    expect((err as Error).message).toMatch(/Nothing was written/);
  });

  it("passes straight through when the SAME call stack re-enters the same dir", async () => {
    // Re-entrancy is by async call stack, not by pid — a nested claim is the one
    // case where proceeding is correct. Without this, a future nested caller
    // would wait forever on a lock it already holds.
    let inner = false;
    await withWriteClaim(dir, async () => {
      await withWriteClaim(dir, async () => {
        inner = true;
      });
    });
    expect(inner, "a nested claim on the same dir deadlocked or was refused").toBe(true);
    expect(existsSync(claimFile()), "the claim was not released").toBe(false);
  });

  // ── staleness: a crash must not wedge the store forever ───────────────────

  it("breaks a claim whose holder is gone", async () => {
    plantForeignClaim(0); // dead pid, fresh timestamp
    let ran = false;
    await withWriteClaim(dir, async () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });

  // ── liveness before TTL: a slow live holder must not be broken ────────────
  //
  // The negative control for the "liveness before TTL" fix. `stale()` now asks
  // whether the holder's pid is ALIVE before it asks whether the claim is older
  // than the TTL. So a live holder that has held the claim longer than 30s — a
  // big write, a paused process, a busy disk — is NOT broken; only a dead
  // (crashed / cross-machine) holder past the backstop is. Reverting to the old
  // TTL-first order breaks this test: it would treat the live-but-old claim as
  // stale and run the body.

  it("does NOT break a LIVE holder older than the TTL (liveness beats the TTL)", async () => {
    // process.pid is alive by construction while this test runs.
    plantForeignClaim(CLAIM_TTL_MS + 5_000, process.pid);

    let ran = false;
    let err: unknown;
    try {
      await withWriteClaim(dir, async () => {
        ran = true;
      });
    } catch (e) {
      err = e;
    }

    expect(ran, "a live-but-slow holder past the TTL was wrongly broken").toBe(false);
    expect(isWriteClaimUnavailable(err), "the live holder should have been refused, not broken").toBe(true);
    // The live holder's claim is left untouched.
    expect(existsSync(claimFile())).toBe(true);
  });

  it("DOES break a DEAD holder older than the TTL (the cross-machine backstop)", async () => {
    plantForeignClaim(CLAIM_TTL_MS + 5_000); // dead pid AND expired
    let ran = false;
    await withWriteClaim(dir, async () => {
      ran = true;
    });
    expect(ran, "a dead holder past the TTL must be breakable").toBe(true);
  });

  it("treats a garbage claim file as no claim", async () => {
    writeFileSync(claimFile(), "{ not json", "utf-8");
    let ran = false;
    await withWriteClaim(dir, async () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });

  // ── concurrency: the interleavings, not the description ───────────────────
  //
  // The first version of this file had eight cases and none of them ran two
  // claims at once. It validated the design as written and would have passed
  // against a module with a serious race in it — which is exactly what happened.
  // An external review found it; a repro confirmed it; these are the tests that
  // would have caught it first.

  it("admits ONE caller at a time when this process claims the same dir concurrently", async () => {
    // saveCareerSection() and appendJournalEntry() take DIFFERENT withDataLock
    // keys (different file paths) but the SAME claim key (the data dir), so they
    // arrive here genuinely concurrent. Previously the second treated the
    // first's claim as re-entrant because the pids matched.
    let inside = 0;
    let maxInside = 0;
    let vanishedMidWrite = false;

    const body = async () => {
      inside++;
      maxInside = Math.max(maxInside, inside);
      await new Promise((r) => setTimeout(r, 40));
      // The killer symptom: the previous version's second caller deleted the
      // claim file on its way out while the first was still writing, so another
      // *process* could walk in.
      if (!existsSync(claimFile())) vanishedMidWrite = true;
      await new Promise((r) => setTimeout(r, 40));
      inside--;
    };

    await Promise.all([
      withWriteClaim(dir, body),
      withWriteClaim(dir, body),
      withWriteClaim(dir, body),
    ]);

    expect(maxInside, "two callers were inside the claim at once").toBe(1);
    expect(vanishedMidWrite, "the claim file was deleted while a write was in flight").toBe(false);
    expect(existsSync(claimFile()), "the claim was not released").toBe(false);
  });

  it("two callers racing one stale claim do not both proceed at once", async () => {
    plantForeignClaim(CLAIM_TTL_MS + 5_000); // stale: dead pid AND expired
    let inside = 0;
    let maxInside = 0;
    const body = async () => {
      inside++;
      maxInside = Math.max(maxInside, inside);
      await new Promise((r) => setTimeout(r, 40));
      inside--;
    };

    const results = await Promise.allSettled([withWriteClaim(dir, body), withWriteClaim(dir, body)]);

    // Both may legitimately succeed — they are the same process and queue — but
    // never simultaneously. The old rename-then-read-back break could let two
    // breakers each read their own nonce and both conclude they held it.
    expect(maxInside, "two breakers were inside the claim at once").toBe(1);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
  });

  // ── the stale-break race: exactly ONE winner ──────────────────────────────
  //
  // The negative control for the rename-sidecar break. Two processes that both
  // read the SAME stale claim and both try to break it must not both proceed —
  // the earlier `rm(path)` + `wx` break let the second breaker delete the first
  // breaker's now-LIVE claim, so both created and both believed they held it
  // (probe reproduced `{aWon:true, bWon:true}`). `breakStaleClaim` uses an atomic
  // `rename`, so of two racers on one stale file exactly one CAPTURES it and the
  // other gets ENOENT. Reverting the primitive to `rm` makes both capture and
  // this test fails.

  it("two processes racing one stale claim: exactly ONE captures it (rename, not rm)", async () => {
    plantForeignClaim(CLAIM_TTL_MS + 5_000); // one stale claim S on disk

    // Model the two-process race the way probe2 does: sequential syscalls in the
    // order two processes attempt to break the SAME stale claim S. The atomic
    // rename lets the first CAPTURE S; the second finds S already gone (ENOENT →
    // false). The old rm-based break returned true for BOTH — the second rm
    // blindly deleted whatever sat there — which is how both ended up inside the
    // critical section (`{aWon:true, bWon:true}`). An in-process Promise.all
    // cannot model this: production guards this behind serializeOn, so the real
    // race is between OS processes, one breakStaleClaim call each.
    const a = await breakStaleClaim(claimFile()); // captures S
    const b = await breakStaleClaim(claimFile()); // S already gone → loses

    expect([a, b], `expected exactly one winner, got a=${a} b=${b}`).toEqual([true, false]);
    // The captured stale claim is gone and no `.breaking.<uuid>` sidecar leaked.
    expect(existsSync(claimFile())).toBe(false);
    const strays = readdirSync(dir).filter((n) => n.includes(".breaking."));
    expect(strays, `stray break sidecars: ${strays.join(", ")}`).toEqual([]);
  });

  it("leaves no temp files behind when it breaks a stale claim", async () => {
    plantForeignClaim(CLAIM_TTL_MS + 5_000);
    await withWriteClaim(dir, async () => {});
    // The break used to write `<claim>.<uuid>.tmp` and rename it, which leaked
    // on any rename failure and sat in a directory `check_setup`'s orphan scan
    // does not walk. `wx` needs no temp file at all.
    const strays = readdirSync(dir).filter((n) => n.includes(".write-claim"));
    expect(strays, `stray claim artifacts: ${strays.join(", ")}`).toEqual([]);
  });

  it("inspectWriteClaim reports a live holder and ignores a stale one", async () => {
    expect(await inspectWriteClaim(dir)).toBeNull();
    await withWriteClaim(dir, async () => {
      expect((await inspectWriteClaim(dir))?.holder).toBeTruthy();
    });
    plantForeignClaim(CLAIM_TTL_MS + 1_000);
    expect(await inspectWriteClaim(dir)).toBeNull();
  });
});

/**
 * A pid that is alive and is not us.
 *
 * The cross-process refusal cannot be exercised with our own pid: `withWriteClaim`
 * deliberately lets the same process re-enter, because nested calls are already
 * serialized by `withDataLock` and refusing ourselves would be a deadlock dressed
 * as a safety check. So the test needs a genuinely live foreign pid.
 *
 * `pid 1` is not portable for this — on Windows `kill(1, 0)` reports ESRCH, so a
 * claim held by "pid 1" reads as dead and gets broken, and the negative control
 * silently passes for the wrong reason. The parent process is alive by
 * construction while this test runs.
 */
const FOREIGN_PID = (() => {
  const ppid = process.ppid;
  return ppid && ppid !== process.pid && __pidAlive(ppid) ? ppid : null;
})();
