import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { embedUntrusted } from "../untrusted.js";
import { MARKET_DATA_RULE, TRUTH_RULE } from "../tools/truth-rule.js";
import { clockNow } from "../clock.js";

/** Tomorrow in the user's own timezone, YYYY-MM-DD: the debrief's proposed follow-up date. */
export function tomorrow(now: Date = clockNow()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function registerPrompts(server: McpServer): void {

  server.registerPrompt(
    "resume-tailor",
    {
      title: "Resume Tailor",
      description: "Generate a tailored, ATS-optimized resume for a specific job posting using your Career KB",
      argsSchema: {
        posting: z.string().describe("Full job posting text or URL"),
        format: z.enum(["standard", "federal", "academic", "functional"]).optional().describe("Resume format style"),
        pages: z.coerce.number().min(1).max(4).optional().describe("Target page count (1–4)"),
        notes: z.string().optional().describe("Any special instructions or context"),
      },
    },
    ({ posting, format = "standard", pages = 2, notes }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `You are an expert resume writer and career coach. Using the career data from my Career Knowledge Base (read career://full), create a tailored, ATS-optimized resume for the following job posting.

**Job Posting:**
${embedUntrusted("job posting", posting)}

**Format:** ${format}
**Target length:** ${pages} page(s)
${notes ? `**Special instructions:**\n${embedUntrusted("user notes", notes)}` : ""}

**Requirements:**
- Match the language and keywords from the posting exactly where truthful
- Lead with a strong summary that bridges my experience to this specific role
- Prioritize achievements most relevant to this posting (use impact metrics)
- Use clean formatting: no tables, no columns, no graphics (ATS-safe)
- Industry-agnostic: adapt terminology to match the posting's domain
- Be truthful — only include things from my actual career history
- Surface transferable skills even if the industry differs
- Flag any gaps honestly but frame positively
- Mark anything that needs my confirmation with a [confirm: ...] placeholder

Start by reading career://full, then produce the complete resume.

${TRUTH_RULE}`,
        },
      }],
    })
  );

  server.registerPrompt(
    "negotiation-coach",
    {
      title: "Negotiation Coach",
      description: "Evaluate an offer and build a negotiation strategy with roleplay support",
      argsSchema: {
        applicationId: z.string().optional().describe("Pipeline application ID"),
        company: z.string().describe("Company name"),
        role: z.string().describe("Role title"),
        offerDetails: z.string().describe("Full offer details: base, bonus, equity, benefits, start date"),
        marketData: z.string().optional().describe("Any salary research you have"),
        priorities: z.string().optional().describe("What matters most to you: salary, equity, flexibility, etc."),
      },
    },
    ({ applicationId, company, role, offerDetails, marketData, priorities }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `You are an expert compensation negotiation coach. Help me evaluate and negotiate this offer.

**Company:** ${company}
**Role:** ${role}
${applicationId ? `**Application:** career://pipeline/${applicationId}` : ""}

**Offer details:**
${embedUntrusted("offer details", offerDetails)}

${marketData ? `**My market research:**\n${embedUntrusted("market data", marketData)}` : ""}
${priorities ? `**My priorities:**\n${embedUntrusted("priorities", priorities)}` : ""}

Please provide:

1. **Offer analysis** — Break down total compensation (base + bonus + equity + benefits), annualized
2. **Market comparison** — ${marketData ? "How this compares to the market research above, citing it" : "No market research was given, so don't state benchmarks; say where to get them and compare against my priorities instead"}
3. **Negotiation strategy** — What to push on, in what order, and why
4. **Opening script** — Exact words to use when countering, resting only on reasons that are true for me
5. **Concession plan** — What to give up if they push back, and what to hold firm on
6. **Alternative asks** — Non-salary items to request if base is fixed (signing bonus, equity cliff, remote days, title)
7. **Roleplay** — Play the hiring manager responding to my counter, then coach me through it

Then ask me if I want to do a full negotiation roleplay.

${MARKET_DATA_RULE}

${TRUTH_RULE}`,
        },
      }],
    })
  );

  // ── Ritual prompts ──────────────────────────────────────────────────────────
  // A post-interview capture and a weekly reflection, each orchestrating
  // existing tools/resources rather than adding new ones. Free-text the user
  // pastes is fenced like everywhere else.
  //
  // `daily-review`, `interview-coach` and `setup-career-kb` were retired: each
  // duplicated a plugin skill (/today, /interview-prep, /start), and in Claude
  // Code they showed up beside those skills as a second name for the same thing.

  server.registerPrompt(
    "post-interview-debrief",
    {
      title: "Post-Interview Debrief",
      description: "Capture what an interview surfaced while it's fresh, then set up the next step",
      argsSchema: {
        company: z.string().describe("Company name"),
        role: z.string().describe("Role title"),
        applicationId: z.string().optional().describe("Pipeline application ID, if tracked"),
        howItWent: z.string().describe("Your raw notes: what was asked, how you did, what you learned, how it felt"),
      },
    },
    ({ company, role, applicationId, howItWent }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `You are my interview debrief partner. Help me capture this while it is fresh and turn it into the next move — the value of the journal is that it compounds honestly over time.

**Company:** ${company}
**Role:** ${role}
${applicationId ? `**Application:** career://pipeline/${applicationId}` : ""}

**My raw notes:**
${embedUntrusted("interview debrief notes", howItWent)}

Please:

1. **Reflect it back** — a tight summary of what happened and what it tells us about my fit and their process
2. **Capture the durable signal** — call \`capture_insight\` (type \`interview_insight\`, this company/role, honest \`sentiment\`) with the one or two things worth keeping; include any recurring strength or gap as a \`signals\` entry
3. **Advance the pipeline** — if the stage changed, propose the \`pipeline_update\` to make (ask before writing)
4. **Thank-you notes** — for each interviewer my notes name, draft a 4-sentence thank-you that quotes or refers to one specific thing from my own notes above about that conversation. Use only what my notes say: if they give nothing specific for someone, write \`[confirm: one thing you discussed with <name>]\` instead of inventing a topic. If my notes name no interviewers, draft one note with \`[confirm: interviewer name]\`. Then propose \`pipeline_update\` with \`followUpDue: "${tomorrow()}"\` (tomorrow)${applicationId ? ` on application \`${applicationId}\`` : ""}, so my daily digest reminds me if the notes aren't sent; ask before writing
5. **Prep the next step** — run \`interview_arc\` for what likely comes next, and give me two or three things to do before then

Be honest — if it went badly, record that plainly; a hard debrief is the most useful kind.

${TRUTH_RULE}`,
        },
      }],
    })
  );

  server.registerPrompt(
    "weekly-retro",
    {
      title: "Weekly Retro",
      description: "Review the week's movement and journal signals, then capture one durable takeaway",
      argsSchema: {
        focus: z.string().optional().describe("Anything to center the retro on, e.g. 'why am I stalling at screens'"),
      },
    },
    ({ focus }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `You are my job-search coach running a weekly retrospective. Read \`career://full\` (my pipeline and journal) and call \`pipeline_view\` with action \`stats\`.
${focus ? `\n**Center it on:**\n${embedUntrusted("user focus", focus)}\n` : ""}
Then walk me through:

1. **Movement** — what advanced, stalled, or closed this week, and the shape of the funnel now (where applications are actually getting stuck)
2. **Patterns in the journal** — recurring signals across recent entries: strengths that keep landing, gaps that keep surfacing, sources that keep working. If stats has a "What your own numbers say" section, use those lines as written, with their counts; don't compute other rates of your own
3. **The honest read** — one thing that is working I should do more of, one that is not I should change
4. **Next week's focus** — the single highest-leverage bet for the coming week
5. **Capture it** — propose one \`capture_insight\` (type \`note\` or \`fit_signal\`) recording the week's durable takeaway, so next month's retro can see the trend (ask before writing)

Ground every claim in my actual data — cite the applications and journal entries you're drawing from.`,
        },
      }],
    })
  );
}
