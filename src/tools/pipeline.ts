import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadPipeline, savePipeline } from "../storage/file-store.js";
import { Application, ApplicationStatus } from "../schemas/career-schema.js";
import { randomUUID } from "crypto";

export function registerPipelineTools(server: McpServer): void {

  server.registerTool(
    "manage_pipeline",
    {
      title: "Manage Application Pipeline",
      description: "Add, update, list, and analyze job applications. Track status from discovered through offer/rejection.",
      inputSchema: {
        action: z.enum(["add", "update", "list", "stats", "next_actions", "get"]).describe("Operation to perform"),
        // For add
        company: z.string().optional(),
        role: z.string().optional(),
        postingUrl: z.string().optional(),
        postingText: z.string().optional().describe("Full posting text to cache"),
        source: z.string().optional().describe("Where you found it: LinkedIn, Referral, Company site, etc."),
        referral: z.string().optional(),
        priority: z.enum(["high", "medium", "low"]).optional(),
        excitement: z.number().min(1).max(10).optional(),
        salaryMin: z.number().optional(),
        salaryMax: z.number().optional(),
        // For update
        id: z.string().optional().describe("Application ID (required for update/get)"),
        status: ApplicationStatus.optional(),
        notes: z.string().optional().describe("Note to add to this application"),
        followUpDue: z.string().optional().describe("ISO date for follow-up reminder"),
        contactName: z.string().optional(),
        contactTitle: z.string().optional(),
        contactEmail: z.string().optional(),
        interviewType: z.enum(["phone_screen", "behavioral", "technical", "panel", "final", "offer_call", "other"]).optional(),
        interviewDate: z.string().optional(),
        // For list
        filterStatus: ApplicationStatus.optional().describe("Filter by status"),
        filterPriority: z.enum(["high", "medium", "low"]).optional(),
        sortBy: z.enum(["date", "status", "priority", "company", "excitement"]).optional().default("date"),
        limit: z.number().optional().default(20),
      },
    },
    async (args) => {
      const { action } = args;
      const pipeline = await loadPipeline();

      switch (action) {
        case "add": {
          if (!args.company || !args.role) {
            return { content: [{ type: "text", text: "❌ company and role are required for add action." }] };
          }
          const id = randomUUID().slice(0, 8);
          const now = new Date().toISOString();
          const newApp: Application = {
            id,
            company: args.company,
            role: args.role,
            status: "applied",
            dateApplied: now.slice(0, 10),
            dateUpdated: now,
            postingUrl: args.postingUrl,
            postingText: args.postingText,
            source: args.source,
            referral: args.referral,
            priority: args.priority ?? "medium",
            excitement: args.excitement,
            salaryRange: (args.salaryMin || args.salaryMax) ? { min: args.salaryMin, max: args.salaryMax, currency: "USD" } : undefined,
            contacts: [],
            interviewRounds: [],
            notes: [],
            coverLetterGenerated: false,
            remote: "unknown",
          };
          pipeline.applications.push(newApp);
          await savePipeline(pipeline);
          return {
            content: [{ type: "text", text: `✅ Added application: **${args.role}** at **${args.company}**\nID: \`${id}\`\nStatus: applied` }],
          };
        }

        case "update": {
          if (!args.id) return { content: [{ type: "text", text: "❌ id is required for update action." }] };
          const idx = pipeline.applications.findIndex(a => a.id === args.id);
          if (idx === -1) return { content: [{ type: "text", text: `❌ Application ${args.id} not found.` }] };

          const app = pipeline.applications[idx];
          if (args.status) app.status = args.status;
          if (args.followUpDue) app.followUpDue = args.followUpDue;
          if (args.priority) app.priority = args.priority;
          if (args.notes) app.notes = [...app.notes, `[${new Date().toISOString().slice(0, 10)}] ${args.notes}`];
          if (args.contactName) {
            app.contacts.push({ name: args.contactName, title: args.contactTitle, email: args.contactEmail });
          }
          if (args.interviewType) {
            app.interviewRounds.push({ type: args.interviewType, date: args.interviewDate, interviewers: [], notes: "" });
          }
          app.dateUpdated = new Date().toISOString();
          pipeline.applications[idx] = app;
          await savePipeline(pipeline);
          return {
            content: [{ type: "text", text: `✅ Updated **${app.role}** at **${app.company}** (${app.id})\nStatus: ${app.status}` }],
          };
        }

        case "get": {
          if (!args.id) return { content: [{ type: "text", text: "❌ id is required for get action." }] };
          const app = pipeline.applications.find(a => a.id === args.id);
          if (!app) return { content: [{ type: "text", text: `❌ Application ${args.id} not found.` }] };
          return { content: [{ type: "text", text: JSON.stringify(app, null, 2) }] };
        }

        case "list": {
          let apps = [...pipeline.applications];
          if (args.filterStatus) apps = apps.filter(a => a.status === args.filterStatus);
          if (args.filterPriority) apps = apps.filter(a => a.priority === args.filterPriority);

          const sortBy = args.sortBy ?? "date";
          apps.sort((a, b) => {
            if (sortBy === "date") return b.dateUpdated.localeCompare(a.dateUpdated);
            if (sortBy === "company") return a.company.localeCompare(b.company);
            if (sortBy === "excitement") return (b.excitement ?? 0) - (a.excitement ?? 0);
            if (sortBy === "priority") {
              const p = { high: 0, medium: 1, low: 2 };
              return p[a.priority] - p[b.priority];
            }
            return 0;
          });

          const limited = apps.slice(0, args.limit ?? 20);
          const rows = limited.map(a =>
            `| ${a.id} | ${a.company} | ${a.role} | ${a.status} | ${a.priority} | ${a.dateUpdated.slice(0, 10)} |`
          ).join("\n");

          return {
            content: [{
              type: "text",
              text: `# Applications (${apps.length} total, showing ${limited.length})\n\n| ID | Company | Role | Status | Priority | Updated |\n|---|---|---|---|---|---|\n${rows}`,
            }],
          };
        }

        case "stats": {
          const apps = pipeline.applications;
          const byStatus = apps.reduce((acc, a) => { acc[a.status] = (acc[a.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);
          const total = apps.length;
          const active = apps.filter(a => !["rejected", "withdrawn", "accepted", "ghosted"].includes(a.status)).length;
          const ghosted = apps.filter(a => a.status === "ghosted").length;
          const responseRate = total > 0 ? Math.round(((total - apps.filter(a => a.status === "applied").length) / total) * 100) : 0;

          const statsText = Object.entries(byStatus)
            .sort((a, b) => b[1] - a[1])
            .map(([status, count]) => `- **${status}**: ${count}`)
            .join("\n");

          return {
            content: [{
              type: "text",
              text: `# Pipeline Statistics

**Total applications:** ${total}
**Active:** ${active}
**Response rate:** ${responseRate}%
**Ghost rate:** ${total > 0 ? Math.round((ghosted / total) * 100) : 0}%

## By Status
${statsText}

## High Priority Active
${apps.filter(a => a.priority === "high" && !["rejected", "withdrawn", "accepted", "ghosted"].includes(a.status)).map(a => `- ${a.company} / ${a.role} (${a.status})`).join("\n") || "None"}`,
            }],
          };
        }

        case "next_actions": {
          const now = new Date();
          const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          const actions: string[] = [];

          for (const app of pipeline.applications) {
            if (["rejected", "withdrawn", "accepted"].includes(app.status)) continue;

            const updatedDate = new Date(app.dateUpdated);
            const daysSinceUpdate = Math.floor((now.getTime() - updatedDate.getTime()) / (1000 * 60 * 60 * 24));

            if (app.status === "applied" && daysSinceUpdate >= 7) {
              actions.push(`📬 **Follow up** — ${app.company} / ${app.role} (applied ${daysSinceUpdate}d ago, ID: ${app.id})`);
            }
            if (app.status === "screening" && daysSinceUpdate >= 5) {
              actions.push(`📞 **Check status** — ${app.company} / ${app.role} (in screening ${daysSinceUpdate}d, ID: ${app.id})`);
            }
            if (app.followUpDue && new Date(app.followUpDue) <= now) {
              actions.push(`⚠️ **Overdue follow-up** — ${app.company} / ${app.role} (due ${app.followUpDue}, ID: ${app.id})`);
            }
            if (app.status === "interviewing") {
              const nextInterview = app.interviewRounds.find(r => r.date && new Date(r.date) > now);
              if (nextInterview) {
                actions.push(`🎯 **Upcoming interview** — ${app.company} / ${app.role}: ${nextInterview.type} on ${nextInterview.date} (ID: ${app.id})`);
              }
            }
            if (app.status === "offer") {
              actions.push(`💰 **Pending offer** — ${app.company} / ${app.role} — evaluate and respond (ID: ${app.id})`);
            }
          }

          return {
            content: [{
              type: "text",
              text: actions.length > 0
                ? `# Next Actions (${actions.length})\n\n${actions.join("\n")}`
                : "✅ No immediate actions needed. Your pipeline is up to date.",
            }],
          };
        }

        default:
          return { content: [{ type: "text", text: `❌ Unknown action: ${action}` }] };
      }
    }
  );

  server.registerTool(
    "classify_email",
    {
      title: "Classify Email",
      description: "Classify a job-search-related email and extract structured data: type, company, role, contact, next action, and urgency.",
      inputSchema: {
        emailContent: z.string().describe("Full email content — paste subject line and body"),
        autoUpdatePipeline: z.boolean().default(false).describe("If true, automatically update the pipeline based on classification"),
      },
    },
    async ({ emailContent, autoUpdatePipeline }) => {
      const pipeline = await loadPipeline();
      const companyList = [...new Set(pipeline.applications.map(a => a.company))].join(", ");

      return {
        content: [{
          type: "text",
          text: `# Email Classification Request

## Email Content
${emailContent}

## Known Companies in Pipeline
${companyList || "None yet"}

---

**Instructions for Claude:**
Classify this email and extract structured data:

### Classification
- **Type:** one of: recruiter_outreach | application_confirmation | interview_invite | technical_assessment | rejection | offer | reference_request | networking | unknown
- **Urgency:** high (response needed today) | medium (respond within 2 days) | low (FYI only)
- **Sentiment:** positive | neutral | negative

### Extracted Data
- **Company:**
- **Role:**
- **Contact name:**
- **Contact title:**
- **Contact email:**
- **Date/time mentioned:** (for interviews or deadlines)
- **Salary mentioned:** (if any)

### Suggested Pipeline Action
- Which application does this match? (match against known companies: ${companyList || "none"})
- What status update should be made?
- What follow-up action is needed and by when?

### Suggested Response Draft
Write a brief, professional reply (3-5 sentences) appropriate for this email type.

${autoUpdatePipeline ? "\n**Auto-update:** After classifying, call manage_pipeline with action='update' to update the matching application." : ""}`,
        }],
      };
    }
  );
}
