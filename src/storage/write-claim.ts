import { mkdir, writeFile, readFile, rm, rename } from "fs/promises";
import { join, dirname, resolve } from "path";
import { randomUUID } from "crypto";
import { AsyncLocalStorage } from "async_hooks";
import { serializeOn } from "./serialize.js";

/** Data dirs whose claim is held by the CURRENT async call stack. */
const heldDirs = new AsyncLocalStorage<Set<string>>();

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
 * This is the ONLY question acquisition asks. "Is it mine?" is deliberately not
 * asked — see the note below. Conflating "nobody is really holding this" with
 * "I am allowed to take this" is what made `inspectWriteClaim` report *no
 * holder* while this very process held one: a diagnostic that lies in exactly
 * the situation it exists for.
 */
function stale(claim: ClaimRecord | null, now: number): boolean {
  if (!claim) return true;

  // Liveness BEFORE the TTL verdict — this is the fix. A claim whose holder is
  // still running on this machine is NOT stale, even once it is older than
  // CLAIM_TTL_MS. A write that outlives the TTL is slow (a large file, a paused
  // or swapped-out process, a busy disk), not crashed, and breaking a live
  // holder is precisely the second-writer race this module exists to prevent.
  // The TTL used to be read first, so a live-but-slow holder past 30s was broken
  // and a second writer walked straight in on a live one.
  if (pidAlive(claim.pid)) return false;

  // The holder is not alive on this machine: it crashed (leaving a dead pid), or
  // the claim was written by a process on ANOTHER machine sharing this directory,
  // whose pid means nothing here. A crashed holder is broken at once so a crash
  // never wedges the store — hence a locally-dead pid is stale regardless of age.
  // CLAIM_TTL_MS stays as the cross-machine backstop and, via the finiteness
  // guard, breaks a claim whose timestamp will not even parse rather than
  // trusting it forever.
  const age = now - Date.parse(claim.acquiredAt);
  if (!Number.isFinite(age) || age > CLAIM_TTL_MS) return true;
  // Recent timestamp, dead pid: a fresh crash. Break it — waiting out the TTL
  // would only delay recovery of a directory whose owner is already gone.
  return true;
}

/**
 * There is deliberately no "our own pid is takeable" branch.
 *
 * There used to be, justified by "nested calls within one process are already
 * serialized by withDataLock" — which was **false**, and the resulting bug was
 * the worst in this module. `withDataLock` keys on the FILE PATH; this claim
 * keys on the DATA DIR. So `saveCareerSection("profile")` and
 * `appendJournalEntry()` take different in-process locks and are genuinely
 * concurrent inside the claim. The second one found a claim owned by its own
 * pid, treated it as re-entrant, broke it, and on the way out **deleted the
 * claim file while the first was still writing** — at which point another
 * process could take it and write concurrently. The cross-process guarantee was
 * being destroyed by an in-process race. Reproduced, then fixed.
 *
 * The fix is {@link serializeOn} keyed by the data dir, below: only one caller
 * in this process is ever inside the claim, so a same-pid claim on disk is
 * either genuinely stale (TTL / dead pid) or genuinely someone else's, and both
 * are handled by {@link stale}.
 */

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
export function withWriteClaim<T>(dataDir: string, fn: () => Promise<T>): Promise<T> {
  const key = resolve(dataDir);

  // Re-entrancy, done by call stack rather than by pid.
  //
  // "Same process" is the wrong question and asking it is what caused the bug
  // described above `stale()` — two concurrent siblings share a pid and are not
  // nested at all. "Same async call stack" is the right one, and
  // AsyncLocalStorage answers it exactly: a claim taken inside a claim for the
  // same directory is genuinely re-entrant and passes straight through, while a
  // sibling gets queued below.
  //
  // Nothing nests today. This exists because the alternative failure is a
  // silent deadlock — the caller waits forever on a lock it is already holding —
  // and that is a worse thing to leave lying around than fifteen lines.
  const held = heldDirs.getStore();
  if (held?.has(key)) return fn();

  // Serialize this process's own callers on the data dir FIRST. Queueing (not
  // refusing) is right in-process: the second caller is a legitimate request
  // that should proceed once the first finishes. Cross-process is the opposite —
  // there, waiting on someone else's write is not ours to do, so it throws.
  return serializeOn(`write-claim:${key}`, () =>
    heldDirs.run(new Set([...(held ?? []), key]), () => acquireAndRun(dataDir, fn)),
  );
}

/** How many times acquisition will break a stale claim before it gives up. */
const MAX_BREAK_ATTEMPTS = 5;

/**
 * Break one stale claim by atomically CAPTURING it, then removing the capture.
 *
 * `true`  — this caller captured the stale file and removed it; the slot is now
 *           free for it to race the `wx` create.
 * `false` — another process captured it first (the rename hit ENOENT); this
 *           caller lost harmlessly and should re-read and retry.
 *
 * The primitive is `rename`, not `rm`. The previous break did `rm(path)` then
 * `wx` create, which is not mutual exclusion: two breakers that both read the
 * same stale claim would each `rm` and each create, and the second `rm` deletes
 * the FIRST breaker's now-LIVE claim — so both end up believing they hold it
 * (reproduced as `{aWon:true, bWon:true}`). `rename(path → sidecar)` is atomic
 * and destination-unique: of two processes racing the same stale file, exactly
 * one rename succeeds and the other gets ENOENT, so exactly one process ever
 * captures a given claim. The loser does not blindly delete whatever now sits at
 * `path` — it returns `false` and the caller re-reads, refusing if the winner's
 * fresh claim is live. The sidecar is removed immediately, so nothing leaks.
 */
export async function breakStaleClaim(path: string): Promise<boolean> {
  const sidecar = `${path}.breaking.${randomUUID()}`;
  try {
    await rename(path, sidecar);
  } catch (e) {
    // ENOENT: another breaker already moved the stale claim aside (or it was
    // released). Either way we did not capture it — the caller re-reads.
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw e;
  }
  await rm(sidecar, { force: true }).catch(() => {});
  return true;
}

async function acquireAndRun<T>(dataDir: string, fn: () => Promise<T>): Promise<T> {
  const path = claimPath(dataDir);
  const nonce = randomUUID();
  const record = () =>
    JSON.stringify({
      pid: process.pid,
      nonce,
      acquiredAt: new Date().toISOString(),
      holder: selfLabel,
    } satisfies ClaimRecord);

  await mkdir(dirname(path), { recursive: true });

  /** `wx` fails if the path exists — atomic create, no check-then-act window. */
  const tryCreate = async (): Promise<boolean> => {
    try {
      await writeFile(path, record(), { flag: "wx", encoding: "utf-8" });
      return true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST") return false;
      throw e;
    }
  };

  // Acquire the claim: create it if the slot is free; refuse if a live holder
  // owns it; break it if it is stale. The loop exists because breaking a stale
  // claim is a race between processes and the loser must re-read rather than act
  // on a stale reading — see {@link breakStaleClaim}.
  for (let attempt = 0; ; attempt++) {
    if (await tryCreate()) break; // slot was free — claim acquired.

    const existing = await readClaim(path);
    if (!stale(existing, Date.now())) {
      // A live holder — either a genuine other process, or a racer that just won
      // the break and now owns a fresh claim. Refuse; nothing is written.
      throw new WriteClaimUnavailableError(dataDir, existing);
    }

    // Stale. Try to capture and remove it. If another process captured it first
    // we lose harmlessly and loop: by the next read the winner either holds a
    // live claim (refused above) or has released the slot (we create).
    await breakStaleClaim(path);

    if (attempt >= MAX_BREAK_ATTEMPTS) {
      // Pathological churn — claims replaced faster than we can act. One last
      // create, then refuse rather than spin. Nothing was written either way.
      if (await tryCreate()) break;
      throw new WriteClaimUnavailableError(dataDir, await readClaim(path));
    }
  }

  try {
    return await fn();
  } finally {
    const current = await readClaim(path);
    // Only release what is still ours. If the TTL expired mid-write and another
    // process broke our claim, the file on disk is theirs and deleting it would
    // hand the directory to a third party.
    if (current?.nonce === nonce) await rm(path, { force: true }).catch(() => {});
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
