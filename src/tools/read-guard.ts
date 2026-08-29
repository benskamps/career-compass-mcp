import { isCorruptDataError } from "../storage/file-store.js";
import { isWriteClaimUnavailable } from "../storage/write-claim.js";
import { isReadOnlyStore } from "../storage/read-only-error.js";
import type { ToolResponse } from "../types/tool-args.js";

/**
 * The result of a guarded read: either the loaded value, or a ready-made tool
 * response that tells the user plainly why nothing could be read.
 */
export type GuardedRead<T> =
  | { ok: true; value: T }
  | { ok: false; response: ToolResponse };

/**
 * Run a store read (`loadCareerData` / `loadPipeline`) and turn a fail-closed
 * corrupt store — or an unavailable write claim — into a told-plainly sentence
 * instead of letting it escape as a raw transport error.
 *
 * This is the read-side twin of the catch blocks every write tool already
 * carries (see pipeline.ts and career-kb.ts). A corrupt `profile.yaml` or
 * `applications.yaml` makes the loader throw `CorruptDataError`; without this,
 * a read-only interview tool surfaced that as a stack trace and lost the one
 * sentence that tells the user to fix or restore the file. The message is the
 * error's own — the loaders write a repair instruction into it — so the caller
 * only has to decide to return `response` instead of proceeding.
 *
 * Anything that is not a recognised store condition is re-thrown: an unexpected
 * failure should still surface, not be swallowed as a friendly message.
 */
export async function guardedRead<T>(load: () => Promise<T>): Promise<GuardedRead<T>> {
  try {
    return { ok: true, value: await load() };
  } catch (error) {
    if (isCorruptDataError(error) || isWriteClaimUnavailable(error) || isReadOnlyStore(error)) {
      return {
        ok: false,
        response: { content: [{ type: "text", text: `❌ ${(error as Error).message}` }] },
      };
    }
    throw error;
  }
}
