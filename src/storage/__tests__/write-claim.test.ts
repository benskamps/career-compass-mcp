import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  withWriteClaim,
  inspectWriteClaim,
  isWriteClaimUnavailable,
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

  it("REFUSES a second live holder, and does not run the body", async () => {
    // The assertion that would have failed before write-claim.ts existed.
    if (FOREIGN_PID === null) {
      // Without a live foreign pid this would pass for the wrong reason.
      throw new Error("no live foreign pid available; cannot exercise the refusal");
    }
    let ran = false;
    let inner: unknown;
    await withWriteClaim(dir, async () => {
      // Simulate the second process: same directory, claim already held.
      inner = await withWriteClaimFromAnotherPid(dir, async () => {
        ran = true;
      });
    });

    expect(ran, "the body ran while another process held the claim").toBe(false);
    expect(isWriteClaimUnavailable(inner)).toBe(true);
  });

  it("names the holder so the user knows what to close", async () => {
    if (FOREIGN_PID === null) throw new Error("no live foreign pid available");
    let err: unknown;
    await withWriteClaim(dir, async () => {
      err = await withWriteClaimFromAnotherPid(dir, async () => {});
    });
    expect(isWriteClaimUnavailable(err)).toBe(true);
    expect((err as Error).message).toMatch(/Another Career Compass process is writing/);
    expect((err as Error).message).toMatch(/Nothing was written/);
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

  it("breaks a claim older than the TTL even if the pid looks alive", async () => {
    plantForeignClaim(CLAIM_TTL_MS + 1_000, process.pid);
    let ran = false;
    await withWriteClaim(dir, async () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });

  it("treats a garbage claim file as no claim", async () => {
    writeFileSync(claimFile(), "{ not json", "utf-8");
    let ran = false;
    await withWriteClaim(dir, async () => {
      ran = true;
    });
    expect(ran).toBe(true);
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

/**
 * Take the claim as if from a different process, by rewriting the on-disk
 * record's pid to a live-but-not-us value first.
 *
 * Returns the thrown error rather than throwing, so the caller can assert on it
 * from inside the outer claim.
 */
async function withWriteClaimFromAnotherPid(
  dataDir: string,
  fn: () => Promise<void>,
): Promise<unknown> {
  const file = join(dataDir, ".write-claim");
  const held = JSON.parse(readFileSync(file, "utf-8"));
  writeFileSync(
    file,
    JSON.stringify({ ...held, pid: FOREIGN_PID, holder: "other process" }),
    "utf-8",
  );
  try {
    await withWriteClaim(dataDir, fn);
    return null;
  } catch (e) {
    return e;
  } finally {
    writeFileSync(file, JSON.stringify(held), "utf-8");
  }
}
