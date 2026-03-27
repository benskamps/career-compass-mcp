import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadCareerData, loadPipeline } from "../storage/file-store.js";

export function registerInterviewTools(server: McpServer): void {

  server.registerTool(
    "prepare_interview",
    {
      title: "Prepare Interview",
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
      const career = await loadCareerData();
      let appContext = "";

      if (applicationId) {
        const pipeline = await loadPipeline();
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
          content: [{ type: "text", text: "⚠️ No career data found. Please populate your Career KB first." }],
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

${postingText ? `## Job Posting\n${postingText}` : ""}

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
    "evaluate_offer",
    {
      title: "Evaluate Offer",
      description: "Analyze a job offer: break down total compensation, compare to market, build negotiation strategy, and draft counter scripts.",
      inputSchema: {
        applicationId: z.string().optional().describe("Pipeline application ID"),
        company: z.string().optional(),
        role: z.string().optional(),
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
        const pipeline = await loadPipeline();
        const app = pipeline.applications.find(a => a.id === applicationId);
        if (app) { company = company ?? app.company; role = role ?? app.role; }
      }

      return {
        content: [{
          type: "text",
          text: `# Offer Evaluation: ${role ?? "Role"} at ${company ?? "Company"}

## Offer Details
${offerDetails}

${location ? `**Location:** ${location}` : ""}
${currentComp ? `**Current comp:** ${currentComp}` : ""}
${marketData ? `**Market data:** ${marketData}` : ""}
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
