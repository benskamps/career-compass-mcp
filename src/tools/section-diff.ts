import type { CareerSection } from "../storage/file-store.js";

/**
 * What a save_career_section call would change, compared with what is stored.
 *
 * The tool replaces a whole section, and its description asks the model to send
 * the complete list. When the model hadn't read the section first, or read it
 * while it was unreadable, a save of one new entry silently wiped the rest and
 * the user was told only "✅ Saved experience (1 entry)". This diff is what lets
 * the tool refuse that, and lets every save end with a receipt.
 */
export interface SectionDiff {
  before: number;
  after: number;
  added: string[];
  removed: string[];
  /** Experience only: achievements across all roles, before and after. */
  achievementsBefore?: number;
  achievementsAfter?: number;
}

type Entry = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** A human label that also serves as the identity of a list entry. */
export function entryLabel(section: CareerSection, e: Entry): string {
  switch (section) {
    case "experience":
      return `${str(e.role)} at ${str(e.company)}`;
    case "education":
      return `${str(e.degree)}, ${str(e.institution)}`;
    case "testimonials":
      return `${str(e.source)}${str(e.relationship) ? ` (${str(e.relationship)})` : ""}`;
    default:
      return str(e.name) || JSON.stringify(e).slice(0, 60);
  }
}

function key(section: CareerSection, e: Entry): string {
  return entryLabel(section, e).toLowerCase().replace(/\s+/g, " ");
}

function achievements(list: Entry[]): number {
  return list.reduce((n, e) => n + (Array.isArray(e.achievements) ? e.achievements.length : 0), 0);
}

export function diffSection(section: CareerSection, current: unknown, next: unknown): SectionDiff | null {
  if (section === "profile") return null;
  const before = Array.isArray(current) ? (current as Entry[]) : [];
  const after = Array.isArray(next) ? (next as Entry[]) : [];
  const beforeKeys = new Set(before.map((e) => key(section, e)));
  const afterKeys = new Set(after.map((e) => key(section, e)));
  const diff: SectionDiff = {
    before: before.length,
    after: after.length,
    added: after.filter((e) => !beforeKeys.has(key(section, e))).map((e) => entryLabel(section, e)),
    removed: before.filter((e) => !afterKeys.has(key(section, e))).map((e) => entryLabel(section, e)),
  };
  if (section === "experience") {
    diff.achievementsBefore = achievements(before);
    diff.achievementsAfter = achievements(after);
  }
  return diff;
}

/** True when the save would lose something already stored. */
export function losesData(d: SectionDiff | null): boolean {
  if (!d) return false;
  if (d.removed.length > 0 || d.after < d.before) return true;
  return (d.achievementsAfter ?? 0) < (d.achievementsBefore ?? 0);
}

function list(items: string[], max = 5): string {
  const shown = items.slice(0, max).join("; ");
  return items.length > max ? `${shown}; and ${items.length - max} more` : shown;
}

/** One-line receipt: "3 → 4 entries · added: … · removed: none". */
export function describeDiff(d: SectionDiff): string {
  const parts = [`${d.before} → ${d.after} ${d.after === 1 ? "entry" : "entries"}`];
  if (d.achievementsBefore !== undefined && d.achievementsAfter !== undefined && d.achievementsBefore !== d.achievementsAfter) {
    parts.push(`achievements ${d.achievementsBefore} → ${d.achievementsAfter}`);
  }
  parts.push(d.added.length ? `added: ${list(d.added)}` : "added: none");
  parts.push(d.removed.length ? `removed: ${list(d.removed)}` : "removed: none");
  return parts.join(" · ");
}
