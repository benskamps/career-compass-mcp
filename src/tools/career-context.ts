import type { CareerData, NarrativeEntry, Story } from "../schemas/career-schema.js";

type StoryUse = Story["usedWith"][number];

/**
 * Career facts the drafting and fit tools hand to the model.
 *
 * Every line names its employer, and roles carry their scope (team size, budget)
 * from the summary. When a tool passed only role titles and skills, the model
 * rightly said "your KB doesn't show a budget or team size" to a user whose KB
 * does show them. Whatever the model can't see, it tells the user is missing.
 */

/** Each role with its dates and scope summary, newest first as stored. */
export function formatRoles(career: CareerData, max = 5): string {
  return career.experience.slice(0, max).map(e => {
    const summary = e.summary?.replace(/\s+/g, " ").trim();
    return `- **${e.role} @ ${e.company}** (${e.startDate} to ${e.endDate})${summary ? `: ${summary}` : ""}`;
  }).join("\n") || "- None listed";
}

/** Achievements, each tagged with the role and employer it belongs to. */
export function formatAchievements(career: CareerData, perRole = 3, max = 12): string {
  return career.experience
    .flatMap(e => e.achievements.slice(0, perRole).map(a =>
      `- **${e.role} @ ${e.company}**: ${a.metric}${a.impact ? ` → ${a.impact}` : ""}`))
    .slice(0, max)
    .join("\n") || "- None recorded yet";
}

/** Degrees, programs and certifications, with the coursework that shows domain depth. */
export function formatCredentials(career: CareerData): string {
  return career.education.map(ed => {
    const parts = [`- ${ed.degree}, ${ed.institution}${ed.date ? ` (${ed.date})` : ""}`];
    if (ed.relevantCoursework?.length) parts.push(`  - Coursework: ${ed.relevantCoursework.join(", ")}`);
    if (ed.certifications.length) parts.push(`  - Certifications: ${ed.certifications.join("; ")}`);
    return parts.join("\n");
  }).join("\n") || "- None listed";
}

/** Projects with what the user did and what came of it, as stored. */
export function formatProjects(career: CareerData, max = 6): string {
  return career.projects.slice(0, max).map(p => {
    const facts = [...p.metrics, ...p.outcomes].join("; ");
    return `- **${p.name}** (${p.role}): ${p.description.replace(/\s+/g, " ").trim()}${facts ? ` Results: ${facts}` : ""}`;
  }).join("\n") || "- None listed";
}

/** What other people said, verbatim, with who said it. */
export function formatTestimonials(career: CareerData, max = 5): string {
  return career.testimonials.slice(0, max).map(t =>
    `- ${t.source} (${t.relationship}): "${t.quote}"${t.context ? ` (on ${t.context})` : ""}`,
  ).join("\n") || "- None recorded";
}

// ─── Narrative ("your story, once") ───────────────────────────────────────────

const NARRATIVE_LABEL: Record<NarrativeEntry["topic"], string> = {
  why_looking: "Why I'm looking",
  why_left: "Why I left",
  gap: "The gap",
  switch: "The switch",
  work_authorization: "Work authorization",
  notice_period: "Notice period",
  optimizing_for: "What I'm optimizing for",
  other: "Other",
};

/** Saved narrative entries, each quoted exactly as stored. "" when there are none. */
export function formatNarrative(career: CareerData): string {
  return career.narrative.map(n =>
    `- **${NARRATIVE_LABEL[n.topic]}:** "${n.text.replace(/\s+/g, " ").trim()}"${n.updated ? ` (saved ${n.updated})` : ""}`,
  ).join("\n");
}

/**
 * The narrative section for a tool that drafts in the user's voice (cover
 * letter, interview prep). The truth rule forbids inventing why someone left or
 * what a gap was, so without this every letter carried a placeholder and every
 * prep asked again. With it, the user's own words are quoted, never reworded
 * into a claim they didn't make. Printed even when empty, because the "ask once
 * and offer to save" half is what fills it.
 */
export function narrativeBlock(career: CareerData): string {
  const saved = formatNarrative(career);
  const ask =
    "If the draft needs one of these topics and it isn't here (why I'm looking, why I left, a gap, a switch, " +
    "work authorization, notice period), use a [confirm: ...] placeholder or ask me once, then offer to save my " +
    "answer to `narrative` with save_career_section.";
  if (!saved) return `## My story (saved narrative)\nNone saved yet. ${ask}`;
  return `## My story, in my own words (saved narrative)
${saved}
Quote these verbatim where the draft needs them; never paraphrase them into new claims or add reasons they don't give. ${ask}`;
}

// ─── Story bank ───────────────────────────────────────────────────────────────

/** Who the next telling is for: the process, the company, the people in the room. */
export interface StoryAudience {
  applicationId?: string;
  company?: string;
  /** Names, or free text that may contain them ("Priya Shah, VP Ops"). */
  interviewers?: string[];
}

function norm(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Did this recorded telling happen in front of this audience? */
function heardBy(use: StoryUse, audience: StoryAudience): boolean {
  if (use.applicationId && audience.applicationId && use.applicationId === audience.applicationId) return true;
  if (use.company && audience.company && norm(use.company) === norm(audience.company)) return true;
  if (use.interviewer && audience.interviewers?.length) {
    const who = norm(use.interviewer);
    return who !== "" && audience.interviewers.some(i => norm(i).includes(who));
  }
  return false;
}

/** "Veridian Health, panel, 2026-06-17": where a telling happened, as recorded. */
export function storyUseLabel(use: StoryUse): string {
  return [use.company, use.round, use.date].filter(Boolean).join(", ");
}

/** Every recorded telling of a saved story to this audience. */
export function storiesAlreadyHeard(career: CareerData, audience: StoryAudience): Array<{ story: Story; use: StoryUse }> {
  return career.stories.flatMap(story =>
    story.usedWith.filter(use => heardBy(use, audience)).map(use => ({ story, use })));
}

/** One story on one line, its STAR parts as stored, so it can be reused word for word. */
function storyLine(s: Story): string {
  const parts: Array<[string, string | undefined]> = [["S", s.situation], ["T", s.task], ["A", s.action], ["R", s.result]];
  const body = s.text?.trim()
    ? s.text.replace(/\s+/g, " ").trim()
    : parts
        .filter(([, v]) => v?.trim())
        .map(([k, v]) => `${k}: ${v!.replace(/\s+/g, " ").trim()}`)
        .join(" ");
  const clipped = body.length > 600 ? `${body.slice(0, 600)}…` : body;
  const from = [s.sourceRole, s.sourceCompany].filter(Boolean).join(" @ ");
  const themes = s.themes.length ? ` [${s.themes.join(", ")}]` : "";
  return `- **${s.title}**${themes}${from ? ` (from ${from})` : ""}${clipped ? `: ${clipped}` : ""}`;
}

/** The one sentence that tells the model how to record a telling, with the user's OK. */
export const RECORD_STORY_USE =
  "After the round, offer to record which stories I told and to whom: with my OK, call save_career_section " +
  "with section `stories` and the full list, adding a usedWith entry { applicationId, company, round, interviewer, date } " +
  "to each story told.";

/**
 * The saved stories, compact, plus which of them this audience has already
 * heard. Interviewers compare notes: the capacity-turnaround story told to
 * Priya in the panel is the one story the final round should not get again,
 * and nothing but `usedWith` remembers that.
 */
export function storyBankBlock(career: CareerData, audience: StoryAudience, max = 10): string {
  if (career.stories.length === 0) {
    return `## Story bank\nNo saved stories yet. For each new story you write, offer once to save it to \`stories\`. ${RECORD_STORY_USE}`;
  }
  const lines = career.stories.slice(0, max).map(storyLine);
  const more = career.stories.length > max ? `\n(${career.stories.length - max} more saved stories not shown.)` : "";
  const heard = storiesAlreadyHeard(career, audience).map(({ story, use }) =>
    `- "${story.title}": ${use.interviewer ? `you told ${use.interviewer} that one already` : "already told in this process"}` +
    `${storyUseLabel(use) ? ` (${storyUseLabel(use)})` : ""}`);
  return `## Story bank (saved stories)
${lines.join("\n")}${more}
${heard.length ? `\n**Already heard by this company or these interviewers — pick others:**\n${heard.join("\n")}\n` : ""}
Reuse a saved story verbatim where one fits before writing a new one${heard.length ? ", and don't reuse one this audience has already heard" : ""}. For any new story you write, offer once to save it to \`stories\`. ${RECORD_STORY_USE}`;
}
