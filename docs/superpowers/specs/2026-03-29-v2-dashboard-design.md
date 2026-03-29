# Career Compass MCP v2.0 — Dashboard Design Spec

## Overview

Add a built-in local web dashboard to Career Compass MCP. Users launch it via `career-compass-mcp dashboard`, which starts a Next.js app on localhost and opens their browser. The dashboard provides visual pipeline management, career KB overview, analytics, and guided onboarding — all reading from the same YAML files the MCP server uses.

**Goal:** Turn Career Compass from a conversation-only tool into a conversation + visual companion. The dashboard is the read layer; Claude (via MCP) remains the write layer.

**Audience:** Job seekers of all experience levels. The dashboard must be approachable for non-technical users.

---

## Architecture

### Project Structure

```
career-compass-mcp/
├── src/                          # MCP server (existing v0.1.0)
│   ├── index.ts                  # Entry point (stdio transport)
│   ├── server.ts                 # McpServer factory
│   ├── tools/                    # Tool registrations
│   │   ├── career-kb.ts          # ingest_document, generate_rejection_response
│   │   ├── opportunity.ts        # explore_opportunity, research_company
│   │   ├── resume.ts             # tailor_resume, generate_cover_letter, format_for_ats
│   │   ├── pipeline.ts           # manage_pipeline, classify_email
│   │   └── interview.ts          # prepare_interview, evaluate_offer
│   ├── resources/career-kb.ts    # MCP resource registrations
│   ├── schemas/career-schema.ts  # Zod schemas (shared with dashboard)
│   ├── storage/file-store.ts     # YAML read/write (shared with dashboard)
│   └── prompts/index.ts          # MCP prompt registrations
├── dashboard/                    # Next.js 16 app (NEW)
│   ├── app/
│   │   ├── layout.tsx            # Root layout, Claude theme, Geist fonts
│   │   ├── page.tsx              # Root — redirects to /onboarding or /pipeline
│   │   ├── onboarding/
│   │   │   └── page.tsx          # Two-phase onboarding wizard
│   │   ├── pipeline/
│   │   │   ├── page.tsx          # Kanban board
│   │   │   └── [id]/
│   │   │       └── page.tsx      # Application detail
│   │   ├── career/
│   │   │   └── page.tsx          # Career KB overview
│   │   └── analytics/
│   │       └── page.tsx          # Charts and metrics
│   ├── lib/
│   │   ├── yaml-reader.ts        # Server-side YAML reading (wraps file-store.ts)
│   │   └── theme.ts              # Claude color tokens and constants
│   ├── components/
│   │   ├── layout/               # Nav bar, sidebar, page shell
│   │   ├── pipeline/             # Kanban column, application card, filters
│   │   ├── career/               # Skills radar, experience timeline, profile card
│   │   ├── analytics/            # Charts, stat cards, funnel
│   │   ├── onboarding/           # Wizard steps, resume paste area, completeness score
│   │   └── ui/                   # shadcn/ui components
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   ├── postcss.config.mjs
│   └── tsconfig.json
├── bin/
│   └── cli.ts                    # CLI entry — routes to MCP server or dashboard
├── data/
│   └── example/                  # Sample YAML data (existing)
├── package.json                  # Single package: MCP + dashboard
└── tsconfig.json                 # MCP server TypeScript config
```

### Key Architectural Decisions

1. **Single package, two modes.** One `npm install`, one `package.json`. The CLI routes between MCP server (stdio) and dashboard (localhost HTTP). Not a monorepo — keeps distribution simple.

2. **Shared data layer.** Dashboard imports `src/storage/file-store.ts` and `src/schemas/career-schema.ts` directly. No API layer, no data duplication. Server components call `loadCareerData()` and `loadPipeline()` the same way tools do.

3. **Read-only dashboard (with onboarding exception).** All career and pipeline mutations happen through Claude via MCP tools. The dashboard is a viewer. The one exception: the onboarding wizard writes to YAML files to set initial profile data, target roles, salary preferences, and skills proficiency — because sending a new user back to Claude just to set a salary slider is bad UX.

4. **Default data path: `~/.career-compass/`.** Changed from `./data` (relative to CWD) to a fixed home directory location. Global install needs a stable path. `CAREER_DATA_PATH` env var overrides this. Example data stays at `./data/example/` in the repo.

5. **Next.js standalone output.** Dashboard builds to `dashboard/.next/standalone/` which bundles all dependencies. The CLI serves this directly — no runtime `node_modules` needed for the dashboard.

---

## Theme & Visual Identity

Claude-native dark dashboard. Should feel like it was built by Anthropic.

### Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-base` | `#0d0d0d` | Page background |
| `--bg-surface` | `#1a1a1a` | Card/panel backgrounds |
| `--bg-elevated` | `#242424` | Hover states, active cards |
| `--border` | `#333333` | Card borders, dividers |
| `--text-primary` | `#E8E0D5` | Primary text (warm white) |
| `--text-secondary` | `#999999` | Secondary/muted text |
| `--text-muted` | `#666666` | Tertiary/disabled text |
| `--accent` | `#D97706` | Primary accent (amber) |
| `--accent-hover` | `#F59E0B` | Accent hover state |
| `--accent-muted` | `rgba(217, 119, 6, 0.2)` | Accent backgrounds |
| `--success` | `#059669` | Positive outcomes |
| `--warning` | `#D97706` | Attention needed (shared with accent) |
| `--error` | `#E11D48` | Errors, rejections (muted rose) |
| `--info` | `#3B82F6` | Informational, "applied" status |

### Pipeline Status Colors

| Status | Color | Hex |
|--------|-------|-----|
| Discovered | Slate | `#64748B` |
| Applied | Blue | `#3B82F6` |
| Screening | Indigo | `#6366F1` |
| Interviewing | Amber | `#D97706` |
| Offer | Emerald | `#059669` |
| Negotiating | Gold | `#EAB308` |
| Accepted | Bright green | `#22C55E` |
| Rejected | Muted rose | `#F43F5E/70%` |
| Withdrawn | Gray | `#6B7280` |
| Ghosted | Dim gray | `#4B5563` |

### Typography

- **Interface text:** Geist Sans
- **Mono elements:** Geist Mono — application IDs, dates, email addresses, stats, metrics, code
- **Hierarchy:** Font weight and size, not color variation, for heading levels

### Spacing & Shape

- 8px grid system
- Card border radius: `8px`
- Button border radius: `6px`
- Card borders: `1px solid var(--border)`
- Generous whitespace — let elements breathe

### Motion

- Hover transitions: 150ms ease
- Page transitions: 200ms fade
- No flashy animations. Subtle, functional motion only.

---

## Onboarding (Front Door)

Onboarding is the first thing a new user sees. It runs before any other dashboard view is accessible.

### Detection Logic

On root page load (`/`):
1. Check if `~/.career-compass/career/profile.yaml` exists
2. If no → redirect to `/onboarding` (Phase 1: data dump)
3. If yes but gaps detected → redirect to `/onboarding` (Phase 2: wizard, skip to relevant steps)
4. If complete → redirect to `/pipeline`

### Phase 1: Start with Claude

**Shown when:** No YAML data exists at all.

The dashboard cannot extract career data from a resume — that requires Claude (the LLM). Phase 1 guides users to Claude with clear instructions.

**Screen:** Clean centered layout with:
- Career Compass logo/wordmark
- "Let's build your Career KB" heading
- Step-by-step instructions:
  1. Open Claude (Claude Code or claude.ai with MCP configured)
  2. Say: "Set up my Career KB. Here's my resume:" and paste your resume
  3. Claude extracts your data into structured YAML automatically
  4. Come back here — the dashboard will detect your data
- Copy-to-clipboard button for the prompt
- Brief explainer: what Career Compass does, what the Career KB is

**Auto-detection:**
- The page polls `~/.career-compass/career/profile.yaml` every 3 seconds (server action)
- When YAML appears: shows a "Data detected!" success state with a brief animation
- Automatically advances to Phase 2 after 2 seconds

### Phase 2: Gap-Filling Wizard

**Shown when:** YAML exists but has gaps.

Only shows steps that have gaps — if Claude extracted target roles from the resume, skip that step.

**Step 1: Profile Check**
- Displays extracted name, summary, location, contact info
- User confirms each field or flags for correction
- Flagged items saved as notes for Claude to refine later

**Step 2: Target Roles & Industries**
- Multi-select chips for common role categories
- Free-text input to add custom roles
- Industry multi-select
- Company size preferences (startup → enterprise)

**Step 3: Salary & Preferences**
- Salary range: dual-handle slider with number inputs
- Currency selector
- Remote / relocation / notice period toggles

**Step 4: Skills Review**
- Lists all extracted skills grouped by category
- Each skill: proficiency selector (1-5 filled dots), last used date
- "Add skill" button for missing ones
- Visual: skills light up as you rate them

**Step 5: Completion**
- KB completeness score (percentage)
- Summary card showing what's populated
- "Go to Pipeline" CTA
- "Enrich with Claude" secondary CTA (explains they can paste performance reviews, recommendations, etc.)

**Writes to YAML:** Each wizard step writes to the appropriate YAML file on "Next" click. Uses the same `saveCareerSection()` from `file-store.ts`.

---

## Dashboard Views

### Pipeline Board (`/pipeline`)

**Layout:** Full-width kanban board with horizontal scrolling columns.

**Columns (left to right):**
- Discovered
- Applied
- Screening
- Interviewing
- Offer / Negotiating (combined column)

**Closed section:** Below the board, a collapsible "Closed" area showing Accepted, Rejected, Withdrawn, Ghosted cards in a condensed list format.

**Application card contents:**
- Company name (bold, Geist Sans)
- Role title (secondary text)
- Priority indicator (colored dot: red/amber/gray for high/med/low)
- Excitement score (small horizontal bar, 1-10)
- Days in current stage (Geist Mono)
- Source badge (LinkedIn, Referral, Company Site, etc.)
- Follow-up due indicator (amber if overdue, with days count)
- Contact count (small avatar circle with number)

**Card interactions:**
- Click → navigate to `/pipeline/[id]`
- No drag-and-drop (dashboard is read-only; status changes go through Claude)

**Filter bar (top of page):**
- Filter by: status, priority, source
- Sort by: date updated, excitement, priority, company name
- Search: text filter across company and role names

**Empty state:** If no applications exist, show a friendly prompt: "No applications yet. Open Claude and use `manage_pipeline` to add your first one, or paste a job posting and use `explore_opportunity`."

### Application Detail (`/pipeline/[id]`)

**Header:**
- Company name (large heading)
- Role title
- Status badge (colored per status table)
- Priority dot + excitement score
- Salary range (if set)
- Quick stats row: days since applied | interview rounds completed | follow-up status

**Timeline section:**
- Vertical timeline from earliest event to latest
- Nodes: discovered → applied → each interview round → current status
- Each node: date (Geist Mono), event description, outcome (if interview)
- Interview nodes expand to show: type, interviewers, notes, outcome
- Overdue follow-ups: amber highlight with "X days overdue"

**Contacts panel:**
- Card per contact: name, title, email (mono), relationship
- Clean grid layout

**Notes log:**
- Reverse chronological
- Each note: date prefix in Geist Mono, content in Geist Sans
- Styled like a minimal commit log

**Sidebar metadata:**
- Source + referral
- Posting URL (linked, opens in new tab)
- Remote status badge
- Location
- Cover letter generated: yes/no
- Tailored resume version

**Back navigation:** Breadcrumb or back arrow to `/pipeline`

### Career KB Overview (`/career`)

**Profile header (top of page):**
- Name (large), professional summary
- Location, contact links (LinkedIn, portfolio) as icon links
- Target roles as colored chips
- Target industries as chips
- Salary range as a subtle inline bar
- Remote / relocation badges
- KB completeness score (circular progress indicator)

**Skills section:**
- **Radar chart:** Spider/radar chart showing top skills by category. 4 axes: Leadership, Operations, Domain, Technical. Each skill plotted by proficiency.
- **Skills list (below chart):** Grouped by category. Each skill: name, proficiency (filled dots 1-5), years used, last used indicator. Skills not used recently get a subtle dim/fade treatment.

**Experience timeline:**
- Vertical timeline of roles, most recent first
- Each role card: company, title, date range, duration (calculated), industry badge
- Expandable: click to reveal achievements
- Each achievement: metric (bold), context, impact, keyword tags
- Visual density is important here — achievements should feel substantial but scannable

**Testimonials:**
- Pull-quote styled cards
- Source name, relationship, context
- Warm background tint to differentiate from other sections

**Education & certifications:**
- Simple clean list: degree, institution, date, honors
- Certifications as badges

### Analytics (`/analytics`)

All metrics computed from YAML at render time. Server components parse the applications array and compute everything.

**Top row — 4 stat cards:**
| Card | Metric | Detail |
|------|--------|--------|
| Total Applications | Count of all applications | Trend arrow if data spans multiple weeks |
| Response Rate | % moved past "applied" status | Numerator/denominator shown below |
| Avg Days to Response | Mean time from applied to first status change | Excludes ghosted |
| Active Applications | Count of non-terminal statuses | "You have X in play" |

**Pipeline funnel:**
- Visual funnel chart (wide at top, narrow at bottom)
- Stages: Discovered → Applied → Screening → Interviewing → Offer → Accepted
- Count at each stage
- Conversion rate between stages (e.g., "42% of applied moved to screening")
- Drop-off highlighting at the widest gaps

**Status breakdown:**
- Horizontal bar chart or donut showing distribution across all statuses
- Color-coded per status table
- Hover for exact counts

**Applications over time:**
- Area chart: applications submitted per week
- Overlay line: responses received per week
- X-axis: weeks, Y-axis: count
- Only shown if data spans 2+ weeks

**Source effectiveness:**
- Grouped bar chart by source (LinkedIn, Referral, Company Site, etc.)
- Per source: total applications, response rate, furthest stage reached
- Answers: "where should I spend my time?"

**Priority distribution:**
- Simple horizontal stacked bar: high / medium / low across active applications

**Excitement vs. outcome:**
- Small scatter plot: X = excitement score (1-10), Y = furthest stage reached
- Visual correlation check — do high-excitement applications go further?

**Empty state:** If fewer than 3 applications, show a message: "Add more applications to unlock analytics. Your data tells a story — we need a few more chapters."

---

## Navigation

**Top nav bar (persistent across all views):**
- Left: Career Compass wordmark/logo
- Center: Tab navigation — Pipeline | Career | Analytics
- Right: KB completeness score (circular indicator), settings gear icon

**Active tab:** Amber underline, matching accent color.

**Settings (gear icon) — simple dropdown:**
- Data path display (read-only, shows `CAREER_DATA_PATH`)
- Link to open data folder in file explorer
- Version number

---

## CLI & Packaging

### Commands

```
career-compass-mcp                         # MCP server on stdio (unchanged from v0.1.0)
career-compass-mcp dashboard              # Start dashboard, open browser
career-compass-mcp dashboard --port 3000  # Specify port
career-compass-mcp dashboard --no-open    # Start without opening browser
```

### CLI Implementation (`bin/cli.ts`)

```
1. Parse args: check if first arg is "dashboard"
2. If not: run existing MCP stdio server (src/index.ts behavior)
3. If "dashboard":
   a. Resolve CAREER_DATA_PATH (env var or default ~/.career-compass/)
   b. Ensure data directories exist
   c. Find available port (default: 3141, fallback to random)
   d. Set CAREER_DATA_PATH as env var for the Next.js process
   e. Start Next.js standalone server
   f. Open default browser to localhost:<port>
   g. Log "Dashboard running at http://localhost:<port>" to stderr
   h. Handle SIGINT/SIGTERM for clean shutdown
```

### Build Pipeline

```
npm run build
  → tsc                    # Compile MCP server → build/
  → next build             # Compile dashboard → dashboard/.next/standalone/

npm run dev
  → tsc --watch            # MCP server watch mode
  → next dev               # Dashboard dev server (separate terminal or concurrently)
```

### Package Distribution

```json
{
  "bin": {
    "career-compass-mcp": "build/cli.js"
  },
  "files": [
    "build/",
    "dashboard/.next/standalone/",
    "dashboard/.next/static/",
    "dashboard/public/",
    "data/example/"
  ]
}
```

Next.js standalone mode (`output: "standalone"` in `next.config.ts`) bundles all dependencies into a self-contained directory. No separate `node_modules` needed for the dashboard at runtime.

### Default Data Path

- **Default:** `~/.career-compass/` (resolved via `os.homedir()`)
- **Override:** `CAREER_DATA_PATH` environment variable
- **Structure created on first run:**
  ```
  ~/.career-compass/
  ├── career/
  │   ├── profile.yaml
  │   ├── experience.yaml
  │   ├── skills.yaml
  │   ├── education.yaml
  │   ├── projects.yaml
  │   └── testimonials.yaml
  └── pipeline/
      └── applications.yaml
  ```

---

## Shared Code

The dashboard imports directly from the MCP server source:

| Module | Used by Dashboard | Purpose |
|--------|-------------------|---------|
| `src/schemas/career-schema.ts` | Yes | Zod schemas, TypeScript types |
| `src/storage/file-store.ts` | Yes | `loadCareerData()`, `loadPipeline()`, `saveCareerSection()` (onboarding only) |
| `src/tools/*` | No | Tools are MCP-only |
| `src/resources/*` | No | Resources are MCP-only |
| `src/prompts/*` | No | Prompts are MCP-only |

Dashboard `tsconfig.json` will use path aliases to import from `../src/` cleanly.

---

## Out of Scope for v2.0

- **Drag-and-drop kanban** — status changes go through Claude
- **Interview prep cards view** — use Claude's `prepare_interview` tool directly
- **Real-time sync** — dashboard shows data at page load, refresh to see updates
- **Authentication / multi-user** — single-user local tool
- **Deployment to cloud** — localhost only
- **Mobile responsive** — desktop-first, basic tablet support is fine
- **Dark/light mode toggle** — dark only (Claude theme)

---

## Charting Library

Use **Recharts** for all charts (radar, funnel, area, bar, scatter, donut). It's React-native, composable, well-maintained, and works cleanly with server-component data passed as props to client chart wrappers.

---

## KB Completeness Score

Calculated as a percentage of filled sections, weighted by importance:

| Section | Weight | Criteria for "complete" |
|---------|--------|------------------------|
| Profile (name, summary) | 20% | Name and summary present |
| Target roles | 10% | At least 1 target role |
| Salary range | 5% | Both min and max set |
| Experience | 25% | At least 1 role with 1+ achievements |
| Skills | 20% | At least 3 skills with proficiency rated |
| Education | 10% | At least 1 entry |
| Testimonials | 10% | At least 1 testimonial |

Formula: sum of (weight * 1 if criteria met, else 0). Displayed as percentage with circular progress indicator in nav bar.

---

## README Update

Update the GitHub README (`README.md`) to reflect v2.0:

- Add a **Dashboard** section with feature overview (pipeline board, career KB, analytics, onboarding)
- Update **Quick Start** to include `career-compass-mcp dashboard` as step 3 (after install and Claude config)
- Add onboarding flow description (Claude extracts resume → dashboard wizard fills gaps)
- Add dashboard CLI flags (`--port`, `--no-open`)
- Update version references from 0.1.0 to 2.0.0
- Add screenshots placeholder section (to be populated after implementation)
