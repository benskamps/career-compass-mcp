import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadPipeline, mutatePipeline, isCorruptDataError } from "../storage/file-store.js";
import { Application, ApplicationStatus, Pipeline, STATUS_ORDER, statusRank } from "../schemas/career-schema.js";
import { randomUUID } from "crypto";
import { embedUntrusted } from "../untrusted.js";
import { isWriteClaimUnavailable } from "../storage/write-claim.js";
import { isReadOnlyStore } from "../storage/read-only-error.js";
import { ACTIVE_STATUSES, computeStats } from "../pipeline-stats.js";
import type {
  PipelineAddArgs,
  PipelineUpdateArgs,
  PipelineGetArgs,
  PipelineListArgs,
  ToolResponse,
} from "../types/tool-args.js";

// ─── Status validation ────────────────────────────────────────────────────────

/**
 * Statuses a search is still live in — everything before `accepted`.
 *
 * Used for the one transition that is refused. Derived from the funnel order so
 * inserting a stage keeps this correct.
 */
const LIVE_STATUSES = STATUS_ORDER.slice(0, statusRank("accepted"));

const STATUS_LIST = STATUS_ORDER.join(", ");

type StatusCheck =
  | { ok: true; status: ApplicationStatus }
  | { ok: false; message: string };

/**
 * Turn caller-supplied text into a real status, or explain why it isn't one.
 *
 * The tool takes a string rather than an enum on purpose. The schema layer does
 * reject an off-list value, but it does so with a raw dump of the zod issue —
 * and it cannot tell a caller who wrote "interview" that the stage is called
 * "interviewing". A tool result that names the near miss is a correction the
 * model can act on in one turn; a validation error is a dead end. The full list
 * lives in the parameter description, so nothing is hidden by taking a string.
 *
 * Case and stray whitespace are normalised rather than refused: "Screening"
 * means screening, and failing it would teach nothing.
 */
export function parseStatus(raw: string): StatusCheck {
  const cleaned = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const exact = STATUS_ORDER.find((s) => s === cleaned);
  if (exact) return { ok: true, status: exact };

  const near = STATUS_ORDER.find((s) => s.startsWith(cleaned) || cleaned.startsWith(s));
  return {
    ok: false,
    message:
      `❌ "${raw}" isn't a pipeline status, so nothing was changed.` +
      (near ? ` Did you mean \`${near}\`?` : "") +
      `\n\nValid statuses, in funnel order: ${STATUS_LIST}.`,
  };
}

/**
 * Refuse the one move that cannot describe anything real.
 *
 * Deliberately not a state machine. Real searches skip stages and double back:
 * applied straight to rejected, ghosted for two months then an interview. A
 * tracker that argues with the search is worse than one that records it. The
 * single exception is leaving `accepted` for a live stage — you took the job;
 * there is no screening call after that. If the offer collapsed, `rejected` or
 * `withdrawn` says so; if the company is back with something new, that is a new
 * application, not a rewind of this one.
 */
function transitionRefusal(from: ApplicationStatus, to: ApplicationStatus): string | null {
  if (from === "accepted" && LIVE_STATUSES.includes(to)) {
    return (
      `❌ This application is already \`accepted\` — you took the job — so it can't go back to \`${to}\`.\n\n` +
      `If the offer fell through, set \`rejected\` or \`withdrawn\`. If you're talking to them about something new, add that as its own application.`
    );
  }
  return null;
}

// ─── Extracted Handler Functions ──────────────────────────────────────────────

export async function handleAdd(args: PipelineAddArgs, pipeline: Pipeline): Promise<ToolResponse> {
  // Before this, `status` was ignored and every new record was "applied" — so a
  // job you had only found could not be tracked as `discovered`, which is the
  // stage's entire purpose.
  const checked = args.status ? parseStatus(args.status) : ({ ok: true, status: "applied" } as const);
  if (!checked.ok) return { content: [{ type: "text", text: checked.message }] };
  const status = checked.status;

  const id = randomUUID().slice(0, 8);
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const newApp: Application = {
    id,
    company: args.company,
    role: args.role,
    status,
    // A discovered role has not been applied to. Stamping dateApplied anyway
    // would make it show up as an application awaiting a reply.
    dateDiscovered: status === "discovered" ? today : undefined,
    dateApplied: status === "discovered" ? undefined : today,
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
  return {
    content: [{ type: "text", text: `✅ Added application: **${args.role}** at **${args.company}**\nID: \`${id}\`\nStatus: ${status}` }],
  };
}

export async function handleUpdate(args: PipelineUpdateArgs, pipeline: Pipeline): Promise<ToolResponse> {
  const idx = pipeline.applications.findIndex(a => a.id === args.id);
  // Returns normally: mutatePipeline skips the write because nothing changed.
  if (idx === -1) return { content: [{ type: "text", text: `❌ Application ${args.id} not found.` }] };

  const app = pipeline.applications[idx];

  // Snapshot every field except the timestamp, so we can stamp dateUpdated only
  // when this update actually changed something. Stamping it unconditionally
  // moved the clock on every call, which made mutatePipeline's no-op dirty check
  // (file-store.ts) always fire — spending a `.bak` and a fresh lastUpdated to
  // record that nothing happened. With the stamp conditional, a genuine no-op
  // update leaves `applications` byte-identical and the write is skipped.
  const before = JSON.stringify({ ...app, dateUpdated: undefined });

  // Validate before applying anything. A rejected status must not leave a
  // half-applied update behind — the note would land, the status would not, and
  // the caller would be told only about the status.
  if (args.status) {
    const checked = parseStatus(args.status);
    if (!checked.ok) return { content: [{ type: "text", text: checked.message }] };
    const refusal = transitionRefusal(app.status, checked.status);
    if (refusal) return { content: [{ type: "text", text: refusal }] };
    app.status = checked.status;
  }
  if (args.followUpDue) app.followUpDue = args.followUpDue;
  if (args.priority) app.priority = args.priority;
  if (args.notes) app.notes = [...app.notes, `[${new Date().toISOString().slice(0, 10)}] ${args.notes}`];
  if (args.contactName) {
    app.contacts.push({ name: args.contactName, title: args.contactTitle, email: args.contactEmail });
  }
  if (args.interviewType) {
    app.interviewRounds.push({ type: args.interviewType, date: args.interviewDate, interviewers: [], notes: "" });
  }
  if (JSON.stringify({ ...app, dateUpdated: undefined }) !== before) {
    app.dateUpdated = new Date().toISOString();
  }
  pipeline.applications[idx] = app;
  return {
    content: [{ type: "text", text: `✅ Updated **${app.role}** at **${app.company}** (${app.id})\nStatus: ${app.status}` }],
  };
}

export function handleGet(args: PipelineGetArgs, pipeline: Pipeline): ToolResponse {
  const app = pipeline.applications.find(a => a.id === args.id);
  if (!app) return { content: [{ type: "text", text: `❌ Application ${args.id} not found.` }] };
  return { content: [{ type: "text", text: JSON.stringify(app, null, 2) }] };
}

export function handleList(args: PipelineListArgs, pipeline: Pipeline): ToolResponse {
  let apps = [...pipeline.applications];
  if (args.filterStatus) apps = apps.filter(a => a.status === args.filterStatus);
  if (args.filterPriority) apps = apps.filter(a => a.priority === args.filterPriority);

  const sortBy = args.sortBy ?? "date";
  apps.sort((a, b) => {
    if (sortBy === "date") return b.dateUpdated.localeCompare(a.dateUpdated);
    if (sortBy === "company") return a.company.localeCompare(b.company);
    if (sortBy === "status") {
      // Funnel order, the same order the dashboard board reads — sorting a
      // pipeline alphabetically ("accepted, applied, discovered…") would be
      // sorted but not useful. This branch did not exist: the comparator fell
      // through to 0, so the advertised ordering silently returned date order.
      const stage = statusRank(a.status) - statusRank(b.status);
      return stage !== 0 ? stage : b.dateUpdated.localeCompare(a.dateUpdated);
    }
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

export function handleStats(pipeline: Pipeline): ToolResponse {
  const apps = pipeline.applications;
  const byStatus = apps.reduce((acc, a) => { acc[a.status] = (acc[a.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  // Shared with the dashboard rather than recomputed here. This used to read
  // (total − applied) / total, which counts a role you have only *discovered* —
  // and sent nothing to — as an employer response, and divides by a denominator
  // that includes it. On the bundled sample it reported 75% while the dashboard
  // reported 71%, for the same eight applications.
  const stats = computeStats(apps);

  const statsText = Object.entries(byStatus)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => `- **${status}**: ${count}`)
    .join("\n");

  return {
    content: [{
      type: "text",
      text: `# Pipeline Statistics

**Total applications:** ${stats.total}${stats.sent < stats.total ? ` (${stats.sent} sent, ${stats.total - stats.sent} discovered but not applied to)` : ""}
**Active:** ${stats.active}
**Response rate:** ${stats.responseRate}%${stats.sent > 0 ? ` — ${stats.sent} sent` : ""}
**Ghost rate:** ${stats.ghostRate}%

## By Status
${statsText}

## High Priority Active
${apps.filter(a => a.priority === "high" && ACTIVE_STATUSES.includes(a.status)).map(a => `- ${a.company} / ${a.role} (${a.status})`).join("\n") || "None"}`,
    }],
  };
}

export function handleNextActions(pipeline: Pipeline): ToolResponse {
  const now = new Date();
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

// ─── Tool Registration ────────────────────────────────────────────────────────

export function registerPipelineTools(server: McpServer): void {

  server.registerTool(
    "pipeline_view",
    {
      title: "View Application Pipeline",
      // Every action here reads. Nothing on this tool can reach a write path, so
      // a host may run it without asking — which is the point: checking your own
      // pipeline should not cost a permission prompt.
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      description: "Read the job application pipeline: list applications, summarize stats, surface what needs attention, or fetch one application by id. Read-only — never modifies anything.",
      inputSchema: {
        action: z.enum(["list", "stats", "next_actions", "get"])
          .describe("list = all applications (filterable); stats = funnel and response-rate summary; next_actions = what is overdue or due now; get = one application by id"),
        id: z.string().optional().describe("Application id. Required when action=get."),
        filterStatus: ApplicationStatus.optional().describe("action=list only: show only applications in this status"),
        filterPriority: z.enum(["high", "medium", "low"]).optional().describe("action=list only: show only applications at this priority"),
        sortBy: z.enum(["date", "status", "priority", "company", "excitement"]).optional().default("date").describe(
          "action=list only: ordering. date = most recently updated first (the default); " +
            "status = funnel order, discovered through ghosted, ties broken by most recent; " +
            "priority = high to low; company = A-Z; excitement = highest first.",
        ),
        limit: z.number().int().min(1).max(500).optional().default(20).describe("action=list only: maximum applications to return (1-500)"),
      },
    },
    async (args) => {
      // Reads deliberately take no lock: the write path renames atomically, so a
      // reader always sees a complete file, and locking reads would serialize the
      // whole tool for nothing.
      let pipeline: Pipeline;
      try {
        pipeline = await loadPipeline();
      } catch (error) {
        if (isCorruptDataError(error) || isWriteClaimUnavailable(error)) {
          // Both mean the same thing to the user: nothing was written, and here
          // is why. A raw throw here would surface as a transport error and lose
          // the one sentence that tells them what to do about it.
          return { content: [{ type: "text", text: `❌ ${(error as Error).message}` }] };
        }
        throw error;
      }

      switch (args.action) {
        case "get": {
          if (!args.id) return { content: [{ type: "text", text: "❌ id is required for action=get." }] };
          return handleGet(args as PipelineGetArgs, pipeline);
        }
        case "list":
          return handleList(args as PipelineListArgs, pipeline);
        case "stats":
          return handleStats(pipeline);
        case "next_actions":
          return handleNextActions(pipeline);
        default:
          return { content: [{ type: "text", text: `❌ Unknown action: ${args.action}` }] };
      }
    }
  );

  server.registerTool(
    "pipeline_add",
    {
      title: "Add Application to Pipeline",
      // Appends a new application. Additive only: never rewrites or removes an
      // existing one, so destructiveHint is false even though this writes.
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      description: "Add one job application to the pipeline. Creates a new record; never modifies an existing one. Use pipeline_update to change an application already being tracked.",
      inputSchema: {
        company: z.string().describe("Company name"),
        role: z.string().describe("Role title as posted"),
        status: z.string().optional().describe(
          `Where this one already stands, if not at the start. One of: ${STATUS_ORDER.join(", ")}. ` +
            `Defaults to applied. Use 'discovered' for a role you have found but not applied to — ` +
            `it is dated as discovered rather than applied, so it will not show up as awaiting a reply.`,
        ),
        postingUrl: z.string().optional().describe("Link to the job posting"),
        postingText: z.string().optional().describe("Full posting text to cache, so later interview prep can reference it without the link"),
        source: z.string().optional().describe("Where you found it: LinkedIn, Referral, Company site, etc."),
        referral: z.string().optional().describe("Name of the person who referred you, if any"),
        priority: z.enum(["high", "medium", "low"]).optional().describe("How hard you intend to push on this one. Defaults to medium."),
        excitement: z.number().min(1).max(10).optional().describe("How excited you are about the role, 1-10. Used later to compare excitement against outcomes."),
        salaryMin: z.number().optional().describe("Bottom of the posted or expected salary range, in whole currency units"),
        salaryMax: z.number().optional().describe("Top of the posted or expected salary range, in whole currency units"),
      },
    },
    async (args) => {
      try {
        // Load + mutate + save as one critical section, so two adds dispatched in
        // the same turn cannot overwrite each other.
        return await mutatePipeline((pipeline) => handleAdd({ ...args, action: "add" } as PipelineAddArgs, pipeline));
      } catch (error) {
        if (isCorruptDataError(error) || isWriteClaimUnavailable(error) || isReadOnlyStore(error)) {
          // Both mean the same thing to the user: nothing was written, and here
          // is why. A raw throw here would surface as a transport error and lose
          // the one sentence that tells them what to do about it.
          return { content: [{ type: "text", text: `❌ ${(error as Error).message}` }] };
        }
        throw error;
      }
    }
  );

  server.registerTool(
    "pipeline_update",
    {
      title: "Update Application in Pipeline",
      // Overwrites fields on an existing application — a destructive update, so
      // a host will always confirm before running it.
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      description: "Update one application already in the pipeline: change its status, add a note, set a follow-up date, record a contact, or log an interview round. Overwrites the fields you supply and leaves the rest untouched.",
      inputSchema: {
        // NOT completable: MCP has no `ref/tool`, so a completable tool argument
        // is never consulted. The completion lives on the
        // `career://application/{id}` resource template instead — see
        // src/completions.ts.
        id: z.string().describe("Application id, as returned by pipeline_add or pipeline_view"),
        status: z.string().optional().describe(
          `New status in the funnel. One of: ${STATUS_ORDER.join(", ")}. ` +
            `Any forward or backward move is allowed — searches really do go from applied straight to ` +
            `rejected, or from ghosted back to interviewing. The one exception is an application already ` +
            `marked accepted, which cannot return to a live stage.`,
        ),
        priority: z.enum(["high", "medium", "low"]).optional().describe("New priority"),
        notes: z.string().optional().describe("A note to append. Existing notes are kept; this is added with today's date."),
        followUpDue: z.string().optional().describe("ISO date (YYYY-MM-DD) to be reminded to follow up"),
        contactName: z.string().optional().describe("Name of a person met in this process, appended to the application's contacts"),
        contactTitle: z.string().optional().describe("That person's title"),
        contactEmail: z.string().optional().describe("That person's email"),
        interviewType: z.enum(["phone_screen", "behavioral", "technical", "panel", "final", "offer_call", "other"]).optional().describe("Type of an interview round to append"),
        interviewDate: z.string().optional().describe("ISO date of that interview round"),
      },
    },
    async (args) => {
      try {
        return await mutatePipeline((pipeline) => handleUpdate({ ...args, action: "update" } as PipelineUpdateArgs, pipeline));
      } catch (error) {
        if (isCorruptDataError(error) || isWriteClaimUnavailable(error) || isReadOnlyStore(error)) {
          // Both mean the same thing to the user: nothing was written, and here
          // is why. A raw throw here would surface as a transport error and lose
          // the one sentence that tells them what to do about it.
          return { content: [{ type: "text", text: `❌ ${(error as Error).message}` }] };
        }
        throw error;
      }
    }
  );

  server.registerTool(
    "classify_email",
    {
      title: "Classify Email",
      // Reads pipeline company names for context and returns a classification. Any pipeline change happens through a separate pipeline_update call the user approves.
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      description: "Classify a job-search-related email and extract structured data: type, company, role, contact, next action, and urgency.",
      inputSchema: {
        emailContent: z.string().describe("Full email content — paste subject line and body"),
        autoUpdatePipeline: z.boolean().default(false).describe("If true, the classification includes the specific pipeline field changes it implies, so you can review them before anything is written. This tool only classifies — it never writes."),
      },
    },
    async ({ emailContent, autoUpdatePipeline }) => {
      let pipeline: Pipeline;
      try {
        pipeline = await loadPipeline();
      } catch (error) {
        if (isCorruptDataError(error) || isWriteClaimUnavailable(error)) {
          // Both mean the same thing to the user: nothing was written, and here
          // is why. A raw throw here would surface as a transport error and lose
          // the one sentence that tells them what to do about it.
          return { content: [{ type: "text", text: `❌ ${(error as Error).message}` }] };
        }
        throw error;
      }
      const companyList = [...new Set(pipeline.applications.map(a => a.company))].join(", ");

      return {
        content: [{
          type: "text",
          text: `# Email Classification Request

## Email Content
${embedUntrusted("email", emailContent)}

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

${autoUpdatePipeline ? "\n**Suggested pipeline changes:** After classifying, list the exact fields this email implies should change, and the application id, for the user to confirm before anything is written." : ""}`,
        }],
      };
    }
  );
}
