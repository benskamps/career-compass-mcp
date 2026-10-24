/**
 * One answer to "is this the same company?" for every tool.
 *
 * pipeline.ts matched "Acme, Inc." to "acme" (suffixes, accents, "&"), but
 * generate_cover_letter and answer_application compared lowercased strings, and
 * prepare_interview, interview_arc, the journal digest and the story bank only
 * stripped punctuation. An application saved as "Acme, Inc." was then invisible
 * to a prep asked for "Acme": no cached posting, no rounds, no notes, and stories
 * the company already heard offered again.
 */

const COMPANY_SUFFIXES = /\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|gmbh|plc|pbc)\b/g;

/** "Acme, Inc." and "acme" are one company; "Sr. PM" and "sr pm" are one role. */
export function normalizeName(s: string, kind: "company" | "role" = "role"): string {
  let t = s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ");
  t = t.replace(/[^\p{L}\p{N}]+/gu, " ");
  const plain = t.replace(/\s+/g, " ").trim();
  if (kind !== "company") return plain;
  // A name that is nothing but a suffix ("Company") keeps its words rather than
  // normalizing to "" and matching every other such name.
  return t.replace(COMPANY_SUFFIXES, " ").replace(/\s+/g, " ").trim() || plain;
}

/** Same company by normalizeName. Blank never matches. */
export function sameCompany(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const x = normalizeName(a, "company");
  return x !== "" && x === normalizeName(b, "company");
}

/** Same role title by normalizeName. Blank never matches. */
export function sameRole(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const x = normalizeName(a);
  return x !== "" && x === normalizeName(b);
}
