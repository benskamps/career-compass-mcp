import type { CareerData } from "../schemas/career-schema.js";

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
