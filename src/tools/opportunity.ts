import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadCareerData } from "../storage/file-store.js";
import { formatSignalDigest } from "./signal-digest.js";
import { embedUntrusted } from "../untrusted.js";
import { noCareerDataMessage } from "../empty-state.js";
import type { CareerData } from "../schemas/career-schema.js";

export function registerOpportunityTools(server: McpServer): void {

  server.registerTool(
    "explore_opportunity",
    {
      title: "Explore Opportunity",
      // Reads the Career KB and returns an analysis. Writes nothing.
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      description: "Analyze a job posting against your Career KB and your stated preferences — salary band, remote/relocation, notice period. Returns an honest fit verdict (checked against the job board's own label, if you supply it), matched strengths, gaps, talking points, and a 'day in the life' brief.",
      inputSchema: {
        posting: z.string().describe("Full job posting text, or paste the raw text from a job board"),
        company: z.string().optional().describe("Company name (if not in posting)"),
        notes: z.string().optional().describe("Any additional context about this opportunity"),
        sourceFitLabel: z.string().optional().describe("The fit label the job board showed, e.g. 'LinkedIn: strong match' or 'Indeed: 62% match' — the analysis will explicitly agree or disagree with it"),
      },
    },
    async ({ posting, company, notes, sourceFitLabel }) => {
      const career = await loadCareerData();
      if (!career) {
        return {
          content: [{
            type: "text",
            text: noCareerDataMessage(),
          }],
        };
      }

      const careerSummary = buildCareerSummary(career);

      return {
        content: [{
          type: "text",
          text: `# Opportunity Analysis

## Career Context
${careerSummary}

${formatSignalDigest(career.journal)}
## Job Posting
${embedUntrusted("job posting", posting)}
${company ? `\n**Company:** ${company}` : ""}
${notes ? `\n**Notes:** ${embedUntrusted("user notes", notes)}` : ""}
${sourceFitLabel ? `\n## Fit Label From the Job Board\nThis is the job board's claim about the match, not a fact. It is frequently wrong in both directions.\n${embedUntrusted("source fit label", sourceFitLabel)}` : ""}

---

**Instructions for Claude:**
Assess this posting against the career context above. The job of this tool is an *honest*
verdict, not an encouraging one. Job boards score fit from keyword overlap and get it wrong
in both directions — they call a role a strong match when it pays below the floor, and they
bury a role that actually fits. So check the posting against the whole preference contract
above (salary band, remote, relocation, notice period, target company size), not just the
role titles and skills.

One rule governs the whole contract: **"not set" means the user has not told us, and an
unanswered question is never a constraint.** Do not fill it in with a sensible-sounding
default, do not reason as if the answer were "no", and do not let it move the fit score in
either direction. Name what is missing and ask for it. Inventing a preference and then
ruling a job out on it is the exact failure this tool exists to prevent.

### 1. Fit Score (X/10)
Overall match with a one-line rationale. Score against the *whole* contract: a role that
matches on skills but misses the salary floor or the location constraint is not an 8.

### 2. Compensation Check
Compare the posting's compensation to the salary band above, explicitly:
- Quote the posting's number or range, then say **above the band / inside the band / below the floor**, with the figures side by side.
- If the posting gives no compensation at all, say **"posting silent on comp"** in those words. Do not infer, estimate, or borrow a number from elsewhere. Say when in the process to ask, and what to ask for.
- If the band above reads "not set", say so plainly and note that the compensation half of this verdict is unverifiable until it is filled in.

### 3. Location & Remote Check
Compare the posting's location and onsite expectation to **Open to remote** and **Open to relocation** above:
- **If either reads "not set", the user has never answered it.** Do not treat it as a constraint, do not assume a default, and do not rule the role in or out on it. Say which answer is missing and ask for it — an unanswered question is not a "no".
- Onsite or hybrid in a place they have **stated** they will not relocate to → that is a blocker, name it as one, not as a footnote.
- Remote role and they have stated they are open to remote → say it is clear, and check whether the posting hides a geographic or timezone restriction.
- Posting vague or silent on location → say so and put it at the top of the questions to ask.

### 4. Skills Match
5-7 specific points where the background directly maps to what they are asking for. Quote from both the posting and the career history.

### 5. Skill Gaps
Every requirement in the posting that the career context does not evidence. For each: (a) how significant, (b) whether it is a dealbreaker, (c) how to address it. Do not soften this section — an unlisted gap is one they find in the interview instead.

### 6. Verdict vs. the Source Label
${sourceFitLabel
  ? `Open this section with exactly one of: **Agree with the label**, **Disagree — the board is over-calling this**, or **Disagree — the board is under-calling this**. Then justify it against sections 2, 3, and 5, and rule in both directions:
- Board says strong match, but comp misses the floor / location is a blocker / a dealbreaker gap exists → say the board is wrong, and say which check it ignored.
- Board says weak or partial match, but the preference contract and the skills actually line up → say the board is wrong, and say what it under-weighted (career-changer profiles and non-obvious title mappings are where boards fail most).
- If you agree, say so plainly and name the single thing that would flip the verdict.`
  : `No job-board label was supplied for this posting. State the label you would expect a keyword-matching board to show for it, and where that matcher would most likely mislead — over-calling on title overlap, or under-calling because the transferable evidence is worded differently. Re-run this tool with \`sourceFitLabel\` to check a specific board's claim.`}

### 7. Talking Points
5 things to lead with in conversations about this role, framing the background in their language.

### 8. Day in the Life
Based on the posting, describe the first 90 days and a typical week in this role. What problems would they own? What would success look like?

### 9. Red Flags / Questions
Anything in the posting that warrants clarification or concern.

### 10. Verdict
Pursue or not? The strategic case for or against, stated in one paragraph. If any check in sections 2, 3, or 5 came back as a blocker, the verdict has to reckon with it rather than route around it.`,
        }],
      };
    }
  );

  server.registerTool(
    "research_company",
    {
      title: "Research Company",
      // Reads the pipeline for context and returns a brief. Writes nothing.
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      description: "Build an intelligence brief on a company: product, funding, culture, tech stack, interview process, and strategic fit with your goals.",
      inputSchema: {
        company: z.string().describe("Company name"),
        role: z.string().optional().describe("The role you're targeting"),
        applicationId: z.string().optional().describe("Pipeline application ID for additional context"),
      },
    },
    async ({ company, role, applicationId }) => {
      const career = await loadCareerData();
      const profile = career?.profile;

      return {
        content: [{
          type: "text",
          text: `# Company Research Brief: ${company}

**Target role:** ${role ?? "Not specified"}
${applicationId ? `**Application:** career://pipeline/${applicationId}` : ""}

**My target criteria (from Career KB):**
${profile ? `- Target roles: ${profile.targetRoles.join(", ") || "Not specified"}
- Target industries: ${profile.targetIndustries.join(", ") || "Not specified"}
- Remote preference: ${(profile.openToRemote ?? true) ? "Open to remote" : "Prefers onsite"}` : "Career KB not loaded"}

---

**Instructions for Claude:**
Use web search to build a comprehensive company brief covering:

### 1. Company Overview
- What they do (product/service, customer, business model)
- Stage: founding year, funding, headcount, public/private
- Recent news (last 6 months)

### 2. Culture & Environment
- Glassdoor / Blind sentiment (themes, not just score)
- Leadership style and management philosophy
- Known for: what do employees rave about? Complain about?

### 3. Tech & Process
- Tech stack (if engineering role)
- Known engineering practices / processes
- Product maturity: hypergrowth vs. scaled

### 4. Interview Process
- Known interview stages and format
- Common questions (from Glassdoor, Blind, LeetCode forums)
- Timeline from application to offer

### 5. Strategic Fit
- How does this company connect to my target roles and industries?
- What's the career trajectory from this role?
- Risks: stability, runway, market position

### 6. Conversation Starters
5 things I can mention in interviews that show I've done my homework.`,
        }],
      };
    }
  );
}

/** Group digits without depending on ICU being present in the host's Node build. */
function money(amount: number): string {
  return Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * The user's stated hard constraints, rendered for the prompt.
 *
 * These live in `profile.yaml` and, until this existed, reached exactly one
 * prompt path: `research_company` printed `openToRemote` and nothing else. So
 * `explore_opportunity` — the tool whose entire output is a fit verdict — scored
 * fit on roles, industries and skills, and never once saw the salary floor or
 * the relocation answer. That is the same keyword-overlap fit a job board
 * computes, which is precisely what the user came here to have checked.
 *
 * Absent values are printed as "not set" rather than omitted. A missing line
 * reads as "no constraint" to a model; "not set" reads as "unknown", which is
 * the truth, and lets the instructions ask for the gap to be named.
 *
 * The two booleans need that distinction more than anything else here, and used
 * to lose it. They were `z.boolean().default(…)`, so an unanswered profile
 * parsed to `openToRemote: true, openToRelocation: false` and this function
 * printed "yes"/"no" — indistinguishable from a stated answer, under a heading
 * calling them hard constraints, with section 3 downstream instructed to treat a
 * location mismatch as a blocker. A first-run profile is name + summary only, so
 * the tool ruled roles out on a preference the user had never given. They are
 * `.optional()` now and `undefined` prints as "not set" like everything else.
 */
function buildPreferenceContract(profile: CareerData["profile"]): string {
  const currency = profile.salaryCurrency || "USD";
  const { salaryMin: min, salaryMax: max } = profile;
  const band =
    min !== undefined && max !== undefined ? `${currency} ${money(min)}–${money(max)}`
    : min !== undefined ? `${currency} ${money(min)} floor (no ceiling set)`
    : max !== undefined ? `up to ${currency} ${money(max)} (no floor set)`
    : "not set";

  const stated = (value: boolean | undefined) =>
    value === undefined ? "not set" : value ? "yes" : "no";

  return `**Salary band:** ${band}
**Open to remote:** ${stated(profile.openToRemote)}
**Open to relocation:** ${stated(profile.openToRelocation)}
**Notice period:** ${profile.noticePeriod || "not set"}
**Target company size:** ${profile.targetCompanySize.join(", ") || "not set"}`;
}

function buildCareerSummary(career: Awaited<ReturnType<typeof loadCareerData>>): string {
  if (!career) return "No career data available.";
  const { profile, experience, skills } = career;

  const topSkills = skills.slice(0, 10).map(s => s.name).join(", ");
  const recentRoles = experience.slice(0, 3).map(e => `${e.role} at ${e.company}`).join("; ");

  return `**Name:** ${profile.name}
**Summary:** ${profile.summary}
**Recent roles:** ${recentRoles || "None listed"}
**Key skills:** ${topSkills || "None listed"}
**Target roles:** ${profile.targetRoles.join(", ") || "Not specified"}
**Target industries:** ${profile.targetIndustries.join(", ") || "Not specified"}

**Preference contract — the hard constraints this fit must be checked against:**
${buildPreferenceContract(profile)}`;
}
