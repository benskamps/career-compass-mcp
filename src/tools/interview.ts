import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadCareerData, loadPipeline } from "../storage/file-store.js";
import { guardedRead } from "./read-guard.js";
import { formatSignalDigest } from "./signal-digest.js";
import { embedUntrusted } from "../untrusted.js";
import { noCareerDataMessage } from "../empty-state.js";
import type { CareerData, InterviewRound, JournalEntry } from "../schemas/career-schema.js";

export function registerInterviewTools(server: McpServer): void {

  server.registerTool(
    "prepare_interview",
    {
      title: "Prepare Interview",
      // Reads the Career KB and pipeline and returns prep material. Writes nothing.
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      description: "Generate comprehensive interview prep: STAR stories, likely questions, company alignment, and bridge topics — tailored to interview type.",
      inputSchema: {
        applicationId: z.string().optional().describe("Pipeline application ID"),
        company: z.string().optional().describe("Company name (if no application ID)"),
        role: z.string().optional().describe("Role title (if no application ID)"),
        interviewType: z.enum(["phone_screen", "behavioral", "technical", "panel", "final", "negotiation"]).describe("Type of interview"),
        interviewerInfo: z.string().optional().describe("Interviewer name, title, LinkedIn — helps personalize prep"),
        postingText: z.string().optional().describe("Job posting text for this role"),
        focusAreas: z.string().optional().describe("Specific topics or concerns to focus on"),
      },
    },
    async ({ applicationId, company, role, interviewType, interviewerInfo, postingText, focusAreas }) => {
      // Reads fail-closed: a corrupt profile.yaml or applications.yaml, or an
      // unavailable store, must surface as a repair sentence rather than a raw
      // transport error — the same graceful surfacing the write tools carry.
      const careerRead = await guardedRead(() => loadCareerData());
      if (!careerRead.ok) return careerRead.response;
      const career = careerRead.value;
      let appContext = "";

      if (applicationId) {
        const pipeRead = await guardedRead(() => loadPipeline());
        if (!pipeRead.ok) return pipeRead.response;
        const pipeline = pipeRead.value;
        const app = pipeline.applications.find(a => a.id === applicationId);
        if (app) {
          company = company ?? app.company;
          role = role ?? app.role;
          postingText = postingText ?? app.postingText;
          appContext = `
**Application context:**
- Status: ${app.status}
- Applied: ${app.dateApplied ?? "Unknown"}
- Rounds completed: ${app.interviewRounds.length}
- Notes: ${app.notes.join("; ") || "None"}
- Contacts: ${app.contacts.map(c => `${c.name} (${c.title})`).join(", ") || "None"}`;
        }
      }

      if (!career) {
        return {
          content: [{ type: "text", text: noCareerDataMessage() }],
        };
      }

      const achievements = career.experience
        .flatMap(e => e.achievements.map(a => ({
          role: e.role,
          company: e.company,
          metric: a.metric,
          context: a.context,
          impact: a.impact,
        })))
        .slice(0, 20);

      return {
        content: [{
          type: "text",
          text: `# Interview Prep: ${interviewType.replace("_", " ").toUpperCase()}

**Company:** ${company ?? "Not specified"}
**Role:** ${role ?? "Not specified"}
**Interview type:** ${interviewType}
${interviewerInfo ? `**Interviewer:** ${interviewerInfo}` : ""}
${appContext}
${focusAreas ? `**Focus areas:** ${focusAreas}` : ""}

## Career Highlights (for STAR stories)
${achievements.map(a => `- **${a.role} @ ${a.company}**: ${a.metric} — ${a.context} → ${a.impact}`).join("\n")}

## Full Career KB
${JSON.stringify(career, null, 2)}

${formatSignalDigest(career.journal)}
${postingText ? `## Job Posting\n${embedUntrusted("cached job posting", postingText)}` : ""}

---

**Instructions for Claude:**
Generate complete interview prep tailored to a ${interviewType.replace("_", " ")} at ${company ?? "this company"}:

### 1. Opening Pitch (60-90 seconds)
"Tell me about yourself" — tailored specifically to this role and company. Bridge my background to their context.

### 2. STAR Stories (7-10 stories)
For each story, provide:
- **Situation:** Brief context
- **Task:** What I was responsible for
- **Action:** What I specifically did (not "we")
- **Result:** Quantified outcome
- **Best used for:** Which question types this answers

Match stories to the likely question themes for ${interviewType}:
${interviewType === "behavioral" ? "- Leadership, conflict, failure, ambiguity, collaboration, influence, growth" : ""}
${interviewType === "technical" ? "- System design, problem-solving approach, debugging, technical decisions" : ""}
${interviewType === "phone_screen" ? "- Background, motivation, salary expectations, availability, logistics" : ""}
${interviewType === "panel" ? "- Cross-functional influence, stakeholder management, communication style" : ""}
${interviewType === "final" ? "- Vision, leadership, company fit, long-term goals, strategic thinking" : ""}

### 3. Likely Questions (10-15)
Questions specific to ${company ?? "this company"} and ${role ?? "this role"}, with suggested answer angles from my background.

### 4. Questions to Ask (7-10)
Thoughtful questions that demonstrate genuine insight about the role, team, and company. Not generic.

### 5. Company & Role Alignment
How my background specifically connects to ${company ?? "their"} mission, product, and current challenges.

### 6. Bridge Topics
Surprising connections between my experience and their world — things that will make me memorable.

### 7. Watch-outs & Reframes
Likely concerns they'll have about my background, and how to address them proactively and honestly.`,
        }],
      };
    }
  );

  server.registerTool(
    "interview_arc",
    {
      title: "Project Interview Arc",
      // Reads the Career KB and pipeline and returns a projection. Writes nothing.
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      description: "Mid-process projection: reconstructs the interview arc so far — rounds completed, what each surfaced, threads left open — then projects what the NEXT round will probe, without repeating ground already covered.",
      inputSchema: {
        applicationId: z.string().optional().describe("Pipeline application ID — pulls the rounds, posting, and linked journal entries for this process"),
        company: z.string().optional().describe("Company name (if no application ID, or to match journal entries)"),
        role: z.string().optional().describe("Role title (if no application ID, or to match journal entries)"),
        interviewSoFarNotes: z.string().optional().describe("Freeform notes on what has happened so far — questions they asked, what you answered, where the last interview stopped"),
        nextRoundType: z.enum(["phone_screen", "behavioral", "technical", "panel", "final", "offer_call", "other"]).optional().describe("Type of the upcoming round, if you know it. Omit and the projection will infer the likely next stage."),
      },
    },
    async ({ applicationId, company, role, interviewSoFarNotes, nextRoundType }) => {
      let rounds: InterviewRound[] = [];
      let postingText: string | undefined;
      let appContext = "";

      if (applicationId) {
        const pipeRead = await guardedRead(() => loadPipeline());
        if (!pipeRead.ok) return pipeRead.response;
        const pipeline = pipeRead.value;
        const app = pipeline.applications.find(a => a.id === applicationId);
        if (!app) {
          return {
            isError: true,
            content: [{
              type: "text",
              text:
                `❌ No application with id \`${applicationId}\` in your pipeline. ` +
                `Run \`pipeline_view\` with action "list" to see the ids you have, or call this ` +
                `tool with \`company\` and \`role\` instead.`,
            }],
          };
        }
        company = company ?? app.company;
        role = role ?? app.role;
        rounds = app.interviewRounds;
        postingText = app.postingText;
        appContext = `- Status: ${app.status}
- Applied: ${app.dateApplied ?? "Unknown"}
- Known contacts: ${app.contacts.map(c => `${c.name}${c.title ? ` (${c.title})` : ""}`).join(", ") || "None recorded"}
- Running notes: ${app.notes.join(" · ") || "None"}`;
      }

      if (!applicationId && !company && !interviewSoFarNotes) {
        return {
          isError: true,
          content: [{
            type: "text",
            text:
              `❌ Nothing to reconstruct an arc from. Give me one of: an \`applicationId\` ` +
              `from your pipeline, a \`company\` (with \`role\` if you have it), or ` +
              `\`interviewSoFarNotes\` describing where the process stopped.`,
          }],
        };
      }

      const careerRead = await guardedRead(() => loadCareerData());
      if (!careerRead.ok) return careerRead.response;
      const career = careerRead.value;
      if (!career) {
        return { content: [{ type: "text", text: noCareerDataMessage() }] };
      }

      const journal = matchingJournal(career.journal, applicationId, company, role);
      const timeline = buildTimeline(rounds, journal);

      return {
        content: [{
          type: "text",
          text: `# Interview Arc: ${role ?? "Role"} at ${company ?? "Company"}

**Rounds recorded:** ${rounds.length}
**Journal entries linked to this process:** ${journal.length}
**Next round:** ${nextRoundType ? nextRoundType.replace(/_/g, " ") : "not specified — infer it"}
${appContext ? `\n**Application context:**\n${appContext}` : ""}

## The Arc So Far
${timeline || "_Nothing recorded yet — no interview rounds in the pipeline and no journal entries matched this company and role._"}

## Career Context
${buildArcCareerContext(career)}

${formatSignalDigest(career.journal)}${interviewSoFarNotes ? `## Notes On What Has Happened So Far\n${embedUntrusted("interview notes", interviewSoFarNotes)}\n` : ""}${postingText ? `\n## Job Posting (cached from the pipeline)\n${embedUntrusted("cached job posting", postingText)}\n` : ""}
---

**Instructions for Claude:**
Project the **next** interview round from where the last one stopped. This is not general
prep — the value here is continuity: what they have already covered, what they opened and
did not close, and what they have not tested yet.

### 1. Where the Process Actually Stands
Reconstruct the arc from the timeline above in your own words: rounds completed, who was in
each, what each one appeared to be testing. Be explicit about what is *recorded* versus what
you are inferring — if the notes are thin, say the arc is partly guesswork rather than
inventing detail.

### 2. Ground Already Covered — Do Not Repeat
List the questions and themes that have already been asked and answered across the rounds
above. Anything on this list should NOT appear in section 4. Interviewers compare notes;
re-running a story they already have reads as having nothing else.

### 3. Open Threads
Things the last round opened and did not close: a question that got a partial answer, a
follow-up that was promised, a topic an interviewer circled twice, a stumble that was noted
but not resolved. For each, say who owns it and what closing it would look like. These are
the highest-probability next questions, because the interviewer already flagged them.

### 4. Untested Gaps
Cross the posting's requirements${postingText ? " (cached above)" : " (as you understand the role)"} against what the rounds have actually
probed. What has nobody asked about yet? Rank these by how likely the next round is to reach
for them${nextRoundType ? `, given that the next round is a ${nextRoundType.replace(/_/g, " ")}` : ", and say which stage would typically reach for each"}.

### 5. Likely Next-Round Questions (ranked)
8-12 concrete questions the next interviewer is most likely to ask, ordered by probability.
For each: one line on why *this* process points at it (an open thread, an untested gap, a
recurring signal from the journal), and the specific piece of the career history to answer
with. Draw on sections 3 and 4 — do not produce a generic question bank.

### 6. What To Prepare Tonight
The three things worth the preparation time, given the projection above, and the one thing
that would most change their read of you if it landed.

---

After the round happens, capture what they actually asked with \`capture_insight\`
(\`type: "interview_insight"\`${applicationId ? `, \`applicationId: "${applicationId}"\`` : ""}) — including where this projection was wrong. That is
what makes the next projection in this process, and the next process, sharper.`,
        }],
      };
    }
  );

  server.registerTool(
    "evaluate_offer",
    {
      title: "Evaluate Offer",
      // Reads the Career KB and returns an offer analysis. Writes nothing.
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      description: "Analyze a job offer: break down total compensation, compare to market, build negotiation strategy, and draft counter scripts.",
      inputSchema: {
        applicationId: z.string().optional().describe("Pipeline application ID"),
        company: z.string().optional().describe("Company making the offer. Used to pull the matching application for context."),
        role: z.string().optional().describe("Role being offered."),
        offerDetails: z.string().describe("Full offer: base salary, bonus, equity, benefits, start date, title"),
        location: z.string().optional().describe("Work location (affects cost of living calc)"),
        currentComp: z.string().optional().describe("Your current total comp for comparison"),
        marketData: z.string().optional().describe("Salary research from Levels.fyi, Glassdoor, LinkedIn, etc."),
        priorities: z.string().optional().describe("What matters most: cash, equity, flexibility, title, growth?"),
        otherOffers: z.string().optional().describe("Competing offers or processes (for leverage)"),
      },
    },
    async ({ applicationId, company, role, offerDetails, location, currentComp, marketData, priorities, otherOffers }) => {
      if (applicationId) {
        const pipeRead = await guardedRead(() => loadPipeline());
        if (!pipeRead.ok) return pipeRead.response;
        const pipeline = pipeRead.value;
        const app = pipeline.applications.find(a => a.id === applicationId);
        if (app) { company = company ?? app.company; role = role ?? app.role; }
      }

      return {
        content: [{
          type: "text",
          text: `# Offer Evaluation: ${role ?? "Role"} at ${company ?? "Company"}

## Offer Details
${embedUntrusted("offer details", offerDetails)}

${location ? `**Location:** ${location}` : ""}
${currentComp ? `**Current comp:** ${currentComp}` : ""}
${marketData ? `**Market data:**\n${embedUntrusted("market data", marketData)}` : ""}
${priorities ? `**My priorities:** ${priorities}` : ""}
${otherOffers ? `**Other offers/processes:** ${otherOffers}` : ""}

---

**Instructions for Claude:**

### 1. Total Compensation Breakdown
Break down every component with annualized values:
- Base salary
- Target bonus (% and $ amount)
- Equity (value at current valuation, vesting schedule, cliff)
- Benefits (health, 401k match, PTO, etc. — assign approximate $ values)
- **Total Year 1 comp**
- **Total Year 4 comp** (fully vested)

### 2. Market Comparison
Compare to market rate for ${role ?? "this role"} at ${company ?? "this company type"}'s stage/size${location ? ` in ${location}` : ""}:
- P25, P50, P75 benchmarks (cite sources if market data provided)
- How does this offer rank?
- Is this competitive, low, or above market?

### 3. Negotiation Strategy
- What should I push on first?
- What's likely moveable vs. fixed?
- What's my target and walk-away?
- How does leverage from ${otherOffers ? "competing offers" : "my position"} play in?

### 4. Counter Script
Exact words for the negotiation call:
> "Thank you so much for the offer — I'm genuinely excited about the opportunity at ${company ?? "the company"}. I've done some research on market rates for this role, and I was hoping we could discuss the compensation a bit. Based on [X], I was hoping we could get to [specific number]. Is there flexibility there?"

Provide 2-3 variations depending on their response.

### 5. Alternative Asks
If base is firm, what else to ask for:
- Signing bonus
- Equity acceleration or refresh schedule
- Earlier first review
- Additional PTO
- Remote flexibility
- Title adjustment
- Equipment/home office budget

### 6. Decision Framework
Score this offer on: compensation, growth, culture fit, role scope, company trajectory, risk
Overall recommendation: Accept / Negotiate / Decline?`,
        }],
      };
    }
  );
}

// ─── Interview arc helpers ─────────────────────────────────────────────────────

/**
 * The journal entries that belong to one hiring process.
 *
 * `applicationId` is the precise link, but almost nothing sets it today:
 * `capture_insight` only carries it when the caller passes it, so a real
 * journal is mostly entries tagged with company and role. Matching on the id
 * alone would therefore reconstruct an empty arc for most users. So: prefer the
 * id when it actually matches something, and otherwise fall back to a
 * case-insensitive company (+ role, when known) match.
 */
function matchingJournal(
  journal: JournalEntry[],
  applicationId: string | undefined,
  company: string | undefined,
  role: string | undefined,
): JournalEntry[] {
  if (applicationId) {
    const byId = journal.filter(e => e.applicationId === applicationId);
    if (byId.length > 0) return byId;
  }
  if (!company) return [];
  const eq = (a: string | undefined, b: string) => a?.trim().toLowerCase() === b.trim().toLowerCase();
  return journal.filter(e => eq(e.company, company) && (!role || eq(e.role, role)));
}

/** Sort key that keeps undated items last without reordering them among themselves. */
function dateKey(date: string | undefined): string {
  return date && date.trim() ? date : "￿";
}

/**
 * One chronological list interleaving recorded rounds with journal signals.
 *
 * The two halves are the whole point: `interviewRounds` says a panel happened
 * and who was in it; the journal says the capacity-optimization story landed and
 * the compliance question did not. Neither alone tells you what the next
 * interviewer will reach for.
 */
function buildTimeline(rounds: InterviewRound[], journal: JournalEntry[]): string {
  const items: Array<{ key: string; line: string }> = [];

  for (const r of rounds) {
    const parts = [
      `**Round — ${r.type.replace(/_/g, " ")}** (${r.date || "date not recorded"})`,
      r.interviewers.length ? `interviewers: ${r.interviewers.join(", ")}` : "interviewers: not recorded",
      r.outcome ? `outcome: ${r.outcome}` : "outcome: not recorded",
    ];
    if (r.notes) parts.push(`notes: ${r.notes}`);
    items.push({ key: dateKey(r.date), line: `- ${parts.join(" · ")}` });
  }

  for (const e of journal) {
    const day = (e.date ?? "").slice(0, 10);
    const tags = e.signals.length ? ` _[${e.signals.join(", ")}]_` : "";
    const mood = e.sentiment ? ` (${e.sentiment})` : "";
    const detail = e.detail ? ` — ${e.detail}` : "";
    items.push({
      key: dateKey(day),
      line: `- **Signal — ${e.type}** (${day || "date not recorded"}) — ${e.summary}${detail}${tags}${mood}`,
    });
  }

  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => (a.item.key < b.item.key ? -1 : a.item.key > b.item.key ? 1 : a.i - b.i))
    .map(({ item }) => item.line)
    .join("\n");
}

/**
 * Compact career context for the arc projection.
 *
 * Deliberately not the `JSON.stringify(career)` dump `prepare_interview` uses:
 * projecting the next round needs the evidence (achievements, skills, targets),
 * not the legal name, phone number and salary floor. Less to leak, and a
 * shorter, better-attended prompt.
 */
function buildArcCareerContext(career: CareerData): string {
  const achievements = career.experience
    .flatMap(e => e.achievements.map(a => `- **${e.role} @ ${e.company}**: ${a.metric} — ${a.context} → ${a.impact}`))
    .slice(0, 15);
  const skills = career.skills.slice(0, 15).map(s => s.name).join(", ");

  return `**Target roles:** ${career.profile.targetRoles.join(", ") || "Not specified"}
**Key skills:** ${skills || "None listed"}

**Evidence available for answers:**
${achievements.join("\n") || "- None recorded yet"}`;
}
