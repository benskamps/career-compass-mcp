import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadCareerData, loadPipeline } from "../storage/file-store.js";
import { guardedRead } from "./read-guard.js";
import { formatSignalDigest, INFERRED_TAG } from "./signal-digest.js";
import { embedUntrusted } from "../untrusted.js";
import { noCareerDataMessage } from "../empty-state.js";
import { COMPANY_FACTS_RULE, MARKET_DATA_RULE, RESPONSE_SHAPE, TRUTH_RULE } from "./truth-rule.js";
import {
  formatCredentials, formatProjects, formatRoles, formatTestimonials, narrativeBlock, storyBankBlock,
  storiesAlreadyHeard, RECORD_STORY_USE, type StoryAudience,
} from "./career-context.js";
import type { Application, CareerData, InterviewRound, JournalEntry, Pipeline } from "../schemas/career-schema.js";

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
      description:
        "Prep the user for one upcoming interview: an opening pitch, STAR stories (saved ones from their story bank " +
        "first, skipping any this company or interviewer already heard), likely questions for that round, questions to " +
        "ask, and the concerns to get ahead of, quoting their saved narrative where it applies. Finds the application by " +
        "id or company name and uses its posting, rounds, and contacts. For a later round in a process already under " +
        "way, call interview_arc too so the prep doesn't repeat ground covered. Writes nothing.",
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
      // Who has heard which saved story: the process, the company, the people in it.
      const audience: StoryAudience = { applicationId, company, interviewers: interviewerInfo ? [interviewerInfo] : [] };

      if (applicationId || company) {
        const pipeRead = await guardedRead(() => loadPipeline());
        if (!pipeRead.ok) return pipeRead.response;
        const app = findApplication(pipeRead.value, applicationId, company, role);
        // A wrong id was ignored silently, so prep went ahead without the
        // rounds and posting the user expected it to use. interview_arc already
        // refuses here; do the same.
        if (applicationId && !app) {
          return {
            isError: true,
            content: [{
              type: "text",
              text: `❌ No application with id \`${applicationId}\`. Run \`pipeline_view\` with action "list" to find it, or pass \`company\` instead.`,
            }],
          };
        }
        if (app) {
          company = company ?? app.company;
          role = role ?? app.role;
          postingText = postingText ?? app.postingText;
          audience.applicationId = app.id;
          audience.company = app.company;
          audience.interviewers = [
            ...(audience.interviewers ?? []),
            ...app.interviewRounds.flatMap(r => r.interviewers),
            ...app.contacts.map(c => c.name),
          ];
          const rounds = app.interviewRounds.map(r =>
            `  - ${r.type.replace(/_/g, " ")} (${r.date || "date not recorded"})` +
            `${r.interviewers.length ? `, with ${r.interviewers.join(", ")}` : ""}` +
            `${r.outcome ? `: ${r.outcome}` : ""}${r.notes ? `. ${r.notes}` : ""}`);
          appContext = `
**Application context** (pipeline entry \`${app.id}\`):
- Status: ${app.status}
- Applied: ${app.dateApplied ?? "Unknown"}${app.postingUrl ? `\n- Posting: ${app.postingUrl}` : ""}${salaryLine(app)}
- Rounds recorded: ${app.interviewRounds.length}${rounds.length ? `\n${rounds.join("\n")}` : ""}
- Notes: ${app.notes.join("; ") || "None"}
- Contacts: ${app.contacts.map(c => `${c.name}${c.title ? ` (${c.title})` : ""}`).join(", ") || "None"}`;
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
${interviewerInfo ? `**Interviewer:**\n${embedUntrusted("interviewer info", interviewerInfo)}` : ""}
${appContext}
${focusAreas ? `**Focus areas:**\n${embedUntrusted("focus areas", focusAreas)}` : ""}

## Career Highlights (for STAR stories)
${achievements.map(a => `- **${a.role} @ ${a.company}**: ${a.metric} — ${a.context} → ${a.impact}`).join("\n")}

## Candidate
${career.profile.name}${career.profile.summary ? `: ${career.profile.summary.replace(/\s+/g, " ").trim()}` : ""}

## Roles and scope
${formatRoles(career, 8)}

## Projects
${formatProjects(career)}

## Education and certifications
${formatCredentials(career)}

## Skills
${career.skills.map(s => s.name).join(", ") || "None listed"}

## What others have said
${formatTestimonials(career)}

${narrativeBlock(career)}

${storyBankBlock(career, audience)}

${formatSignalDigest(career.journal, 6, company)}
${postingText ? `## Job Posting\n${embedUntrusted("cached job posting", postingText)}` : ""}

---

**Instructions for Claude:**
Generate complete interview prep tailored to a ${interviewType.replace("_", " ")} at ${company ?? "this company"}:

### 1. Opening Pitch (60-90 seconds)
"Tell me about yourself" — tailored specifically to this role and company. Bridge my background to their context.

### 2. STAR Stories
Start from the story bank: where a saved story fits a likely question, use it verbatim and say it is a saved one${career.stories.length ? ", skipping any this company or these interviewers have already heard" : ""}. Only then build new ones, each from a real achievement in the Career KB, written out in full, and offer once to save the new ones to \`stories\`. For each story, provide:
- **Situation:** Brief context
- **Task:** What I was responsible for
- **Action:** What I specifically did (not "we")
- **Result:** The outcome as the Career KB records it, numbers copied exactly. If it records none, write [confirm: result?] rather than a number
- **Best used for:** Which question types this answers

Write 3-5 stories by default, the ones that best match the likely questions; more only if the KB has more strong ones.

Match stories to the likely question themes for ${interviewType}:
${interviewType === "behavioral" ? "- Leadership, conflict, failure, ambiguity, collaboration, influence, growth" : ""}
${interviewType === "technical" ? "- System design, problem-solving approach, debugging, technical decisions" : ""}
${interviewType === "phone_screen" ? "- Background, motivation, salary expectations, availability, logistics" : ""}
${interviewType === "panel" ? "- Cross-functional influence, stakeholder management, communication style" : ""}
${interviewType === "final" ? "- Vision, leadership, company fit, long-term goals, strategic thinking" : ""}
${interviewType === "negotiation" ? "- Compensation expectations, competing processes, start date, what would make me say yes. Use only numbers I have given" : ""}

### 3. Likely Questions (8-12)
Questions specific to ${company ?? "this company"} and ${role ?? "this role"}, with suggested answer angles from my background.

### 4. Questions to Ask (5-7)
Thoughtful questions that demonstrate genuine insight about the role, team, and company. Not generic.

### 5. Company & Role Alignment
How my background connects to what the posting and my notes say about ${company ?? "the company"} and this role. Don't describe their mission, product, or challenges beyond those sources unless you looked them up here.

### 6. Bridge Topics
Non-obvious connections between real items in my history and their world, things that will make me memorable. Each one names the Career KB item it rests on.

### 7. Watch-outs & Reframes
Likely concerns they'll have about my background, and how to address them proactively and honestly.

Before section 1, give me a three-line summary: the one story to lead with, the question I'm most likely to stumble on, and the one thing to prepare first.

${RESPONSE_SHAPE}

${COMPANY_FACTS_RULE}

${TRUTH_RULE}`,
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
      description: "For a user already partway through one company's interviews: reconstruct the process so far (rounds done, what " +
        "each surfaced, threads left open, which saved stories each round already heard) from the pipeline, the journal, " +
        "the story bank, and their notes, then project what the next " +
        "round will probe and how to prepare without repeating covered ground. Use prepare_interview instead for a first " +
        "interview. Writes nothing.",
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

      if (applicationId || company) {
        const pipeRead = await guardedRead(() => loadPipeline());
        if (!pipeRead.ok) return pipeRead.response;
        const app = findApplication(pipeRead.value, applicationId, company, role);
        if (!app && applicationId) {
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
        if (app) {
          applicationId = applicationId ?? app.id;
          company = company ?? app.company;
          role = role ?? app.role;
          rounds = app.interviewRounds;
          postingText = app.postingText;
          appContext = `- Status: ${app.status}
- Applied: ${app.dateApplied ?? "Unknown"}${app.postingUrl ? `\n- Posting: ${app.postingUrl}` : ""}${salaryLine(app)}
- Known contacts: ${app.contacts.map(c => `${c.name}${c.title ? ` (${c.title})` : ""}`).join(", ") || "None recorded"}
- Running notes: ${app.notes.join(" · ") || "None"}`;
        }
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
      const told = storiesToldInProcess(career, {
        applicationId,
        company,
        interviewers: rounds.flatMap(r => r.interviewers),
      });

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

## Stories Already Told in This Process
${told || "_None recorded. Saved stories carry a usedWith list; nothing in it matches this process yet._"}

## Career Context
${buildArcCareerContext(career)}

${narrativeBlock(career)}

${formatSignalDigest(career.journal, 6, company)}${interviewSoFarNotes ? `## Notes On What Has Happened So Far\n${embedUntrusted("interview notes", interviewSoFarNotes)}\n` : ""}${postingText ? `\n## Job Posting (cached from the pipeline)\n${embedUntrusted("cached job posting", postingText)}\n` : ""}
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
re-running a story they already have reads as having nothing else. Name the saved stories
already told above by round and by who heard them ("you told Priya that one already"), and
pick different saved stories for the next round.

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
what makes the next projection in this process, and the next process, sharper. ${RECORD_STORY_USE}

${TRUTH_RULE}`,
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
      description:
        "Analyze a job offer the user has received: total compensation year one and fully vested, how it compares to their " +
        "current pay, stated targets, other offers (including live offers already recorded in their pipeline, side by " +
        "side), and any market data they supply, then what to negotiate and the exact words. Use it when the user has an " +
        "offer in hand. Benchmarks come only from data the user gives; the server never fetches salary data. Writes " +
        "nothing; it ends by offering to record the offer and its deadline with pipeline_update, for the user's OK.",
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
      // The pipeline is read every time now, not only for an id: other offers
      // recorded with pipeline_update belong in the comparison, and the user
      // shouldn't have to retype a competing offer the tool already holds. Only
      // an explicit id makes an unreadable pipeline fatal, as before; otherwise
      // the review goes ahead without the side-by-side.
      const pipeRead = await guardedRead(() => loadPipeline());
      if (!pipeRead.ok && applicationId) return pipeRead.response;
      const pipeline = pipeRead.ok ? pipeRead.value : undefined;
      const app = pipeline ? findApplication(pipeline, applicationId, company, role) : undefined;
      if (app) { company = company ?? app.company; role = role ?? app.role; }
      const recorded = pipeline ? otherRecordedOffers(pipeline, app?.id) : [];
      // Recording the offer is what puts its deadline at the top of the daily
      // digest. This used to fire only for a matched application with no
      // deadline saved, so a new offer from a company with an older record (or
      // none) was weighed and never recorded. The model sees what is on file and
      // compares it with what the user just said.
      const onFile = app?.offer
        ? `\n## Offer already on record for this application (\`${app.id}\`, status ${app.status})\n${offersTable([app])}\n`
        : "";
      const deadlineOffer = app
        ? `\nEnd your reply with one offer: record this offer on application \`${app.id}\` with \`pipeline_update\` ` +
          `(\`status: "offer"\`, \`offerBaseSalary\` and any other figure exactly as stated, \`offerExpiresDate\` as YYYY-MM-DD ` +
          `for a deadline they gave, such as "Friday"), so the deadline leads their daily digest. ` +
          `${app.offer ? "If what is on record above already matches what they told you, skip this offer. If it differs, say so in one line and offer to update it. " : ""}` +
          `Show the exact fields, ask first, write only with their OK, and never guess a date or a figure.\n`
        : `\nEnd your reply with one offer: track this offer so its deadline leads their daily digest, with \`pipeline_add\` ` +
          `(company, role, \`status: "offer"\`) and then \`pipeline_update\` with the offer figures and \`offerExpiresDate\` ` +
          `exactly as stated. Ask first and write only with their OK.\n`;

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
${onFile}${recorded.length ? `\n## Other Offers on Record (from the pipeline)\n${offersTable(recorded)}\n` : ""}
---

**Instructions for Claude:**
${recorded.length ? `\nPut this offer side by side with the other offers on record above (base, bonus, equity, start, deadline), using only the figures recorded there; a blank cell is unknown, not zero. Weigh the deadlines: an offer that expires first may need an answer or an extension request before the others land.\n` : ""}
### 1. Total Compensation Breakdown
Break down every component with annualized values:
- Base salary
- Target bonus (% and $ amount)
- Equity (grant, vesting schedule, cliff; a dollar value only if the valuation or price per share and the share count are known, otherwise list exactly what to ask for)
- Benefits (health, 401k match, PTO, etc.): list what the offer states; put a dollar value only on what it states in dollars
- **Total Year 1 comp**
- **Total Year 4 comp** (fully vested)

### 2. Market Comparison
Compare to market rate for ${role ?? "this role"} at ${company ?? "this company type"}'s stage/size${location ? ` in ${location}` : ""}:
${marketData ? "- Compare against the market data above, citing it\n- How does this offer rank against it?" : "- No market data was provided, so do not state benchmarks or norms. Say so in one line and name where to get it (Levels.fyi, Glassdoor, Carta, a trusted recruiter)\n- Compare instead against my current pay, my stated targets, and any other offers"}

### 3. Negotiation Strategy
- What should I push on first?
- What's likely moveable vs. fixed?
- What's my target and walk-away?
- How does leverage from ${otherOffers ? "competing offers" : "my position"} play in?

### 4. Counter Script
Exact words for the negotiation call, built on a reason that is true for me: ${marketData ? "the market data above" : "my current pay, my stated targets, or another offer, whichever I actually have. No market data was given, so the script must not claim I researched market rates"}${otherOffers ? ", and the competing offer, stated only as specifically as I described it" : ""}. Example shape:
> "Thank you for the offer. I'm excited about the role at ${company ?? "the company"}. Based on [the true reason], I was hoping we could get to [specific number]. Is there flexibility there?"

Provide 2-3 variations depending on their response. Fill the brackets from my data, or leave them as [confirm: ...] placeholders.

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
Score this offer on: compensation, growth, culture fit, role scope, company trajectory, risk. Score only what my data supports and mark the rest "unknown" with the question that would settle it.
Overall recommendation: Accept / Negotiate / Decline? Put this recommendation and the first thing to negotiate at the very top of your reply, before section 1.

${RESPONSE_SHAPE}
${deadlineOffer}
${MARKET_DATA_RULE}

${TRUTH_RULE}`,
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
/**
 * The pipeline entry this prep is about. The id is exact; without one, match the
 * company name (and role, when several share a company), newest first. Users say
 * "my Veridian final", not "demo-001", so a company-only lookup that found nothing
 * told the model "0 rounds recorded" for a process with two rounds on file.
 */
export function findApplication(
  pipeline: Pipeline,
  applicationId: string | undefined,
  company: string | undefined,
  role: string | undefined,
): Application | undefined {
  if (applicationId) return pipeline.applications.find(a => a.id === applicationId);
  if (!company) return undefined;
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const want = norm(company);
  const byCompany = pipeline.applications
    .filter(a => norm(a.company) === want)
    .sort((a, b) => (b.dateUpdated ?? "").localeCompare(a.dateUpdated ?? ""));
  if (byCompany.length <= 1 || !role) return byCompany[0];
  return byCompany.find(a => norm(a.role) === norm(role)) ?? byCompany[0];
}

/** Statuses where a recorded offer is still live: on the table or being negotiated. */
const LIVE_OFFER_STATUSES = new Set(["offer", "negotiating"]);

/** Every other live offer recorded in the pipeline, newest update first. */
export function otherRecordedOffers(pipeline: Pipeline, excludeId: string | undefined): Application[] {
  return pipeline.applications
    .filter(a => a.id !== excludeId && a.offer && LIVE_OFFER_STATUSES.has(a.status))
    .sort((a, b) => (b.dateUpdated ?? "").localeCompare(a.dateUpdated ?? ""));
}

/** Recorded offers as a markdown table. Missing figures stay blank, never zero. */
export function offersTable(apps: Application[]): string {
  const fmt = (n: number | undefined, cur: string) => (n === undefined ? "" : `${cur} ${n.toLocaleString("en-US")}`);
  // Free-text fields came from the user via pipeline_update; keep a pipe from breaking the table.
  const cell = (s: string | undefined) => (s ?? "").replace(/\|/g, "/").replace(/\s+/g, " ").trim();
  const rows = apps.map(a => {
    const o = a.offer!;
    return `| ${cell(a.company)} (\`${a.id}\`) | ${cell(a.role)} | ${a.status} | ${fmt(o.baseSalary, o.currency)} | ${fmt(o.bonus, o.currency)} | ${cell(o.equity)} | ${cell(o.startDate)} | ${cell(o.expiresDate)} |`;
  });
  return [
    "| Company | Role | Status | Base | Bonus | Equity | Start | Expires |",
    "|---|---|---|---|---|---|---|---|",
    ...rows,
  ].join("\n");
}

/** The posted pay range saved on the application, as a context line, or nothing. */
function salaryLine(app: Application): string {
  const r = app.salaryRange;
  if (!r || (r.min === undefined && r.max === undefined)) return "";
  const fmt = (n: number) => n.toLocaleString("en-US");
  const band = r.min !== undefined && r.max !== undefined ? `${fmt(r.min)}–${fmt(r.max)}`
    : r.min !== undefined ? `from ${fmt(r.min)}` : `up to ${fmt(r.max!)}`;
  return `\n- Salary range on file: ${r.currency} ${band}`;
}

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
    const inferred = e.origin === "inferred" ? ` ${INFERRED_TAG}` : "";
    items.push({
      key: dateKey(day),
      line: `- **Signal — ${e.type}** (${day || "date not recorded"}) — ${e.summary}${detail}${tags}${mood}${inferred}`,
    });
  }

  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => (a.item.key < b.item.key ? -1 : a.item.key > b.item.key ? 1 : a.i - b.i))
    .map(({ item }) => item.line)
    .join("\n");
}

/**
 * The saved stories this process has already heard, grouped by round, so the
 * arc can say "the panel heard the turnaround story from you; Priya heard the
 * vendor one" and steer the next round elsewhere. "" when none are recorded.
 */
export function storiesToldInProcess(career: CareerData, audience: StoryAudience): string {
  const byRound = new Map<string, string[]>();
  for (const { story, use } of storiesAlreadyHeard(career, audience)) {
    const round = [use.round, use.date].filter(Boolean).join(", ") || "round not recorded";
    const line = `"${story.title}"${use.interviewer ? ` to ${use.interviewer}` : ""}`;
    byRound.set(round, [...(byRound.get(round) ?? []), line]);
  }
  return [...byRound.entries()].map(([round, lines]) => `- **${round}:** ${lines.join("; ")}`).join("\n");
}

/**
 * Compact career context for the arc projection.
 *
 * Deliberately not a `JSON.stringify(career)` dump (prepare_interview used one until 2.9.7):
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
