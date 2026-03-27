import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadCareerData } from "../storage/file-store.js";

export function registerOpportunityTools(server: McpServer): void {

  server.registerTool(
    "explore_opportunity",
    {
      title: "Explore Opportunity",
      description: "Analyze a job posting against your Career KB. Returns fit score, matched strengths, gaps, talking points, and a 'day in the life' brief.",
      inputSchema: {
        posting: z.string().describe("Full job posting text, or paste the raw text from a job board"),
        company: z.string().optional().describe("Company name (if not in posting)"),
        notes: z.string().optional().describe("Any additional context about this opportunity"),
      },
    },
    async ({ posting, company, notes }) => {
      const career = await loadCareerData();
      if (!career) {
        return {
          content: [{
            type: "text",
            text: "⚠️ No career data found. Please populate your Career KB first by running `ingest_document` or adding YAML files to data/career/.",
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

## Job Posting
${posting}
${company ? `\n**Company:** ${company}` : ""}
${notes ? `\n**Notes:** ${notes}` : ""}

---

**Instructions for Claude:**
Using the career context above and the job posting, provide a structured analysis:

### 1. Fit Score (X/10)
Overall match assessment with a one-line rationale.

### 2. Strong Matches
List 5-7 specific points where my background directly maps to what they're asking for. Be specific — quote from both the posting and my career history.

### 3. Gaps & Growth Areas
Honest assessment of where I fall short. For each gap, note: (a) how significant it is, (b) whether it's a dealbreaker, (c) how to address it.

### 4. Talking Points
5 things to lead with in conversations about this role, framing my background in their language.

### 5. Day in the Life
Based on the posting, describe what my first 90 days and typical week would look like in this role. What problems would I own? What would success look like?

### 6. Red Flags / Questions
Anything in the posting that warrants clarification or concern.

### 7. Verdict
Should I pursue this? What's the strategic case for or against?`,
        }],
      };
    }
  );

  server.registerTool(
    "research_company",
    {
      title: "Research Company",
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
- Remote preference: ${profile.openToRemote ? "Open to remote" : "Prefers onsite"}` : "Career KB not loaded"}

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
**Target industries:** ${profile.targetIndustries.join(", ") || "Not specified"}`;
}
