import { join } from "path";
import { getDataDir } from "./storage/file-store.js";

/**
 * The one message a user sees before they have any career data.
 *
 * There used to be four different ones, and the only one carrying an
 * instruction gave two wrong facts in twenty words: it named `data/career/`,
 * a repo-relative path that exists nowhere on an installed user's machine, and
 * it told them to run `ingest_document`, which by design never writes anything.
 * So the first thing a new user saw was a dead end that also lied about where
 * their files live.
 *
 * This names the actual resolved directory — the server knows it — and offers
 * a first move that works: `save_career_section`, which is the only tool that
 * writes the Career KB.
 */
export function noCareerDataMessage(): string {
  const careerDir = join(getDataDir(), "career");
  return [
    "**No career data yet.** Career Compass reads plain YAML from:",
    "",
    `    ${careerDir}`,
    "",
    "Nothing is there so far, which is why this tool has nothing to work with.",
    "The fastest way to start: paste in a resume and ask me to save it — I'll",
    "extract the structure and write it with `save_career_section`. You can also",
    "drop your own YAML into that folder directly; it's yours, and it never",
    "leaves this machine.",
  ].join("\n");
}
