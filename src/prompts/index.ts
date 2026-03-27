import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerPrompts(server: McpServer): void {

  server.registerPrompt(
    "resume-tailor",
    {
      title: "Resume Tailor",
      description: "Generate a tailored, ATS-optimized resume for a specific job posting using your Career KB",
      argsSchema: {
        posting: z.string().describe("Full job posting text or URL"),
        format: z.enum(["standard", "federal", "academic", "creative"]).optional().describe("Resume format style"),
        pages: z.enum(["1", "2"]).optional().describe("Target page count"),
        notes: z.string().optional().describe("Any special instructions or context"),
      },
    },
    ({ posting, format = "standard", pages = "2", notes }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `You are an expert resume writer and career coach. Using the career data from my Career Knowledge Base (read career://full), create a tailored, ATS-optimized resume for the following job posting.

**Job Posting:**
${posting}

**Format:** ${format}
**Target length:** ${pages} page(s)
${notes ? `**Special instructions:** ${notes}` : ""}

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
${notes ? `**Additional context:** ${notes}` : ""}

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
${offerDetails}

${marketData ? `**My market research:** ${marketData}` : ""}
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
}
