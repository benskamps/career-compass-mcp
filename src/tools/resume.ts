import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadCareerData, loadPipeline } from "../storage/file-store.js";
import { guardedRead } from "./read-guard.js";
import { formatSignalDigest } from "./signal-digest.js";
import { embedUntrusted } from "../untrusted.js";
import { noCareerDataMessage } from "../empty-state.js";
import { TRUTH_RULE } from "./truth-rule.js";
import { formatRoles, formatAchievements, formatCredentials, formatProjects, narrativeBlock } from "./career-context.js";
import { KB_OVER_PASTED, PASTED_RESUME_CLOSE, workFromPastedResume } from "./opportunity.js";
import type { CareerData } from "../schemas/career-schema.js";

export function registerResumeTools(server: McpServer): void {

  server.registerTool(
    "tailor_resume",
    {
      title: "Tailor Resume",
      // Reads the Career KB and returns resume content. Writes nothing.
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      description: "Write a résumé tailored to one job posting from the user's saved Career KB: the posting's vocabulary, the most " +
        "relevant real achievements first, nothing invented, and [confirm: ...] placeholders where a fact is missing. " +
        "Returns the résumé text first, then a keyword match report. Use it when the user wants a résumé for a specific " +
        "posting. Before anything is saved, pass the résumé they pasted as `resume` and it tailors from that. Use " +
        "format_for_ats afterwards for a specific applicant system's fields. Writes nothing.",
      inputSchema: {
        posting: z.string().describe("Full job posting text"),
        format: z.enum(["standard", "federal", "academic", "functional"]).default("standard").describe("Resume format"),
        pages: z.number().min(1).max(4).default(2).describe("Target page count"),
        includeProjects: z.boolean().default(true).describe("Include projects section"),
        focusAreas: z.string().optional().describe("Specific areas to emphasize, e.g. 'leadership, data analysis'"),
        company: z.string().optional().describe("Company the posting is for, if known. Journal notes about this company are shown first."),
        resume: z.string().optional().describe(
          "The résumé text the user pasted in this conversation. Used only when no Career KB with experience is " +
            "saved yet, so the first tailored résumé works before anything is saved.",
        ),
      },
    },
    async ({ posting, format, pages, includeProjects, focusAreas, company, resume }) => {
      const read = await guardedRead(() => loadCareerData());
      if (!read.ok) return read.response;
      const career = read.value;
      const fromPasted = workFromPastedResume(career, resume);
      if (!career && !fromPasted) {
        return {
          content: [{ type: "text", text: noCareerDataMessage({ resumeParam: "resume" }) }],
        };
      }

      // A pasted résumé is fenced like every other pasted span; see
      // buildPastedSummary in opportunity.ts for why the user's own text is too.
      const source = fromPasted
        ? `No saved Career KB with work history yet, so this works from the résumé the user pasted:\n\n${embedUntrusted("pasted résumé", resume!)}`
        : `${formatResumeSource(career!)}${resume?.trim() ? `\n\n${KB_OVER_PASTED}` : ""}`;

      return {
        content: [{
          type: "text",
          text: `# Resume Tailoring Request

## Career KB
${source}

${formatSignalDigest(career?.journal, 6, company)}
## Job Posting
${embedUntrusted("job posting", posting)}

## Output Requirements
- **Format:** ${format}
- **Length:** ${pages} page(s)
- **Include projects:** ${includeProjects}
${focusAreas ? `- **Emphasis areas:** ${focusAreas}` : ""}

---

**Instructions for Claude:**
Using the Career KB above, generate a tailored resume:

**Structure for ${format} format:**
${format === "standard" ? `1. Header (name, contact, LinkedIn)
2. Professional Summary (3-4 sentences, bridging background to this role)
3. Core Competencies (only skills in the Career KB, in the posting's wording where it names the same skill)
4. Professional Experience (reverse chronological, achievement-focused)
5. ${includeProjects ? "Key Projects\n6. Education & Certifications" : "Education & Certifications"}` : ""}
${format === "federal" ? `1. Header with full contact info
2. Work Experience (detailed, with hours per week, supervisor info)
3. Education
4. Certifications & Training
5. Skills Matrix` : ""}
${format === "academic" ? `1. Header & Contact Information
2. Research Profile / Executive Summary
3. Education & Credentials (degrees, dissertations, honors)
4. Academic Appointments & Research Experience
5. Publications & Peer-Reviewed Works
6. Grants, Fellowships & Awards
7. Teaching Experience, Advising & Curriculum Development
8. Invited Talks, Conference Presentations & Symposia
9. Professional Service, Editorial Roles & Affiliations` : ""}
${format === "functional" ? `1. Header
2. Professional Summary
3. Core Competencies by theme
4. Career Highlights (top 6-8 achievements regardless of employer)
5. Employment History (condensed)
6. Education` : ""}

**Rules:**
- Match the posting's language exactly where truthful
- Lead each achievement with an action verb
- Keep every number the Career KB gives; never add a number it doesn't
- ATS-safe: no tables, columns, headers/footers, graphics
- Do not fabricate — only use data from the Career KB
- Mark anything that needs my confirmation with a [confirm: ...] placeholder
- Industry-agnostic: use the posting's vocabulary, not my previous employer's

Output the full resume text first, ready to copy, then a short "Keyword Match Report" showing which posting requirements are covered and which aren't, then any [confirm: ...] questions in one list.
${fromPasted ? `\n${PASTED_RESUME_CLOSE}\n` : ""}
${TRUTH_RULE}`,
        }],
      };
    }
  );

  server.registerTool(
    "generate_cover_letter",
    {
      title: "Generate Cover Letter",
      // Reads the Career KB and returns letter content. Writes nothing.
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      description: "Draft a cover letter in the user's voice from their saved Career KB, built on real achievements that match the " +
        "role and quoting their saved narrative (why they're looking, a gap, a switch) word for word. Use it when the " +
        "user asks for a letter. Works from a pasted posting, from an application already in the pipeline (its cached " +
        "posting, role, and notes), or from just a company and role. Company claims come only from the posting or the " +
        "user. Writes nothing.",
      inputSchema: {
        posting: z.string().optional().describe("Full job posting text. Optional: without it, the cached posting from the pipeline is used, or the letter is written from the role and your history"),
        company: z.string().describe("Company name"),
        role: z.string().optional().describe("Role title, used to find the application in the pipeline and when there is no posting"),
        applicationId: z.string().optional().describe("Pipeline application ID, to use its cached posting and notes"),
        hiringManager: z.string().optional().describe("Hiring manager name if known"),
        tone: z.enum(["professional", "conversational", "enthusiastic", "concise"]).default("professional").describe("Voice of the letter. Match it to the company: professional for traditional or regulated employers, conversational for startups, enthusiastic when you genuinely want this one, concise when the posting asks for brevity."),
        angle: z.string().optional().describe("The key story or angle to lead with"),
      },
    },
    async ({ posting, company, role, applicationId, hiringManager, tone, angle }) => {
      // Note: `company` also orders the journal digest below (that company first).
      const read = await guardedRead(() => loadCareerData());
      if (!read.ok) return read.response;
      const career = read.value;
      if (!career) {
        return {
          content: [{ type: "text", text: noCareerDataMessage() }],
        };
      }

      // Asking a user to paste a posting the pipeline already holds, or refusing to
      // draft without one, was the top memory failure in the evals. Use what's saved.
      let appContext = "";
      if (!posting || applicationId) {
        const pipeRead = await guardedRead(() => loadPipeline());
        if (!pipeRead.ok) return pipeRead.response;
        const lc = (s: string) => s.trim().toLowerCase();
        const app = applicationId
          ? pipeRead.value.applications.find(a => a.id === applicationId)
          : pipeRead.value.applications.find(a =>
              lc(a.company) === lc(company) && (!role || lc(a.role) === lc(role)));
        if (app) {
          role = role ?? app.role;
          posting = posting ?? app.postingText;
          appContext = `
## From Your Pipeline
- **Role:** ${app.role}
- **Status:** ${app.status}${app.referral ? `\n- **Referral:** ${app.referral}` : ""}
- **Notes:** ${app.notes.length ? embedUntrusted("application notes", app.notes.join("; ")) : "None"}`;
        }
      }

      return {
        content: [{
          type: "text",
          text: `# Cover Letter Generation

## Career KB Summary
**Name:** ${career.profile.name}
**Summary:** ${career.profile.summary}
**Roles and scope:**
${formatRoles(career)}

**Top achievements (by role):**
${formatAchievements(career, 2, 8)}

${narrativeBlock(career)}

${formatSignalDigest(career.journal, 4, company)}
${posting ? `## Job Posting\n${embedUntrusted("job posting", posting)}` : `## Job Posting\nNone available. Write the letter from the role${role ? ` (${role})` : ""}, the company name, and my history. Do not ask me for the posting first: deliver the letter, then say in one line that pasting the posting would let you sharpen it.`}
${appContext}

## Parameters
- **Company:** ${company}${role ? `\n- **Role:** ${role}` : ""}
- **Hiring manager:** ${hiringManager ?? "Unknown (use 'Dear Hiring Team')"}
- **Tone:** ${tone}
${angle ? `- **Lead angle:** ${angle}` : ""}

---

**Instructions for Claude:**
Write a compelling cover letter. Structure:

**Opening (1 paragraph):** Hook with a specific achievement of mine, or something the posting says about ${company}, that connects to why I'm applying. Don't open with "I am writing to apply" or any version of "I'm applying for the X role".

**Body (2 paragraphs):**
- Para 1: My most relevant experience and its outcome, told plainly from the Career KB
- Para 2: Why ${company} specifically, using only what the posting, my notes, or I have said about them. If that's nothing, make the case about the role and the problems it owns rather than inventing facts about the company

**Closing (1 paragraph):** Confident call to action. Specific, not generic.

**Tone notes for ${tone}:**
${tone === "professional" ? "Polished, measured, authoritative" : ""}
${tone === "conversational" ? "Warm, direct, human — write like you talk" : ""}
${tone === "enthusiastic" ? "High energy, genuine excitement, mission-driven" : ""}
${tone === "concise" ? "Every sentence earns its place. Max 250 words total." : ""}

Keep it under 400 words. Make it feel human, not templated, through plain specific language rather than invented story: each sentence about me is either a fact from the Career KB or a plain statement of what I would bring or want. No scenes, causes, surprises, or lessons the Career KB doesn't give ("when results were stuck", "I didn't call it that at the time"), no "I've always…", and no claims about how I work today unless I am working today.

${TRUTH_RULE}`,
        }],
      };
    }
  );

  server.registerTool(
    "answer_application",
    {
      title: "Answer Application Questions",
      // Reads the Career KB and returns the material to answer from. Writes nothing.
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      description: "Answer the questions on a job application form (why this company, years of experience with X, work " +
        "authorization, salary expectation, start date, short essays) from the user's saved Career KB, each within its " +
        "character or word limit. Eligibility answers come only from what the user saved or said; anything else is a " +
        "[confirm: ...] placeholder, and a \"years with X\" the history can't support is flagged, never inflated. Use it " +
        "whenever the user pastes application or screening questions. Before anything is saved, pass the résumé they " +
        "pasted as `resume`. Writes nothing.",
      inputSchema: {
        questions: z.string().describe("The form's questions exactly as the user pasted them, with any character or word limits"),
        company: z.string().optional().describe("Company the application is for"),
        role: z.string().optional().describe("Role applied for"),
        posting: z.string().optional().describe("The job posting, if the user pasted it. Without it, the pipeline's cached posting is used when there is one"),
        resume: z.string().optional().describe(
          "The résumé text the user pasted in this conversation. Used only when no Career KB with experience is saved yet.",
        ),
      },
    },
    async ({ questions, company, role, posting, resume }) => {
      const read = await guardedRead(() => loadCareerData());
      if (!read.ok) return read.response;
      const career = read.value;
      const fromPasted = workFromPastedResume(career, resume);
      if (!career && !fromPasted) {
        return { content: [{ type: "text", text: noCareerDataMessage({ resumeParam: "resume" }) }] };
      }

      // The pipeline adds the cached posting and any notes about this company.
      // Best-effort: the form can be answered without it.
      let appContext = "";
      if (company) {
        const pipeRead = await guardedRead(() => loadPipeline());
        if (pipeRead.ok) {
          const lc = (t: string) => t.trim().toLowerCase();
          const app = pipeRead.value.applications.find(a =>
            lc(a.company) === lc(company) && (!role || lc(a.role) === lc(role)));
          if (app) {
            role = role ?? app.role;
            posting = posting ?? app.postingText;
            appContext = `\n## From Your Pipeline\n- **${app.role} at ${app.company}** (\`${app.id}\`, ${app.status})` +
              `${app.notes.length ? `\n- **Notes:** ${embedUntrusted("application notes", app.notes.join("; "))}` : ""}\n`;
          }
        }
      }

      const source = fromPasted
        ? `No saved Career KB with work history yet, so answer from the résumé the user pasted:\n\n${embedUntrusted("pasted résumé", resume!)}`
        : `${formatResumeSource(career!)}\n\n${eligibilityOnFile(career!)}\n\n${narrativeBlock(career!)}`;

      return {
        content: [{
          type: "text",
          text: `# Application Questions${company ? `: ${role ? `${role} at ` : ""}${company}` : ""}

## The questions
${embedUntrusted("application questions", questions)}

## Career KB
${source}
${appContext}${posting ? `\n## Job Posting\n${embedUntrusted("job posting", posting)}\n` : ""}
---

**Instructions for Claude:**
Answer every question, in order, in my voice. Under each answer show its length against the limit, like "(84/100 words)" or "(412/500 characters)".

- **From my history only.** Each answer uses facts from the Career KB above or from what I said in this conversation. Copy numbers exactly.
- **"Why this company" and other company questions:** build them on my real experience. Say something about ${company ?? "the company"} only if the posting, my notes, or I said it; otherwise leave a [confirm: what draws you to ${company ?? "them"}?] placeholder rather than inventing a mission, product, or value.
- **"Years of experience with X":** count only roles whose text above names X. If none do, say plainly that my history doesn't show X and leave the number as [confirm: ...]. Never round up, and never answer yes to a requirement my history doesn't show.
- **Eligibility is mine to answer:** work authorization or sponsorship, relocation, salary expectation, start date or notice. Use only what "Eligibility on file" or my saved narrative says, quoted as saved and noted as my call; otherwise a [confirm: ...] placeholder. Never guess.
- After the answers, one line counting the placeholders: "3 things to confirm before submitting: work authorization, salary, Epic years." No line when there are none.
- Then one offer: when I fill in a narrative answer (work authorization, why I'm leaving, a gap), save it verbatim to \`narrative\` with save_career_section so the next form reuses it. Write nothing without my OK.
${fromPasted ? `\n${PASTED_RESUME_CLOSE}\n` : ""}
${TRUTH_RULE}`,
        }],
      };
    }
  );

  server.registerTool(
    "format_for_ats",
    {
      title: "Format for ATS",
      // Pure reformatting of text passed in. Touches no stored data.
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      description: "Reformat résumé text the user already has into clean, parse-safe plain text for an applicant tracking " +
        "system (Workday, Greenhouse, Lever, LinkedIn, iCIMS, Taleo, SmartRecruiters, or generic): standard headings, " +
        "consistent dates, sections ready to paste field by field, and long sections flagged (limits vary by employer). " +
        "Use it when the user is about to paste a résumé into an application form. Reformats only, never rewrites " +
        "content; use tailor_resume to change what the résumé says. Writes nothing.",
      inputSchema: {
        resumeContent: z.string().describe("The resume text to format"),
        targetSystem: z.enum(["workday", "greenhouse", "lever", "linkedin", "icims", "taleo", "smartrecruiters", "generic"]).describe("Target ATS system"),
        postingUrl: z.string().optional().describe("Job posting URL for reference"),
      },
    },
    async ({ resumeContent, targetSystem, postingUrl }) => {
      return {
        content: [{
          type: "text",
          text: `# ATS Formatting: ${targetSystem.toUpperCase()}

${ATS_HYGIENE}

**${ATS_SYSTEM_NAME[targetSystem]}:** ${ATS_SYSTEM_NOTES[targetSystem]}

## Resume Content to Format
${embedUntrusted("resume content", resumeContent)}

${postingUrl ? `**Posting reference:** ${postingUrl}` : ""}

---

**Instructions for Claude:**
Reformat the resume content above following the parsing hygiene and the ${ATS_SYSTEM_NAME[targetSystem]} note above. Produce:

1. **Formatted version** — ready to paste into ${targetSystem} fields
2. **Field-by-field breakdown** — if form-based, show exactly what goes in each field
3. **Length check** — flag any section long enough that a form field might cut it off, and say to check that form's limit; never state a character limit as fact
4. **ATS keyword check** — only if the posting text is in this conversation: its top 10 keywords and whether each appears in the formatted output. Otherwise skip this item and say paste the posting to get it
5. **Copy-paste ready sections** — formatted so each section can be directly pasted

Flag any content that doesn't translate well to plain text and suggest alternatives. Reformat only: keep every fact, date, and number exactly as given, and add nothing. Don't add vendor tips beyond the notes above: how each employer configures its system varies, and folklore about a vendor's parser stated as fact sends people chasing the wrong fix.

${TRUTH_RULE}`,
        }],
      };
    }
  );
}

/**
 * What holds for every applicant tracking system.
 *
 * This used to be a page of per-vendor rules: "Taleo very finicky with PDF",
 * "Lever: one page recommended", "match LinkedIn's taxonomy exactly", and fixed
 * character limits stated as facts. None of it was sourced, much of it varies by
 * how each employer configured the system, and a user told "keep bullets under
 * 100 characters" for Taleo trims real evidence to obey a number nobody checked
 * (council 2.9.7, trust and use-case notes). What survives is parsing hygiene
 * that is true everywhere, plus one neutral note per system.
 */
export const ATS_HYGIENE = `**Parsing hygiene (true for every applicant system):**
- Plain text, one column: no tables, columns, text boxes, graphics, or icons
- Standard section headings: Experience, Education, Skills (plus Summary, Projects, Certifications if used)
- One date format, used the same way for every role
- Contact details in the body, not in a page header or footer
- If you upload a PDF, use a text-based one (exported from a document, not scanned), so the text can be selected
- Field length limits vary by employer; check the form rather than trusting a fixed number`;

const ATS_SYSTEM_NAME: Record<string, string> = {
  workday: "Workday", greenhouse: "Greenhouse", lever: "Lever", linkedin: "LinkedIn Easy Apply",
  icims: "iCIMS", taleo: "Taleo", smartrecruiters: "SmartRecruiters", generic: "Any system",
};

/** One neutral, checkable note per system: how the form usually asks, not how its parser supposedly behaves. */
export const ATS_SYSTEM_NOTES: Record<string, string> = {
  workday: "Workday usually asks you to re-enter each role in its own form (title, company, dates, description), even after a résumé upload, so a per-role breakdown saves time.",
  greenhouse: "Greenhouse usually takes a résumé upload plus separate fields for links and any custom questions the employer added; those questions differ by company.",
  lever: "Lever usually takes a résumé upload, separate fields for links, and an optional additional-information box.",
  linkedin: "Easy Apply attaches a résumé file and may pre-fill answers from your LinkedIn profile, so check the pre-filled answers match the résumé.",
  icims: "iCIMS often asks for work history field by field after the upload; check what it pre-filled from the parse.",
  taleo: "Taleo often asks for work history by hand across several pages, even after an upload; check each parsed field.",
  smartrecruiters: "SmartRecruiters usually takes an upload and may offer a LinkedIn import; review whatever it imported.",
  generic: "No system-specific notes; the hygiene above is what matters.",
};

/** Roles shown in full to tailor_resume; older ones are named as omitted. */
const RESUME_MAX_ROLES = 10;

/**
 * Everything a résumé can be built from, and nothing it can't.
 *
 * This used to be `JSON.stringify(career, null, 2)`: the whole KB, including the
 * salary floor, work preferences and the raw append-only journal, then the
 * journal digest again. It was 20.6k characters on a three-role sample and grew
 * with every captured insight, past the size where Claude Code warns. Interview
 * prep got the same diet in 2.9.7. Every achievement is still here in full,
 * because choosing the right ones for the posting is the résumé's whole job.
 */
export function formatResumeSource(career: CareerData): string {
  const p = career.profile;
  const contact = [p.email, p.phone, p.location, p.linkedIn, p.portfolio].filter(Boolean).join(" · ");
  const roles = career.experience.slice(0, RESUME_MAX_ROLES).map((e) => {
    const head = `### ${e.role} @ ${e.company} (${e.startDate} to ${e.endDate})${e.location ? `, ${e.location}` : ""}`;
    const summary = e.summary?.replace(/\s+/g, " ").trim();
    const wins = e.achievements.map((a) =>
      `- ${a.metric}${a.context ? ` (context: ${a.context})` : ""}${a.impact ? ` → ${a.impact}` : ""}` +
      `${a.keywords.length ? ` [keywords: ${a.keywords.join(", ")}]` : ""}`);
    return [head, summary, ...wins].filter(Boolean).join("\n");
  });
  const older = career.experience.length - RESUME_MAX_ROLES;
  const skills = career.skills.map((k) => {
    const facts = [k.category, k.proficiency !== undefined ? `self-rated ${k.proficiency}/5` : "", k.yearsUsed !== undefined ? `${k.yearsUsed} yrs` : ""]
      .filter(Boolean).join(", ");
    return `${k.name}${facts ? ` (${facts})` : ""}`;
  });
  return [
    `**Name:** ${p.name}${contact ? `\n**Contact:** ${contact}` : ""}`,
    p.summary ? `**Summary on file:** ${p.summary.replace(/\s+/g, " ").trim()}` : "",
    p.targetRoles.length ? `**Target roles:** ${p.targetRoles.join(", ")}` : "",
    "",
    "**Experience** (newest first, as stored)",
    roles.join("\n\n") || "- None listed",
    older > 0 ? `\n(${older} earlier role${older === 1 ? "" : "s"} not shown; ask the user before using them.)` : "",
    "",
    `**Skills:** ${skills.join("; ") || "none listed"}`,
    "",
    "**Education and certifications**",
    formatCredentials(career),
    "",
    "**Projects**",
    formatProjects(career, 8),
  ].filter((line, i, all) => !(line === "" && all[i - 1] === "")).join("\n");
}

/**
 * The eligibility facts a form asks for, exactly as saved, and the ones that
 * are not on file. A form's salary or relocation answer must come from the
 * user, so the model is shown precisely what they have said and nothing else.
 */
export function eligibilityOnFile(career: CareerData): string {
  const p = career.profile;
  const salary = p.salaryMin !== undefined || p.salaryMax !== undefined
    ? `${p.salaryCurrency} ${[p.salaryMin, p.salaryMax].filter((n) => n !== undefined).map((n) => n!.toLocaleString("en-US")).join("–")} (saved target)`
    : undefined;
  const rows: Array<[string, string | undefined]> = [
    ["Location", p.location],
    ["Salary target", salary],
    ["Open to relocation", p.openToRelocation === undefined ? undefined : p.openToRelocation ? "yes" : "no"],
    ["Open to remote", p.openToRemote === undefined ? undefined : p.openToRemote ? "yes" : "no"],
    ["Notice period", p.noticePeriod],
  ];
  const lines = rows.map(([k, v]) => `- ${k}: ${v ?? "not on file"}`);
  return `## Eligibility on file\n${lines.join("\n")}\n- Work authorization: ${
    career.narrative.some((n) => n.topic === "work_authorization") ? "see the saved narrative below" : "not on file"}`;
}
