import type { JournalEntry } from "../schemas/career-schema.js";

/**
 * The tag every drafting surface puts on a journal entry Claude inferred rather
 * than heard. `capture_insight` stores `origin: "inferred"` for a reading like
 * "seems to undersell the platform work"; replayed untagged into a cover letter,
 * that reading becomes a sentence about the user they never said. Exported so
 * every renderer uses the same words.
 */
export const INFERRED_TAG = "(Claude's inference — a hypothesis, not a fact about the user)";

/** Same normalization `findApplication` uses: "Veridian Health, Inc." ≈ "veridian health inc". */
export function normCompany(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** One journal line, as the digest renders it. */
export function formatJournalLine(e: JournalEntry): string {
  const day = (e.date ?? "").slice(0, 10);
  const who = [e.company, e.role].filter(Boolean).join(" — ");
  const tags = e.signals.length ? ` _[${e.signals.join(", ")}]_` : "";
  const mood = e.sentiment ? ` (${e.sentiment})` : "";
  const inferred = e.origin === "inferred" ? ` ${INFERRED_TAG}` : "";
  return `- ${day} · **${e.type}**${who ? ` · ${who}` : ""} — ${e.summary}${tags}${mood}${inferred}`;
}

/**
 * Render a compact, prompt-ready digest of recent career-journal signals.
 *
 * This is how the accruing KB *compounds visibly*: the raw journal is part of
 * the full KB JSON, but models attend to a short, clearly-labeled section far
 * better than to a nested array buried in a large blob. So we surface the most
 * recent N entries plus a tally of recurring signals, with explicit guidance to
 * use them (and not to fabricate from them).
 *
 * When the caller knows which company the work is for, that company's entries
 * come first and the rest of the window is the most recent others. Without it,
 * prep for a second Veridian round could show six newer notes about other
 * companies and none of the debrief from the first round.
 *
 * Returns "" when there is nothing to show, so callers can inject it
 * unconditionally without adding an empty heading on first-run KBs.
 */
export function formatSignalDigest(
  journal: JournalEntry[] | undefined,
  limit = 6,
  company?: string,
): string {
  if (!journal || journal.length === 0) return "";

  // Append order is capture order, so reversing gives newest first.
  const newestFirst = [...journal].reverse();
  const want = company?.trim() ? normCompany(company) : "";
  const forCompany = want
    ? newestFirst.filter((e) => e.company !== undefined && normCompany(e.company) === want)
    : [];
  const others = newestFirst.filter((e) => !forCompany.includes(e));
  const recent = [...forCompany, ...others].slice(0, limit);
  const companyCount = Math.min(forCompany.length, limit);

  const lines = recent.map(formatJournalLine);

  // Recurring signals across the WHOLE journal, not just the recent window —
  // a pattern is only a pattern if it repeats over time.
  const tally = new Map<string, number>();
  for (const e of journal) {
    for (const s of e.signals) tally.set(s, (tally.get(s) ?? 0) + 1);
  }
  const recurring = [...tally.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([s, n]) => `${s} ×${n}`);

  const parts = [
    `## Recent Career Signals (from your journal — ${recent.length} of ${journal.length})`,
    `Patterns captured from real interactions. Weave in recurring **strengths**; be mindful of noted **gaps/patterns**. Treat as context — don't fabricate claims from these.`,
  ];
  if (companyCount > 0) {
    parts.push(`The first ${companyCount === 1 ? "entry is" : `${companyCount} entries are`} about ${company!.trim()}.`);
  }
  parts.push("", ...lines);
  if (recurring.length) parts.push("", `**Recurring signals:** ${recurring.join(", ")}`);

  return parts.join("\n") + "\n";
}
