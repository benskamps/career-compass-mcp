import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadCareerData, saveCareerSection, loadPipeline, savePipeline } from "../storage/file-store.js";

export function registerCareerKBTools(server: McpServer): void {

  server.registerTool(
    "ingest_document",
    {
      title: "Ingest Career Document",
      description: "Paste any career document — performance review, award email, project summary, LinkedIn recommendation — and extract structured achievements to add to your Career KB.",
      inputSchema: {
        content: z.string().describe("Full document text to ingest"),
        documentType: z.enum(["performance_review", "award", "project_summary", "recommendation", "email", "self_review", "other"]).describe("Type of document"),
        associatedRole: z.string().optional().describe("Job role this document relates to"),
        associatedCompany: z.string().optional().describe("Company this document relates to"),
        datePeriod: z.string().optional().describe("Time period this covers, e.g. '2023 Q1' or '2022-2023'"),
        autoSave: z.boolean().default(false).describe("If true, automatically append extracted data to Career KB"),
      },
    },
    async ({ content, documentType, associatedRole, associatedCompany, datePeriod, autoSave }) => {
      return {
        content: [{
          type: "text",
          text: `# Career Document Ingestion

## Document
**Type:** ${documentType}
${associatedRole ? `**Role:** ${associatedRole}` : ""}
${associatedCompany ? `**Company:** ${associatedCompany}` : ""}
${datePeriod ? `**Period:** ${datePeriod}` : ""}

**Content:**
${content}

---

**Instructions for Claude:**
Extract structured career data from this document. Produce output in two formats:

### 1. Human-Readable Summary
What are the key achievements, skills, and attributes this document reveals?

### 2. Career KB YAML Block
Extract into YAML format ready to add to the Career KB:

\`\`\`yaml
# Extracted from ${documentType} — ${associatedCompany ?? "Unknown Company"} — ${datePeriod ?? "Unknown period"}
experience_entry:
  role: "${associatedRole ?? "Unknown"}"
  company: "${associatedCompany ?? "Unknown"}"
  achievements:
    - metric: "[quantified outcome]"
      context: "[situation or task]"
      impact: "[why it mattered]"
      keywords: []
    # ... additional achievements

testimonials:
  - source: "[name and title if from recommendation/review]"
    relationship: "[manager/peer/report]"
    quote: "[direct quote if available]"
    context: "[what this was about]"
\`\`\`

### 3. Skills Identified
List any skills surfaced by this document that may not be in the Career KB:
\`\`\`yaml
skills:
  - name: "[skill]"
    category: "[Technical/Leadership/Domain/etc]"
    proficiency: [1-5]
\`\`\`

### 4. Keywords Extracted
Top 10 ATS-friendly keywords from this document.

${autoSave ? `
**Auto-save requested:** After extraction, call the update tools to append this data to the Career KB files.
` : `
**To save:** Review the YAML above and use your file editor to append to the relevant data/career/ files, or set autoSave=true to let Claude do it automatically.
`}`,
        }],
      };
    }
  );

  server.registerTool(
    "generate_rejection_response",
    {
      title: "Generate Rejection Response",
      description: "Craft a graceful rejection response that keeps the door open, maintains relationships, and positions you for future opportunities.",
      inputSchema: {
        applicationId: z.string().optional().describe("Pipeline application ID"),
        company: z.string().optional(),
        role: z.string().optional(),
        rejectionContent: z.string().describe("The rejection email or message content"),
        responseGoal: z.enum(["keep_door_open", "request_feedback", "decline_gracefully", "express_continued_interest"]).default("keep_door_open"),
        contactName: z.string().optional().describe("Person who sent the rejection"),
        hadGoodRapport: z.boolean().default(false).describe("Did you have positive interactions during the process?"),
      },
    },
    async ({ applicationId, company, role, rejectionContent, responseGoal, contactName, hadGoodRapport }) => {
      if (applicationId) {
        const pipeline = await loadPipeline();
        const app = pipeline.applications.find(a => a.id === applicationId);
        if (app) {
          company = company ?? app.company;
          role = role ?? app.role;
          // Auto-update status to rejected
          app.status = "rejected";
          app.dateUpdated = new Date().toISOString();
          await savePipeline(pipeline);
        }
      }

      return {
        content: [{
          type: "text",
          text: `# Rejection Response

## Rejection Received
**Company:** ${company ?? "Unknown"}
**Role:** ${role ?? "Unknown"}
${contactName ? `**From:** ${contactName}` : ""}
**Goal:** ${responseGoal}
**Prior rapport:** ${hadGoodRapport ? "Yes — positive relationship built" : "Limited"}

**Rejection message:**
${rejectionContent}

---

**Instructions for Claude:**
Write a rejection response that achieves: **${responseGoal}**

**Tone guidelines:**
- Gracious, never bitter
- Genuine, not sycophantic
- Brief (3-5 sentences max)
- Memorable without being awkward
${hadGoodRapport ? "- Reference the positive experience you had — make it personal" : ""}

**For goal: ${responseGoal}:**
${responseGoal === "keep_door_open" ? "Express appreciation, mention you'd welcome future opportunities, leave a positive final impression" : ""}
${responseGoal === "request_feedback" ? "Politely ask what the deciding factor was — make it easy to say no, so they'll actually respond" : ""}
${responseGoal === "decline_gracefully" ? "If you're withdrawing after a rejection arrived simultaneously, thank them and close cleanly" : ""}
${responseGoal === "express_continued_interest" ? "Mention the company is still high on your list and you'd welcome being considered for future openings" : ""}

**Output:**
1. **Recommended response** (ready to send)
2. **Alternative version** (different angle)
3. **LinkedIn connection note** (if you haven't connected yet — 300 chars)

${applicationId ? `\n**Note:** Application ${applicationId} status has been automatically updated to 'rejected'.` : ""}`,
        }],
      };
    }
  );
}
