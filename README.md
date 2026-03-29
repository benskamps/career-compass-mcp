# Career Compass MCP

**Your AI-native career co-pilot, built for Claude.**

Career Compass turns Claude into a full job-search partner — one that knows your entire career history, tailors every resume and cover letter, tracks every application, and preps you for every interview. Initiate via conversation, onboard, and track multiple applications in moments.

---

## What it feels like

```
You: I have a panel interview at Veridian Health on Friday — Director of Operations role.
     Can you prep me?

Claude: On it. Reading your career history now...

     [Generates 90-second pitch, 8 STAR stories matched to likely panel questions,
      company research brief, 10 questions to ask them, and a list of watch-outs
      based on gaps in your background — all in one response]
```

```
You: Here's a job posting I just found. [pastes posting]
     How well do I fit?

Claude: Fit score: 8.1/10. Here's why — and here's what they'll probe you on...

     [Returns matched strengths, honest gap analysis, talking points in their language,
      and a "day in the life" of what the role actually looks like]
```

```
You: Show me what needs attention in my pipeline today.

Claude: 3 things:
     - Meridian Logistics follow-up is overdue (8 days since you applied, referral from Marcus Chen)
     - Veridian panel is Friday — prep above
     - Novare rejection arrived — want me to draft a keep-the-door-open response?
```

---

## Dashboard

v2.0 ships a local web dashboard — a visual layer on top of your Career KB and pipeline data. Open it alongside Claude or use it standalone to review and manage your search.

Four views:

**Pipeline kanban board** — All your applications laid out by stage (Exploring → Applied → Screening → Interviewing → Offer → Closed). Drag to advance stages. See stale applications at a glance. Click any card to drill in.

**Application detail view** — Full timeline for a single application: every status change, contacts associated with the role, notes from conversations, and next action. Everything Claude knows about that opportunity in one place.

**Career KB overview** — Visual summary of your career data: skills radar (proficiency × recency), experience timeline, testimonials, and a completeness indicator showing what Claude has to work with. Useful for spotting gaps before you onboard a new role.

**Analytics** — Funnel conversion rates, response rates by source, time-in-stage averages, and source effectiveness. See which channels are actually working.

Open the dashboard:

```bash
career-compass-mcp dashboard
```

---

## Quick Start

### 1. Install

```bash
npm install -g career-compass-mcp
```

### 2. Add to Claude

Add this to your `~/.claude.json` (Claude Code) or equivalent MCP config:

```json
{
  "mcpServers": {
    "career-compass": {
      "command": "career-compass-mcp",
      "env": {
        "CAREER_DATA_PATH": "/Users/you/career-data"
      }
    }
  }
}
```

Create the `career-data` directory anywhere you like — Career Compass will initialize it on first run.

### 3. Open the dashboard

```bash
career-compass-mcp dashboard
```

This opens the dashboard in your browser at `http://localhost:3333` (or the next available port). Use it to finish onboarding and get a visual overview of your pipeline.

### 4. Onboard (first conversation)

Open Claude and say:

> **"Set up my Career KB. Here's my resume:"** [paste your resume]

Claude will:
- Extract your work history, achievements, and skills into structured YAML
- Ask clarifying questions about gaps or unclear metrics
- Save everything to your `CAREER_DATA_PATH`

Then open the dashboard to complete the second phase: the onboarding wizard walks you through setting job targets, salary expectations, and confirming your skills inventory. Claude pulls the raw data from your resume; the wizard fills the gaps that a resume doesn't naturally contain.

That's it. From there, every tool has full context on who you are.

---

## Dashboard CLI

```bash
career-compass-mcp dashboard                  # open dashboard (default port 3333)
career-compass-mcp dashboard --port 3000      # specify port
career-compass-mcp dashboard --no-open        # start server without opening browser
```

---

## Tools

| Tool | What it does |
|------|-------------|
| `explore_opportunity` | Analyzes a job posting against your Career KB — fit score, matched strengths, gaps, talking points, day-in-the-life, red flags |
| `research_company` | Builds an intelligence brief: product, culture, funding, interview process, strategic fit |
| `tailor_resume` | Generates an ATS-optimized, tailored resume from your KB — standard, federal, academic, or functional formats |
| `generate_cover_letter` | Writes a personalized cover letter with your actual achievements woven in |
| `format_for_ats` | Reformats resume content for specific ATS systems: Workday, Greenhouse, Lever, LinkedIn, iCIMS, Taleo |
| `manage_pipeline` | Tracks applications from discovery through offer — add, update, list, stats, next actions |
| `classify_email` | Classifies a job-search email and extracts contacts, dates, and suggested pipeline updates |
| `prepare_interview` | Full interview prep: opening pitch, STAR stories, likely questions, company alignment, questions to ask |
| `evaluate_offer` | Breaks down total comp, compares to market, builds negotiation strategy, drafts counter scripts |
| `ingest_document` | Extracts achievements from any document: performance review, award email, LinkedIn recommendation, project summary |
| `generate_rejection_response` | Drafts a graceful response that keeps the door open and maintains the relationship |

## Resources

Claude can read these directly (e.g., "read my career profile"):

| Resource | URI | Contents |
|----------|-----|----------|
| Career Profile | `career://profile` | Name, contact, summary, targets, preferences |
| Work Experience | `career://experience` | Full history with achievements |
| Skills Inventory | `career://skills` | Skills with proficiency and recency |
| Projects | `career://projects` | Portfolio with outcomes |
| Education | `career://education` | Degrees, certifications, coursework |
| Testimonials | `career://testimonials` | Quotes, recommendations |
| Full KB | `career://full` | Everything above in one read |
| Pipeline | `career://pipeline` | All applications with status |

## Prompts

Power-user shortcuts (appear in Claude's prompt menu):

| Prompt | What it does |
|--------|-------------|
| `resume-tailor` | Drop in a posting → get a tailored resume |
| `interview-coach` | Company + role + interview type → full prep package |
| `negotiation-coach` | Paste an offer → get analysis, strategy, and counter scripts |

---

## Your Career KB

Your data lives in YAML files under `CAREER_DATA_PATH`:

```
career-data/
├── career/
│   ├── profile.yaml      ← who you are, what you're targeting
│   ├── experience.yaml   ← roles, achievements (metrics + context + impact)
│   ├── skills.yaml       ← skills with proficiency and recency
│   ├── education.yaml    ← degrees, certs, coursework
│   ├── projects.yaml     ← portfolio
│   └── testimonials.yaml ← quotes and recommendations
└── pipeline/
    └── applications.yaml ← all job applications
```

You never need to edit these manually. Use `ingest_document` to add data by pasting documents, or ask Claude to update specific sections.

See `data/example/` in this repo for a fully populated sample.

---

## Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `CAREER_DATA_PATH` | `./data` | Where your YAML files are stored |

---

## Building from Source

```bash
git clone https://github.com/benskamps/career-compass-mcp
cd career-compass-mcp
npm install
npm run build
```

`npm run build` compiles both the MCP server (TypeScript → `build/`) and the Next.js dashboard (`dashboard/.next/`). To work on just the MCP server, use `npm run build:mcp`. For dashboard development with hot reload, use `npm run dev:dashboard`.

Then point your MCP config to `node /path/to/career-compass-mcp/build/index.js`.

Use `npm run dev` during development — TypeScript watch mode recompiles on save.
Use `npm run inspect` to open the MCP Inspector (web UI for testing tools interactively).

---

## Why Career Compass

Job searching is one of the highest-stakes, most document-intensive activities most people do — and most tools treat it as a data entry problem. Spreadsheets for tracking. Templates for resumes. Generic advice for interviews.

Career Compass treats it as a knowledge problem. Your career history is a corpus. Every application is a retrieval and synthesis task. Every interview is a pattern-matching problem against a known dataset (the posting) and a known corpus (your KB).

The Career KB is your single source of truth — built once, enriched over time, and used by every tool. A tailored resume draws from it. Interview prep draws from it. Cover letters draw from it. The pipeline tracks against it. Nothing gets lost because it's never in a tab you'll close.

---

## Contributing

Issues and PRs welcome. If you add a new tool, register it in `src/server.ts` and follow the pattern in any existing tool file — each tool returns a structured prompt that Claude acts on with the full KB in context.

---

## License

MIT
