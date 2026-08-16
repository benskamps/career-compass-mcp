/**
 * How `manifest.json` is written to disk — the encoding, not the content.
 *
 * `manifest.json` is generated from the live server by
 * `scripts/gen-manifest-tools.mjs`, and it is checked in with every non-ASCII
 * character as a `\uXXXX` escape. Both forms are valid JSON and decode
 * identically, so the choice is purely about diffs: the descriptions are full
 * of em dashes, and letting them land as literals buries the first real copy
 * change under a screenful of encoding noise.
 *
 * That invariant was documented only in a comment inside the generator, which
 * meant nothing enforced it. The v2.4.0 release (18ec920) checked the manifest
 * back in with literal em dashes — semantically identical, so
 * manifest-truth.test.ts (which compares *parsed* descriptions) stayed green
 * and CI never noticed. The cost showed up in the workflow instead:
 * `gen-manifest-tools.mjs --check` failed on a clean checkout of main claiming
 * "manifest.json disagrees with the server" when the copy was in fact correct,
 * and `npm run gen:manifest` rewrote ten untouched lines every run.
 *
 * So the encoding lives here, in one typed place, exercised by
 * manifest-truth.test.ts against the file that actually ships.
 */

/**
 * Escape every non-ASCII character in an already-serialized JSON string.
 *
 * JSON's `\u` escape is exactly four hex digits, so anything outside the BMP
 * has to be emitted as the surrogate pair JSON already uses internally. The
 * first version of this formatted the whole code point with a single escape,
 * which turned a four-digit `padStart` into a five-digit sequence: an emoji
 * (`U+1F600`) came out as `ὠ0`, which re-parses as `ὠ` followed by a
 * literal `0` — `ὠ0`. Still valid JSON, so nothing threw; the description was
 * just silently corrupted. No manifest string has ever contained an astral
 * character, so this was latent rather than shipped, but the failure mode is
 * quiet enough to be worth closing.
 */
export function escapeNonAscii(json: string): string {
  let out = "";
  // Iterating a string yields whole code points, so `ch` is the astral
  // character itself (length 2) rather than a lone surrogate.
  for (const ch of json) {
    if (ch.codePointAt(0)! <= 127) {
      out += ch;
      continue;
    }
    for (let i = 0; i < ch.length; i++) {
      out += "\\u" + ch.charCodeAt(i).toString(16).padStart(4, "0");
    }
  }
  return out;
}

/** A tool as both the manifest and a `tools/list` response describe it. */
export interface ManifestTool {
  name: string;
  description: string;
}

/**
 * The exact bytes `manifest.json` should contain, given the manifest as parsed
 * and the tools the server actually serves.
 *
 * Spreading rather than mutating keeps the caller's object intact; `tools`
 * already exists on the manifest, so it keeps its original key position and
 * the rewrite stays a content diff instead of a reordering.
 *
 * Emits LF endings. The repo is developed on Windows with `core.autocrlf=true`,
 * so a working copy is checked out with CRLF while the committed blob is LF —
 * comparisons against this output must normalize line endings rather than
 * assume either one.
 */
export function renderManifest(
  manifest: Record<string, unknown>,
  tools: ManifestTool[],
): string {
  return escapeNonAscii(JSON.stringify({ ...manifest, tools }, null, 2)) + "\n";
}
