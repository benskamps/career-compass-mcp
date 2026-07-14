import type { JournalEntry } from "../schemas/career-schema.js";

/**
 * Render a compact, prompt-ready digest of recent career-journal signals.
 *
 * This is how the accruing KB *compounds visibly*: the raw journal is part of
 * the full KB JSON, but models attend to a short, clearly-labeled section far
 * better than to a nested array buried in a large blob. So we surface the most
 * recent N entries plus a tally of recurring signals, with explicit guidance to
 * use them (and not to fabricate from them).
 *
 * Returns "" when there is nothing to show, so callers can inject it
 * unconditionally without adding an empty heading on first-run KBs.
 */
export function formatSignalDigest(
  journal: JournalEntry[] | undefined,
  limit = 6,
): string {
  if (!journal || journal.length === 0) return "";

  const recent = journal.slice(-limit).reverse();

  const lines = recent.map((e) => {
    const day = (e.date ?? "").slice(0, 10);
    const who = [e.company, e.role].filter(Boolean).join(" — ");
    const tags = e.signals.length ? ` _[${e.signals.join(", ")}]_` : "";
    const mood = e.sentiment ? ` (${e.sentiment})` : "";
    return `- ${day} · **${e.type}**${who ? ` · ${who}` : ""} — ${e.summary}${tags}${mood}`;
  });

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
    "",
    ...lines,
  ];
  if (recurring.length) parts.push("", `**Recurring signals:** ${recurring.join(", ")}`);

  return parts.join("\n") + "\n";
}
