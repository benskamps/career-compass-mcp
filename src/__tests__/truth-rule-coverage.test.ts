import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/**
 * Every tool that drafts words in the user's voice must carry TRUTH_RULE.
 *
 * The 2.9.7 changelog claimed the rejection reply, the recruiter reply draft,
 * interview_arc and format_for_ats carried it; none did, and the one honesty
 * failure in that release's eval was a rejection draft inventing a feeling.
 * This reads each tool's registration block from source so a new drafting tool
 * has to be listed here, and a listed one can't quietly drop the rule.
 */
const DRAFTING_TOOLS = [
  "explore_opportunity",
  "tailor_resume",
  "generate_cover_letter",
  "format_for_ats",
  "classify_email",
  "prepare_interview",
  "interview_arc",
  "evaluate_offer",
  "generate_rejection_response",
];

const toolsDir = fileURLToPath(new URL("../tools", import.meta.url));

function registrationBlocks(): Map<string, string> {
  const blocks = new Map<string, string>();
  for (const file of readdirSync(toolsDir).filter((f) => f.endsWith(".ts"))) {
    const src = readFileSync(join(toolsDir, file), "utf-8");
    const parts = src.split(/server\.registerTool\(\s*/);
    for (const part of parts.slice(1)) {
      const name = part.match(/^"([a-z_]+)"/)?.[1];
      if (name) blocks.set(name, part);
    }
  }
  return blocks;
}

describe("truth rule coverage", () => {
  const blocks = registrationBlocks();
  for (const tool of DRAFTING_TOOLS) {
    it(`${tool} appends TRUTH_RULE`, () => {
      expect(blocks.has(tool), `${tool} not found`).toBe(true);
      expect(blocks.get(tool)).toContain("${TRUTH_RULE}");
    });
  }
});
