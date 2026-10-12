import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ATS_HYGIENE, ATS_SYSTEM_NOTES } from "../tools/resume.js";

/**
 * The evidence sheet is the only place hiring statistics may come from.
 *
 * The skills quote odds (referrals, fresh postings, countering an offer) to steer
 * what the user does next. A number with no source is exactly the folklore the
 * research page debunked ("75% rejected by ATS"), so every row names its source,
 * the folklore list stays, and the skill points at the sheet instead of carrying
 * its own copies.
 */

const SKILL_DIR = fileURLToPath(new URL("../../plugin/skills/career-compass", import.meta.url));
const sheet = readFileSync(path.join(SKILL_DIR, "evidence.md"), "utf-8");
const skill = readFileSync(path.join(SKILL_DIR, "SKILL.md"), "utf-8");

describe("evidence sheet", () => {
  it("gives every table row a source", () => {
    const rows = sheet.split("\n").filter((l) => l.startsWith("|") && !/^\|\s*-/.test(l) && !/^\|\s*(Lever|Fact)\s*\|/.test(l));
    expect(rows.length).toBeGreaterThan(10);
    for (const row of rows) {
      const cells = row.split("|").map((c) => c.trim()).filter(Boolean);
      expect(cells, row).toHaveLength(3);
      expect(cells[2].length, row).toBeGreaterThan(3);
    }
  });

  it("keeps the folklore list, so the famous wrong numbers stay named as wrong", () => {
    expect(sheet).toContain("## Folklore: never quote these as fact");
    expect(sheet).toContain("75% of résumés are rejected");
    expect(sheet).toContain("6 seconds");
  });

  it("is what the main skill points to, with a rule against quoting anything else", () => {
    expect(skill).toContain("`evidence.md` in this skill's folder");
    expect(skill).toContain("quote no other hiring statistic");
  });
});

describe("format_for_ats notes cite what vendors document", () => {
  it("names the documented auto-reject point and Greenhouse's parse limit", () => {
    expect(ATS_HYGIENE).toContain("2.5 MB");
    expect(ATS_HYGIENE).toContain("Screening questions");
    expect(ATS_SYSTEM_NOTES.workday).toContain("doesn't fill the Skills field");
    expect(ATS_SYSTEM_NOTES.greenhouse).toContain("auto-reject");
  });
});

describe("employer AI-use rules", () => {
  it("the drafting tools and the chat skill switch to refine-only when a policy is in view", async () => {
    const { AI_POLICY_RULE } = await import("../tools/truth-rule.js");
    expect(AI_POLICY_RULE).toContain("don't write this from scratch");
    expect(AI_POLICY_RULE).toContain("Never claim a company has or lacks such a policy");
    const resumeSrc = readFileSync(fileURLToPath(new URL("../tools/resume.ts", import.meta.url)), "utf-8");
    expect(resumeSrc.match(/\$\{AI_POLICY_RULE\}/g)?.length).toBe(3);
    expect(skill).toContain("**Employer AI-use rules.**");
  });
});
