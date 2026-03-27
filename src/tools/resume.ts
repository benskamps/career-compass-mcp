import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadCareerData } from "../storage/file-store.js";

export function registerResumeTools(server: McpServer): void {

  server.registerTool(
    "tailor_resume",
    {
      title: "Tailor Resume",
      description: "Generate a tailored, ATS-optimized resume matched to a specific job posting using your Career KB.",
      inputSchema: {
        posting: z.string().describe("Full job posting text"),
        format: z.enum(["standard", "federal", "academic", "functional"]).default("standard").describe("Resume format"),
        pages: z.number().min(1).max(4).default(2).describe("Target page count"),
        includeProjects: z.boolean().default(true).describe("Include projects section"),
        focusAreas: z.string().optional().describe("Specific areas to emphasize, e.g. 'leadership, data analysis'"),
      },
    },
    async ({ posting, format, pages, includeProjects, focusAreas }) => {
      const career = await loadCareerData();
      if (!career) {
        return {
          content: [{ type: "text", text: "⚠️ No career data found. Please populate your Career KB first." }],
        };
      }

      return {
        content: [{
          type: "text",
          text: `# Resume Tailoring Request

## Full Career KB
${JSON.stringify(career, null, 2)}

## Job Posting
${posting}

## Output Requirements
- **Format:** ${format}
- **Length:** ${pages} page(s)
- **Include projects:** ${includeProjects}
${focusAreas ? `- **Emphasis areas:** ${focusAreas}` : ""}

---

**Instructions for Claude:**
Using the complete Career KB above, generate a tailored resume:

**Structure for ${format} format:**
${format === "standard" ? `1. Header (name, contact, LinkedIn)
2. Professional Summary (3-4 sentences, bridging background to this role)
3. Core Competencies (keyword-matched to posting)
4. Professional Experience (reverse chronological, achievement-focused)
5. ${includeProjects ? "Key Projects\n6. Education & Certifications" : "Education & Certifications"}` : ""}
${format === "federal" ? `1. Header with full contact info
2. Work Experience (detailed, with hours per week, supervisor info)
3. Education
4. Certifications & Training
5. Skills Matrix` : ""}
${format === "functional" ? `1. Header
2. Professional Summary
3. Core Competencies by theme
4. Career Highlights (top 6-8 achievements regardless of employer)
5. Employment History (condensed)
6. Education` : ""}

**Rules:**
- Match the posting's language exactly where truthful
- Lead each achievement with an action verb
- Quantify every achievement possible (%, $, time, scale)
- ATS-safe: no tables, columns, headers/footers, graphics
- Do not fabricate — only use data from the Career KB
- Flag "[VERIFY]" next to any claim that needs confirmation
- Industry-agnostic: use the posting's vocabulary, not my previous employer's

Output the full resume text, then a "Keyword Match Report" showing which posting requirements are covered and which aren't.`,
        }],
      };
    }
  );

  server.registerTool(
    "generate_cover_letter",
    {
      title: "Generate Cover Letter",
      description: "Write a compelling, personalized cover letter for a specific job posting using your Career KB.",
      inputSchema: {
        posting: z.string().describe("Full job posting text"),
        company: z.string().describe("Company name"),
        hiringManager: z.string().optional().describe("Hiring manager name if known"),
        tone: z.enum(["professional", "conversational", "enthusiastic", "concise"]).default("professional"),
        angle: z.string().optional().describe("The key story or angle to lead with"),
      },
    },
    async ({ posting, company, hiringManager, tone, angle }) => {
      const career = await loadCareerData();
      if (!career) {
        return {
          content: [{ type: "text", text: "⚠️ No career data found." }],
        };
      }

      return {
        content: [{
          type: "text",
          text: `# Cover Letter Generation

## Career KB Summary
**Name:** ${career.profile.name}
**Summary:** ${career.profile.summary}
**Top achievements:**
${career.experience.flatMap(e => e.achievements.slice(0, 2).map(a => `- ${a.metric}: ${a.impact}`)).slice(0, 8).join("\n")}

## Job Posting
${posting}

## Parameters
- **Company:** ${company}
- **Hiring manager:** ${hiringManager ?? "Unknown (use 'Dear Hiring Team')"}
- **Tone:** ${tone}
${angle ? `- **Lead angle:** ${angle}` : ""}

---

**Instructions for Claude:**
Write a compelling cover letter. Structure:

**Opening (1 paragraph):** Hook with a specific achievement or observation about ${company} that connects to why I'm applying. Don't start with "I am writing to apply..."

**Body (2 paragraphs):**
- Para 1: My most relevant experience, told as a brief story with a specific outcome
- Para 2: Why ${company} specifically — what excites me about their mission, product, or stage

**Closing (1 paragraph):** Confident call to action. Specific, not generic.

**Tone notes for ${tone}:**
${tone === "professional" ? "Polished, measured, authoritative" : ""}
${tone === "conversational" ? "Warm, direct, human — write like you talk" : ""}
${tone === "enthusiastic" ? "High energy, genuine excitement, mission-driven" : ""}
${tone === "concise" ? "Every sentence earns its place. Max 250 words total." : ""}

Keep it under 400 words. Make it feel human, not templated.`,
        }],
      };
    }
  );

  server.registerTool(
    "format_for_ats",
    {
      title: "Format for ATS",
      description: "Format resume and application content for specific ATS systems: Workday, Greenhouse, Lever, LinkedIn, and others.",
      inputSchema: {
        resumeContent: z.string().describe("The resume text to format"),
        targetSystem: z.enum(["workday", "greenhouse", "lever", "linkedin", "icims", "taleo", "smartrecruiters", "generic"]).describe("Target ATS system"),
        postingUrl: z.string().optional().describe("Job posting URL for reference"),
      },
    },
    async ({ resumeContent, targetSystem, postingUrl }) => {
      const systemGuides: Record<string, string> = {
        workday: `**Workday formatting rules:**
- Plain text for work history fields (no markdown)
- Each role entered separately via form fields: Job Title, Company, Start Date, End Date, Description
- Description field: bullet points separated by line breaks, max ~2000 chars per role
- Skills: enter each individually in the skills inventory
- Education: separate fields for Degree, Major, School, Year
- Keep each bullet under 150 characters for display
- Dates format: MM/YYYY`,

        greenhouse: `**Greenhouse formatting rules:**
- Accepts PDF and DOCX — PDF preferred for layout preservation
- LinkedIn URL field is separate — don't include in resume body
- Cover letter is a separate rich text field
- Custom questions vary by company — read each carefully
- Work samples/portfolio links go in their designated field`,

        lever: `**Lever formatting rules:**
- PDF strongly preferred
- One-page recommended for most roles
- Apply via email application or form
- Cover letter in the body text field — keep under 300 words
- Social links (GitHub, LinkedIn, portfolio) in dedicated fields`,

        linkedin: `**LinkedIn Easy Apply formatting rules:**
- Resume PDF is attached — must be ATS-readable (no graphics)
- Additional questions are auto-populated from profile — ensure profile matches resume
- Character limits on text fields: ~2000 per experience entry
- Skills should match LinkedIn's taxonomy exactly
- Headline is pulled from your profile — update before applying`,

        icims: `**iCIMS formatting rules:**
- Plain text preferred in form fields
- Work history entered field by field
- Date format: MM/DD/YYYY
- Can upload PDF/DOCX for resume attachment
- Cover letter is a rich text field`,

        taleo: `**Taleo formatting rules:**
- Very finicky with PDF formatting — use plain DOCX
- Enter work history manually even with resume upload
- Dates: MM/YYYY
- Character limits are strict — keep bullets under 100 chars
- Multi-page forms — don't close the browser`,

        smartrecruiters: `**SmartRecruiters formatting rules:**
- Accepts PDF and DOCX
- LinkedIn import available
- Clean single-column layout recommended
- Each section entered separately in profile`,

        generic: `**Generic ATS formatting rules:**
- Plain text, single column
- Standard section headers (Experience, Education, Skills)
- Dates: Month YYYY – Month YYYY
- No tables, graphics, columns, headers/footers, text boxes
- Standard fonts only (Arial, Calibri, Times New Roman)`,
      };

      return {
        content: [{
          type: "text",
          text: `# ATS Formatting: ${targetSystem.toUpperCase()}

${systemGuides[targetSystem]}

## Resume Content to Format
${resumeContent}

${postingUrl ? `**Posting reference:** ${postingUrl}` : ""}

---

**Instructions for Claude:**
Reformat the resume content above following the ${targetSystem} rules exactly. Produce:

1. **Formatted version** — ready to paste into ${targetSystem} fields
2. **Field-by-field breakdown** — if form-based, show exactly what goes in each field
3. **Character count warnings** — flag any sections that may exceed limits
4. **ATS keyword density** — top 10 keywords from the posting and whether they appear in the formatted output
5. **Copy-paste ready sections** — formatted so each section can be directly pasted

Flag any content that doesn't translate well to this system and suggest alternatives.`,
        }],
      };
    }
  );
}
