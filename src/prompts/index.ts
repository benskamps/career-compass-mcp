import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { embedUntrusted } from "../untrusted.js";

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

Start by reading career://full, then produce the complete resume.`,
        },
      }],
    })
  );

  server.registerPrompt(
    "interview-coach",
    {
      title: "Interview Coach",
      description: "Prepare for a specific interview with STAR stories, company research, and likely questions",
      argsSchema: {
        applicationId: z.string().optional().describe("Pipeline application ID for context"),
        company: z.string().describe("Company name"),
        role: z.string().describe("Role title"),
        interviewType: z.enum(["phone_screen", "behavioral", "technical", "panel", "final", "negotiation"]).describe("Type of interview"),
        interviewerInfo: z.string().optional().describe("Who you're meeting with (name, title, LinkedIn)"),
        notes: z.string().optional().describe("Any additional context or concerns"),
      },
    },
    ({ applicationId, company, role, interviewType, interviewerInfo, notes }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `You are an expert interview coach. Prepare me for my upcoming ${interviewType.replace("_", " ")} interview.

**Company:** ${company}
**Role:** ${role}
**Interview type:** ${interviewType}
${interviewerInfo ? `**Interviewer:** ${interviewerInfo}` : ""}
${applicationId ? `**Application ID:** ${applicationId} (read career://pipeline/${applicationId} for context)` : ""}
${notes ? `**Additional context:**\n${embedUntrusted("user notes", notes)}` : ""}

Please read career://full for my background, then provide:

1. **Opening pitch** — A 90-second "tell me about yourself" tailored to this role
2. **STAR stories** — 5-7 stories from my experience matched to likely questions for this role/interview type
3. **Likely questions** — Top 10 questions for this company/role, with suggested angles from my background
4. **Company intelligence** — What I should know about their product, culture, and current priorities
5. **Questions to ask them** — 5 thoughtful questions that show genuine interest and insight
6. **Bridge topics** — Where my background unexpectedly connects to their world
7. **Watch-outs** — Any gaps or concerns to prepare for, with reframe strategies

Be specific. Don't give generic advice — connect everything back to my actual career history.`,
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
${priorities ? `**My priorities:** ${priorities}` : ""}

Please provide:

1. **Offer analysis** — Break down total compensation (base + bonus + equity + benefits), annualized
2. **Market comparison** — How this compares to market for this role/level/location
3. **Negotiation strategy** — What to push on, in what order, and why
4. **Opening script** — Exact words to use when countering
5. **Concession plan** — What to give up if they push back, and what to hold firm on
6. **Alternative asks** — Non-salary items to request if base is fixed (signing bonus, equity cliff, remote days, title)
7. **Roleplay** — Play the hiring manager responding to my counter, then coach me through it

Then ask me if I want to do a full negotiation roleplay.`,
        },
      }],
    })
  );

  // ── Daily-ritual prompts ────────────────────────────────────────────────────
  // Prompts are the one native surface every Claude client renders as a slash
  // command (Claude Code /mcp__career-compass__*, Desktop + web via the + menu),
  // and the server shipped only three against eighteen tools. These three turn
  // the tools into a rhythm: a daily triage, a post-interview capture, and a
  // weekly reflection — each orchestrates existing tools/resources rather than
  // adding new ones. Free-text the user pastes is fenced like everywhere else.

  server.registerPrompt(
    "daily-review",
    {
      title: "Daily Review",
      description: "Triage your job search: what needs attention today, in priority order",
      argsSchema: {
        focus: z.string().optional().describe("Anything specific to weight today, e.g. 'the Stratos offer'"),
      },
    },
    ({ focus }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `You are my job-search chief of staff. Give me today's triage — short, prioritized, and honest about what is slipping.

Start by calling \`pipeline_view\` with action \`next_actions\` (overdue follow-ups, upcoming interviews, expiring offers), and read \`career://pipeline\` for the board state.
${focus ? `\n**Weight this today:**\n${embedUntrusted("user focus", focus)}\n` : ""}
Then give me:

1. **Do first** — the 1–3 highest-leverage moves for today, each with why-now and the concrete next step
2. **Overdue** — anything past its follow-up date, oldest first (name the company, role, and how many days)
3. **On the horizon** — interviews in the next few days and any offer clocks running down
4. **Quiet wins** — anything I can close or advance in five minutes

Be specific to my actual pipeline — no generic advice. If nothing is urgent, say so plainly rather than inventing work.`,
        },
      }],
    })
  );

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
4. **Prep the next step** — run \`interview_arc\` for what likely comes next, and give me two or three things to do before then

Be honest — if it went badly, record that plainly; a hard debrief is the most useful kind.`,
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
2. **Patterns in the journal** — recurring signals across recent entries: strengths that keep landing, gaps that keep surfacing, sources that keep working
3. **The honest read** — one thing that is working I should do more of, one that is not I should change
4. **Next week's focus** — the single highest-leverage bet for the coming week
5. **Capture it** — propose one \`capture_insight\` (type \`note\` or \`fit_signal\`) recording the week's durable takeaway, so next month's retro can see the trend (ask before writing)

Ground every claim in my actual data — cite the applications and journal entries you're drawing from.`,
        },
      }],
    })
  );

  // ── Onboarding prompt ──────────────────────────────────────────────────────
  // A first-contact prompt for users with no Career KB data yet. Rather than
  // dumping them into a blank `save_career_section`, this walks them through
  // the minimum viable Career KB in conversation — a profile and one experience
  // entry — so the pipeline and résumé tools have something to work with.

  server.registerPrompt(
    "setup-career-kb",
    {
      title: "Set Up Your Career KB",
      description: "Walk through building your Career Knowledge Base from scratch — profile, experience, skills, and first pipeline entry",
      argsSchema: {
        resumeText: z.string().optional().describe("Paste your existing résumé here and I'll extract the structured data for you"),
      },
    },
    ({ resumeText }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `You are my career coach helping me set up Career Compass for the first time. Let's build my Career Knowledge Base step by step so the pipeline, résumé, and interview tools have something to work with.

${resumeText ? `**Here's my existing résumé — extract what you can:**\n${embedUntrusted("user resume", resumeText)}\n\nParse this into the structured fields below, then ask me to confirm and fill any gaps.` : "I don't have a résumé handy, so let's build from conversation."}

**Walk me through these, one section at a time:**

1. **Profile** — name, summary, target roles, target industries, email, location. Save with \`save_career_section\` (section: profile)
2. **Experience** — for each job: \`role\` (the job title), \`company\`, \`startDate\` and \`endDate\` as \`YYYY-MM\` (use \`'present'\` for a current job), and \`achievements\` as \`{ metric, context, impact }\` objects — not plain strings. Save with \`save_career_section\` (section: experience)
3. **Skills** — technical, leadership, and domain skills with proficiency levels. Save with \`save_career_section\` (section: skills)
4. **First pipeline entry** — do I have a job I'm eyeing or already applied to? If so, add it with \`pipeline_add\`

**Rules:**
- Save each section as we go — don't wait until the end
- Ask clarifying questions to pull out quantified achievements (numbers, percentages, timelines)
- If I give vague descriptions, push me for the metric and the impact
- After we finish, run \`check_setup\` to confirm everything landed

Let's start with my profile.`,
        },
      }],
    })
  );
}
