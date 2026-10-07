import { join } from "path";
import { getDataDir } from "./storage/file-store.js";

/**
 * What a KB-backed tool returns before the user has saved any career data.
 *
 * There used to be four different ones, and the only one carrying an
 * instruction gave two wrong facts in twenty words: it named `data/career/`, a
 * repo-relative path that exists nowhere on an installed user's machine, and it
 * told them to run `ingest_document`, which by design never writes anything.
 *
 * Its successor named the real folder and told the *user* "nothing is there so
 * far, paste a resume and ask me to save it". But the reader of a tool result is
 * the model, and this arrives at the worst moment: the user has just pasted a
 * résumé and a posting and asked a question. Setup copy there pulled the reply
 * into "your KB is empty, let's save it first" instead of the answer (council
 * 2.9.7, activation note). So it now speaks to the model: an empty KB is normal,
 * do the task from what the user pasted, then offer the save once.
 *
 * `resumeParam` is for the tools that accept pasted résumé text (`resume` on
 * explore_opportunity and tailor_resume): the cheapest correct move there is to
 * call the same tool again with it.
 */
export function noCareerDataMessage(opts: { resumeParam?: string } = {}): string {
  const careerDir = join(getDataDir(), "career");
  const retry = opts.resumeParam
    ? `call this tool again with their pasted résumé text in \`${opts.resumeParam}\` and answer from that`
    : "do the task from what they pasted, holding to the same truth rule: only what they wrote";
  return [
    `**No saved Career KB yet** (nothing in \`${careerDir}\`). This is the normal first-run state, not an error.`,
    "",
    `- If the user pasted a résumé or described their background in this conversation, ${retry}. ` +
      "Don't tell them the KB is empty or ask them to set anything up first.",
    "- After the answer, offer once to save their background with `save_career_section` so later fit checks, " +
      "résumés and interview prep start from it. Save only with their OK.",
    "- If they have shared nothing about their background yet, ask for their résumé (pasted text is fine) in one line.",
  ].join("\n");
}
