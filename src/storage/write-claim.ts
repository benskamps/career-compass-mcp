import { mkdir, writeFile, readFile, rm, rename } from "fs/promises";
import { join, dirname } from "path";
import { randomUUID } from "crypto";

/**
 * The write claim — one process at a time may write a given data directory.
 *
 * `withDataLock` in file-store.ts serializes read-modify-write cycles *within a
 * process*, and its own comment is honest about that scope: "the MCP server is
 * the single writer for a given data dir. It is not a defense against two
 * servers pointed at one directory." The audit's finding was that the
 * repository ships the second writer itself — the Next dashboard's four Server
 * Actions run in their own OS process — so the invariant was stated and not
 * held. The same class covers one MCP server registered in both Claude Desktop
 * and Claude Code, which is an ordinary install, not an exotic one.
 *
 * Two concurrent read-modify-write cycles on profile.yaml interleave, the later
 * rename wins outright, and both callers report success. The `.bak` makes that
 * recoverable; it does not make it *detectable*, which is the worse half.
 *
 * ── What this is and is not ─────────────────────────────────────────────────
 *
 * It is a cooperative advisory claim: a file in the data directory naming the
 * pid and a nonce, created with `wx` so creation is atomic on every platform.
 * A writer that cannot take the claim refuses and says who holds it, rather
 * than writing anyway.
 *
 * It is NOT a kernel lock and cannot stop a process that ignores it — `vim`
 * editing the YAML by hand will not consult it, and that is fine, because a
 * human editing their own plain files is the product working as advertised.
 * What it stops is the two writers this repository itself ships.
 *
 * ── Staleness ───────────────────────────────────────────────────────────────
 *
 * A crashed process leaves its claim behind. A claim that outlives its holder
 * would wedge the store forever, which is a worse failure than the race it
 * prevents, so a claim older than {@link CLAIM_TTL_MS} is breakable. The TTL is
 * deliberately short: a claim is held across one read-modify-write of a small
 * YAML file, measured in single-digit milliseconds, never across a user's think
 * time. If you find yourself wanting to hold one longer, you want a different
 * design, not a longer TTL.
 */

/** How long a claim may sit before another process may break it. */
export const CLAIM_TTL_MS = 30_000;

/** Thrown when another live process holds the claim. Callers surface this. */
export class WriteClaimUnavailableError extends Error {
  readonly holder: ClaimRecord | null;
  constructor(dir: string, holder: ClaimRecord | null) {
    super(
      holder
        ? `Another Career Compass process is writing ${dir} (pid ${holder.pid}, ` +
            `held since ${holder.acquiredAt}). Nothing was written. ` +
            `Close the other dashboard or MCP server and retry.`
        : `Could not take the write claim for ${dir}. Nothing was written.`,
    );
    this.name = "WriteClaimUnavailableError";
    this.holder = holder;
  }
}

export function isWriteClaimUnavailable(e: unknown): e is WriteClaimUnavailableError {
  return e instanceof WriteClaimUnavailableError;
}

export interface ClaimRecord {
  pid: number;
  /** Distinguishes two claims from the same pid across a restart. */
  nonce: string;
  acquiredAt: string;
  /** "mcp-server" | "dashboard" | a test name — for the message, not for logic. */
  holder: string;
}

function claimPath(dataDir: string): string {
  return join(dataDir, ".write-claim");
}

/** Who this process says it is. Set once, at startup, by whoever boots. */
let selfLabel = "career-compass";
export function setClaimHolderLabel(label: string): void {
  selfLabel = label;
}

async function readClaim(path: string): Promise<ClaimRecord | null> {
  try {
    return JSON.parse(await readFile(path, "utf-8")) as ClaimRecord;
  } catch {
    // Missing, half-written, or garbage. All three mean "no usable claim".
    return null;
  }
}

/**
 * Is a claim expired, or held by a pid that is no longer alive?
 *
 * Deliberately separate from {@link breakable}: "nobody is really holding this"
 * and "I am allowed to take this" are different questions, and conflating them
 * made `inspectWriteClaim` report *no holder* while this very process held one —
 * a diagnostic that lies in exactly the situation it exists for.
 */
function stale(claim: ClaimRecord | null, now: number): boolean {
  if (!claim) return true;
  const age = now - Date.parse(claim.acquiredAt);
  if (!Number.isFinite(age) || age > CLAIM_TTL_MS) return true;
  return !pidAlive(claim.pid);
}

/** May this process take the claim? Stale ones, and our own, are takeable. */
function breakable(claim: ClaimRecord | null, now: number): boolean {
  if (stale(claim, now)) return true;
  // A claim from this very process is ours to re-enter. Nested calls within one
  // process are already serialized by `withDataLock`; refusing ourselves here
  // would be a deadlock dressed as a safety check.
  return claim!.pid === process.pid;
}

/**
 * Is that pid still running?
 *
 * `kill(pid, 0)` sends no signal and only asks the kernel. EPERM means the
 * process exists but belongs to another user — alive, and not ours to break.
 * Any other error means it is gone.
 */
function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Run `fn` while holding the write claim for `dataDir`.
 *
 * Throws {@link WriteClaimUnavailableError} without running `fn` if another live
 * process holds it — the caller must surface that as an explicit unavailable
 * outcome, never as a silent partial write.
 *
 * The claim is always released, including when `fn` throws, and only if we are
 * still its owner: a claim we lost to a TTL break belongs to whoever took it.
 */
export async function withWriteClaim<T>(dataDir: string, fn: () => Promise<T>): Promise<T> {
  const path = claimPath(dataDir);
  const nonce = randomUUID();
  const record: ClaimRecord = {
    pid: process.pid,
    nonce,
    acquiredAt: new Date().toISOString(),
    holder: selfLabel,
  };

  await mkdir(dirname(path), { recursive: true });

  let held = false;
  try {
    // `wx` fails if the path exists — atomic create, no check-then-act window.
    await writeFile(path, JSON.stringify(record), { flag: "wx", encoding: "utf-8" });
    held = true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;

    const existing = await readClaim(path);
    if (!breakable(existing, Date.now())) {
      throw new WriteClaimUnavailableError(dataDir, existing);
    }

    // Break it by writing our record to a unique temp file and renaming over
    // the stale one. rename() is atomic, so two processes breaking the same
    // stale claim at the same moment produce one winner rather than a mangled
    // file — and the loser's read-back below tells it which it was.
    const tmp = `${path}.${nonce}.tmp`;
    await writeFile(tmp, JSON.stringify(record), "utf-8");
    await rename(tmp, path);

    const after = await readClaim(path);
    if (after?.nonce !== nonce) {
      throw new WriteClaimUnavailableError(dataDir, after);
    }
    held = true;
  }

  try {
    return await fn();
  } finally {
    if (held) {
      const current = await readClaim(path);
      // Only release what is still ours.
      if (current?.nonce === nonce) await rm(path, { force: true }).catch(() => {});
    }
  }
}

/**
 * Who holds the claim right now, if anyone. For diagnostics — `check_setup`.
 *
 * Reports our own claim too. "Is anything holding this directory?" is the
 * question, and answering "no" while we hold it would be a lie of the exact kind
 * this module exists to stop.
 */
export async function inspectWriteClaim(dataDir: string): Promise<ClaimRecord | null> {
  const claim = await readClaim(claimPath(dataDir));
  return claim && !stale(claim, Date.now()) ? claim : null;
}

/** Exported for tests: is that pid running? */
export const __pidAlive = pidAlive;
