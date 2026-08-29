import { z } from "zod";
import { randomUUID } from "crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { join } from "path";
import { loadCareerData, saveCareerSection, loadPipeline, mutatePipeline, appendJournalEntry, isCorruptDataError, getDataDir, CAREER_SECTIONS } from "../storage/file-store.js";
import { Profile, Experience, Skill, Education, Project, Testimonial } from "../schemas/career-schema.js";
import type { JournalEntry } from "../schemas/career-schema.js";
import { embedUntrusted } from "../untrusted.js";
import { isWriteClaimUnavailable } from "../storage/write-claim.js";
import { isReadOnlyStore } from "../storage/read-only-error.js";

/** Per-section schema, so a write is validated with the same rules the loader
 *  enforces on read. Writing first and validating later would let one bad write
 *  make the entire KB unloadable. */
const CAREER_SECTION_SCHEMA = {
  profile: Profile,
  experience: z.array(Experience),
  skills: z.array(Skill),
  education: z.array(Education),
  projects: z.array(Project),
  testimonials: z.array(Testimonial),
} as const;

/**
 * What each section's `data` has to look like, in the parameter description and
 * in the error when it doesn't.
 *
 * `data` is `z.unknown()` because its shape depends on `section`, so the
 * generated input schema tells a caller nothing at all — and the first thing
 * anyone writes for an experience entry is `achievements: ["led the migration"]`,
 * which is a list of strings where the schema wants objects. The write is
 * correctly refused, but a first write that fails is a first impression, and
 * the caller had no way to know the shape before trying.
 *
 * Written out rather than derived from zod at runtime: a generated summary of a
 * nested schema is either unreadable or lossy, and the guard test asserts every
 * required field of every section appears here, so it cannot drift.
 */
const SECTION_SHAPES: Record<keyof typeof CAREER_SECTION_SCHEMA, string> = {
  profile:
    "one object: { name, summary, email?, phone?, location?, linkedIn?, portfolio?, " +
    "targetRoles?: [string], targetIndustries?: [string], salaryMin?: number, salaryMax?: number }",
  experience:
    "array of { role, company, startDate: 'YYYY-MM', endDate: 'YYYY-MM' | 'present', " +
    "summary?, industry?, location?, tags?: [string], " +
    "achievements: [{ metric, context, impact, keywords?: [string] }] } " +
    "— achievements are OBJECTS, not strings: metric is the quantified outcome " +
    "('cut onboarding from 6 weeks to 9 days'), context is the situation, impact is why it mattered",
  skills:
    "array of { name, category ('Technical' | 'Leadership' | 'Domain' | …), " +
    "proficiency?: 1-5, yearsUsed?: number, lastUsed?: 'YYYY' | 'current' }",
  education:
    "array of { degree, institution, date: 'YYYY' | 'YYYY-MM', honors?, " +
    "relevantCoursework?: [string], certifications?: [string] }",
  projects:
    "array of { name, role, description, technologies?: [string], metrics?: [string], " +
    "outcomes?: [string], url? }",
  testimonials:
    "array of { source (name and title), relationship ('Direct Manager' | 'Peer' | …), " +
    "quote, date?, context? }",
};

/** The shapes as one block, for the `data` parameter description. */
export const SECTION_SHAPE_HELP = Object.entries(SECTION_SHAPES)
  .map(([section, shape]) => `${section}: ${shape}`)
  .join("\n");

/**
 * `data` has to survive arriving as a JSON string.
 *
 * Its shape depends on `section`, so it is declared `z.unknown()`, and zod emits
 * `{}` for that — a required property with no `type` at all. A client with no
 * type to hold onto sends the value as a JSON string, the section schema sees a
 * string where it wants an object or an array, and every write is refused. That
 * was issue #34: `save_career_section` never wrote once, for anyone, on v2.4.0,
 * which also meant a fresh install could never leave the empty state.
 *
 * Parsing here rather than widening the section schemas keeps one shape on disk:
 * the section schema stays the single description of a valid section, and this
 * only decides what counts as "the caller sent JSON".
 *
 * Every section is an object or an array, so a bare string is never a valid
 * value — parsing one can't mask a legitimate write.
 */
export function coerceSectionData(
  data: unknown,
): { ok: true; value: unknown } | { ok: false; message: string } {
  if (typeof data !== "string") return { ok: true, value: data };

  const trimmed = data.trim();
  if (trimmed === "") {
    return {
      ok: false,
      message: "`data` arrived as an empty string. Send the section contents as JSON.",
    };
  }

  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch {
    // A string that isn't JSON is a different failure from a wrong shape, and
    // saying so is what stops the caller re-sending the same prose twice.
    const preview = trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed;
    return {
      ok: false,
      message:
        `\`data\` arrived as a string that isn't valid JSON, so nothing was written.\n\n` +
        `  Received: ${preview}\n\n` +
        `Send the section contents as JSON — an object for \`profile\`, an array for every other section.`,
    };
  }
}

export function registerCareerKBTools(server: McpServer): void {

  server.registerTool(
    "ingest_document",
    {
      title: "Ingest Career Document",
      // Extracts structured data and returns it for review. Persisting it is a separate, explicit step.
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      description:
        "Paste any career document — performance review, award email, project summary, LinkedIn recommendation — and extract structured achievements for your Career KB. " +
        "Extraction only: it reads what you paste and returns YAML for review. Writing that YAML to disk is a separate, explicit step with save_career_section.",
      inputSchema: {
        content: z.string().describe("Full document text to ingest"),
        documentType: z.enum(["performance_review", "award", "project_summary", "recommendation", "email", "self_review", "other"]).describe("Type of document"),
        associatedRole: z.string().optional().describe("Job role this document relates to"),
        associatedCompany: z.string().optional().describe("Company this document relates to"),
        datePeriod: z.string().optional().describe("Time period this covers, e.g. '2023 Q1' or '2022-2023'"),
      },
    },
    // There used to be an `autoSave` flag here. This tool is readOnlyHint:true
    // and has no write path, so the flag never saved anything — it only chose
    // which closing paragraph to print, one of which told the caller to set it
    // "to let Claude do it automatically." Removing it is the honest fix; a
    // caller that still sends it is ignored rather than failed, and the output
    // now names the one tool that actually writes the Career KB.
    async ({ content, documentType, associatedRole, associatedCompany, datePeriod }) => {
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
${embedUntrusted("uploaded document", content)}

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

---

**Nothing has been written.** This tool only extracts.

**To save:** show the user the YAML above, then call \`save_career_section\` with the
section it belongs in (\`experience\`, \`skills\`, \`testimonials\`, …). That tool replaces the
whole section, so send the existing entries plus the new ones — read the section first if
you don't already have it. The previous version is kept as a timestamped \`.bak\`.`,
        }],
      };
    }
  );

  server.registerTool(
    "generate_rejection_response",
    {
      title: "Generate Rejection Response",
      // Drafts the response AND, when applicationId is given, sets that application's status to rejected — an overwrite of existing state.
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      // The annotations have always been honest — destructiveHint is true — but
      // the sentence a user reads in the confirmation dialog described a
      // drafting tool. Passing applicationId also writes the pipeline, and the
      // description is where that has to be said.
      description:
        "Craft a graceful rejection response that keeps the door open, maintains relationships, and " +
        "positions you for future opportunities. If you pass applicationId, this also sets that " +
        "application's status to `rejected` in your pipeline — it does not only write a draft.",
      inputSchema: {
        // Optional. Not completable — see the note in pipeline.ts and
        // src/completions.ts: MCP completions do not reach tool arguments.
        applicationId: z.string().optional().describe(
          "Pipeline application ID. Supplying it fills in the company and role from the pipeline AND " +
            "marks that application `rejected`. Leave it out to draft a reply and change nothing.",
        ),
        company: z.string().optional().describe("Company that sent the rejection. Filled in automatically when applicationId is given."),
        role: z.string().optional().describe("Role you were rejected for. Filled in automatically when applicationId is given."),
        rejectionContent: z.string().describe("The rejection email or message content"),
        responseGoal: z.enum(["keep_door_open", "request_feedback", "decline_gracefully", "express_continued_interest"]).default("keep_door_open").describe("What you want the reply to achieve: stay on good terms for future roles, ask why you were passed over, decline politely, or signal you would still take another opening there."),
        contactName: z.string().optional().describe("Person who sent the rejection"),
        hadGoodRapport: z.boolean().default(false).describe("Did you have positive interactions during the process?"),
      },
    },
    async ({ applicationId, company, role, rejectionContent, responseGoal, contactName, hadGoodRapport }) => {
      // Track whether the status was ACTUALLY changed. Reporting the update on
      // `applicationId` being present meant a bad id produced "status has been
      // automatically updated to 'rejected'" while nothing was written — the
      // tool claiming a state change it never made.
      let statusUpdated = false;
      if (applicationId) {
        // Same critical section as pipeline_update: this is a read-modify-write
        // on the shared pipeline file, so it must not straddle the lock.
        //
        // Wrapped in the same guard every pipeline_* write site uses: a claim
        // conflict, a corrupt pipeline, or a write against the read-only sample
        // store must come back as the told-plainly sentence, not escape as a raw
        // transport error that loses the reason nothing was written.
        try {
          await mutatePipeline((pipeline) => {
            const app = pipeline.applications.find(a => a.id === applicationId);
            // No match: return without mutating; mutatePipeline skips the write.
            if (!app) return;
            company = company ?? app.company;
            role = role ?? app.role;
            // Auto-update status to rejected
            app.status = "rejected";
            app.dateUpdated = new Date().toISOString();
            statusUpdated = true;
          });
        } catch (error) {
          if (isCorruptDataError(error) || isWriteClaimUnavailable(error) || isReadOnlyStore(error)) {
            return { content: [{ type: "text", text: `❌ ${(error as Error).message}` }] };
          }
          throw error;
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
${embedUntrusted("rejection message", rejectionContent)}

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

${statusUpdated
  ? `
**Note:** ${applicationId} is now marked 'rejected' in your pipeline.`
  : applicationId
    ? `
**Note:** No application matching \`${applicationId}\` is in your pipeline, so nothing was changed. The draft above still stands.`
    : ""}`,
        }],
      };
    }
  );

  server.registerTool(
    "capture_insight",
    {
      title: "Capture Career Insight",
      // Appends one entry to the career journal. Additive only: never rewrites or removes an existing entry.
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      description:
        "Record a durable career signal to your journal — what an interview surfaced, why an offer felt right or wrong, the pattern behind a rejection, fresh proof of a skill. Append-only; over time these compound into the real shape of your career and enrich future resume, interview, and fit work.",
      inputSchema: {
        type: z.enum([
          "fit_signal",
          "interview_insight",
          "offer_reflection",
          "rejection_pattern",
          "skill_evidence",
          "win",
          "note",
        ]).describe("What kind of signal this is"),
        summary: z.string().describe("One-line durable takeaway — the thing worth keeping"),
        detail: z.string().optional().describe("Longer context, if useful"),
        applicationId: z.string().optional().describe("Pipeline application ID this relates to"),
        company: z.string().optional().describe("Company this insight relates to, if any. Lets later prompts surface it when you work on that company again."),
        role: z.string().optional().describe("Role this insight relates to, if any."),
        signals: z.array(z.string()).default([]).describe("Recurring strengths, gaps, or keywords to track over time"),
        sentiment: z.enum(["positive", "neutral", "hard"]).optional().describe("Honest emotional read — 'hard' is valid and worth recording"),
        source: z.enum([
          "explore_opportunity",
          "prepare_interview",
          "evaluate_offer",
          "rejection",
          "ingest_document",
          "manual",
        ]).default("manual").describe("Which surface produced this insight"),
      },
    },
    async ({ type, summary, detail, applicationId, company, role, signals, sentiment, source }) => {
      const entry: JournalEntry = {
        id: randomUUID().slice(0, 8),
        date: new Date().toISOString(),
        type,
        summary,
        detail,
        applicationId,
        company,
        role,
        signals,
        sentiment,
        source,
      };

      let total: number;
      try {
        const all = await appendJournalEntry(entry);
        total = all.length;
      } catch (error) {
        if (isCorruptDataError(error)) {
          return {
            content: [{
              type: "text",
              text:
                `⚠️ Couldn't save the insight: your journal file exists but is unreadable, ` +
                `so I stopped rather than risk overwriting it.\n\n` +
                `Fix or restore \`journal.yaml\` (a timestamped \`.bak\` sits beside it), then try again.\n\n` +
                `Nothing was written; the insight below is unsaved:\n> ${summary}`,
            }],
          };
        }
        if (isWriteClaimUnavailable(error)) {
          // The same shape of answer as the corrupt case, for the same reason:
          // the write did not happen, the user can act on it, and the insight
          // itself must come back so it is not lost to a transport error.
          return {
            content: [{
              type: "text",
              text:
                `⚠️ Couldn't save the insight right now: ${error.message}\n\n` +
                `Nothing was written; the insight below is unsaved:\n> ${summary}`,
            }],
          };
        }
        throw error;
      }

      const meta = [
        company && `**${company}**`,
        role,
        applicationId && `\`${applicationId}\``,
        sentiment && `sentiment: ${sentiment}`,
      ].filter(Boolean).join(" · ");

      return {
        content: [{
          type: "text",
          text:
            `📓 Captured to your career journal (**${type}**).\n\n` +
            `> ${summary}\n` +
            (detail ? `\n${detail}\n` : "") +
            (meta ? `\n${meta}\n` : "") +
            (signals.length ? `\nSignals: ${signals.map((s) => `\`${s}\``).join(", ")}\n` : "") +
            `\nThat's **${total}** ${total === 1 ? "entry" : "entries"} on the record now. ` +
            `These accrue — the more you capture, the sharper future resume, interview, and fit work gets.`,
        }],
      };
    }
  );

  server.registerTool(
    "save_career_section",
    {
      title: "Save Career KB Section",
      // Overwrites one section file wholesale — a destructive update, so a host
      // always confirms. The previous contents are kept as a timestamped .bak.
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      description:
        "Write one section of the Career KB to disk. This is how the Career KB gets populated — " +
        "ingest_document and the resume tools only read and extract. Replaces the whole section, " +
        "so send the complete list you want stored, not just new entries. The previous version is " +
        "kept as a timestamped .bak next to it.",
      inputSchema: {
        section: z.enum(CAREER_SECTIONS).describe(
          "Which part of the Career KB to write. 'profile' is a single object; every other section is a list.",
        ),
        // Declared as a union, not `z.unknown()`: zod emits `{}` for unknown, and
        // a required property with no `type` is what made clients send this as a
        // JSON string and every write fail (#34). Object and array come first so
        // a client picks a structured form; `string` stays in the union so a
        // client that still stringifies reaches coerceSectionData and a useful
        // error, instead of being refused by the SDK before the handler runs.
        data: z.union([
          z.record(z.string(), z.unknown()),
          z.array(z.unknown()),
          z.string(),
        ]).describe(
          "The complete contents for this section — an object for 'profile', an array for every " +
            "other section. Send it as structured JSON, not as a stringified blob. " +
            "Shapes (? marks optional):\n\n" +
            SECTION_SHAPE_HELP,
        ),
      },
    },
    async ({ section, data }) => {
      // Validate against the same schema the loader enforces, BEFORE touching
      // disk. Writing first and validating on read would let one bad write make
      // the whole KB unloadable — loadCareerData fails closed on a corrupt
      // section, so an invalid profile.yaml takes every KB-backed tool down.
      // Clients that get no `type` for `data` send it as a JSON string; unwrap
      // that before validating, or every write from those clients is refused.
      const coerced = coerceSectionData(data);
      if (!coerced.ok) {
        return {
          isError: true,
          content: [{
            type: "text",
            text:
              `❌ ${coerced.message}\n\n` +
              `Expected \`${section}\`: ${SECTION_SHAPES[section]}`,
          }],
        };
      }

      const schema = CAREER_SECTION_SCHEMA[section];
      const parsed = schema.safeParse(coerced.value);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .slice(0, 6)
          .map((i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("\n");
        return {
          isError: true,
          content: [{
            type: "text",
            text:
              `❌ That doesn't match the shape of \`${section}\`, so nothing was written ` +
              `(your existing ${section}.yaml is untouched).\n\n${issues}` +
              (parsed.error.issues.length > 6 ? `\n  …and ${parsed.error.issues.length - 6} more` : "") +
              // The issue list says which field is wrong; it does not say what
              // right looks like. Repeating the shape here is what makes the
              // retry a correction rather than a guess.
              `\n\nExpected \`${section}\`: ${SECTION_SHAPES[section]}`,
          }],
        };
      }

      try {
        await saveCareerSection(section, parsed.data);
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `❌ Could not write ${section}: ${(error as Error).message}` }],
        };
      }

      const count = Array.isArray(parsed.data) ? parsed.data.length : 1;
      return {
        content: [{
          type: "text",
          text:
            `✅ Saved **${section}** (${count} ${count === 1 ? "entry" : "entries"}) to ` +
            `\`${join(getDataDir(), "career", `${section}.yaml`)}\`.\n\n` +
            `It's plain YAML — open it, edit it, or delete it any time. Nothing left your machine.`,
        }],
      };
    }
  );
}
