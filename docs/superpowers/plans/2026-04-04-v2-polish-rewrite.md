# Career Compass MCP v2.0 — Rewrite Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take Career Compass from 8/10 to 10/10 — architectural refactors, light/dark mode, full test coverage, Storybook, and README with screenshots.

**Architecture:** CSS custom properties become the single color source. Tool handlers get discriminated union types and extracted functions. Dashboard gains light mode, error boundaries, and Storybook. MCP server gets full test coverage.

**Tech Stack:** TypeScript, Next.js (App Router), Tailwind v4, Recharts, Vitest, React Testing Library, Storybook 8, Playwright

---

**Spec corrections (verified during planning):**
- ~~Onboarding mutations~~ — already fully implemented (`dashboard/app/onboarding/actions.ts` has `saveProfile`, `saveTargets`, `saveSalaryPrefs`, `saveSkills` all wired to step components)
- ~~Loading skeletons~~ — already implemented (all three `loading.tsx` files have proper `animate-pulse` skeletons matching page layouts)
- ~~Collapsible closed section~~ — already done (`closed-section.tsx` has `useState` toggle with chevron animation)
- ~~@shared path fix~~ — not broken (Next.js config has both Turbopack + webpack aliases, `outputFileTracingRoot` includes parent dir)

---

## Task 1: Expand Example Data (3 → 8 Applications)

**Files:**
- Modify: `data/example/pipeline/applications.yaml`

- [ ] **Step 1: Add 5 new applications to the YAML**

Append these after the existing `demo-003` entry in `data/example/pipeline/applications.yaml`, before the `lastUpdated` field:

```yaml
  - id: demo-004
    company: Canopy Analytics
    role: VP of Operations
    industry: Data Analytics
    location: Denver, CO (Remote-friendly)
    remote: hybrid
    postingUrl: https://canopyanalytics.io/careers/vp-operations
    status: discovered
    dateDiscovered: "2026-03-22"
    dateUpdated: "2026-03-22T10:30:00.000Z"
    priority: medium
    excitement: 7
    source: Recruiter outreach
    contacts:
      - name: Sam Okafor
        title: Talent Partner
        email: s.okafor@canopyanalytics.io
        relationship: Recruiter
    interviewRounds: []
    notes:
      - "[2026-03-22] Recruiter reached out on LinkedIn. Series B, 180 people. Analytics platform for retail."
    coverLetterGenerated: false
    tags: [analytics, operations, vp, remote-friendly]

  - id: demo-005
    company: Stratos Cloud
    role: Program Director
    industry: Cloud Infrastructure
    location: Seattle, WA (Hybrid)
    remote: hybrid
    postingUrl: https://stratoscloud.com/jobs/program-director
    status: screening
    dateDiscovered: "2026-03-15"
    dateApplied: "2026-03-16"
    dateUpdated: "2026-03-25T11:00:00.000Z"
    priority: high
    excitement: 8
    source: LinkedIn
    salaryRange:
      min: 170000
      max: 200000
      currency: USD
    contacts:
      - name: Priya Sharma
        title: Director of Engineering
        relationship: Hiring Manager
    interviewRounds:
      - type: phone_screen
        date: "2026-03-25"
        interviewers: [HR Coordinator]
        outcome: Passed — scheduling technical round
    notes:
      - "[2026-03-16] Applied via LinkedIn Easy Apply. Cloud infra company, series C, 400+ headcount."
      - "[2026-03-25] Phone screen was brief (20 min). Focused on program management methodology and cloud migration experience."
    followUpDue: "2026-04-01"
    coverLetterGenerated: true
    tags: [cloud, program-management, screening]

  - id: demo-006
    company: Brightpath Health
    role: Senior Program Manager
    industry: Digital Health
    location: Remote
    remote: remote
    postingUrl: https://brightpathhealth.com/careers/sr-pm
    status: offer
    dateDiscovered: "2026-02-20"
    dateApplied: "2026-02-22"
    dateUpdated: "2026-03-26T16:45:00.000Z"
    priority: high
    excitement: 9
    source: Referral
    referral: "Jamie Lin (former Apex colleague)"
    salaryRange:
      min: 145000
      max: 170000
      currency: USD
    contacts:
      - name: Jamie Lin
        title: VP of Product
        relationship: Internal referral
      - name: Dr. Lisa Park
        title: CEO
        relationship: Final interviewer
    interviewRounds:
      - type: phone_screen
        date: "2026-02-28"
        interviewers: [HR]
        outcome: Passed
      - type: behavioral
        date: "2026-03-07"
        interviewers: [Jamie Lin, Head of Eng]
        outcome: Strong pass — asked to fast-track
      - type: final
        date: "2026-03-18"
        interviewers: [Dr. Lisa Park]
        outcome: Offer extended
    offer:
      baseSalary: 160000
      currency: USD
      bonus: 15
      equity: "0.15% over 4 years"
      benefits: ["Full health/dental/vision", "Unlimited PTO", "$2k learning budget", "Home office stipend"]
      startDate: "2026-04-14"
      expiresDate: "2026-04-04"
    notes:
      - "[2026-02-22] Jamie referred me directly. Telehealth platform, Series B, mission-driven."
      - "[2026-03-07] Behavioral was excellent. Both interviewers loved the capacity optimization story."
      - "[2026-03-18] Lisa asked about long-term vision for the operations function. Pitched 'clinical ops as platform' angle."
      - "[2026-03-26] Offer received! Base $160k + 15% bonus + 0.15% equity. Need to evaluate and possibly negotiate."
    coverLetterGenerated: true
    tags: [health, program-management, offer, referral]

  - id: demo-007
    company: Apex Consulting Group
    role: Engagement Manager
    industry: Management Consulting
    location: Chicago, IL
    remote: onsite
    postingUrl: https://apexconsulting.com/careers/em
    status: withdrawn
    dateDiscovered: "2026-02-10"
    dateApplied: "2026-02-12"
    dateUpdated: "2026-03-10T09:00:00.000Z"
    priority: low
    excitement: 5
    source: Company site
    contacts:
      - name: Tom Brady
        title: Recruiting Lead
        email: t.brady@apexconsulting.com
        relationship: Recruiter
    interviewRounds:
      - type: phone_screen
        date: "2026-02-20"
        interviewers: [Tom Brady]
        outcome: Passed
    notes:
      - "[2026-02-12] Applied as backup option. Consulting travel schedule is a concern."
      - "[2026-03-10] Withdrew — Brightpath offer is far more aligned with goals. Sent graceful withdrawal note."
    coverLetterGenerated: false
    tags: [consulting, withdrawn]

  - id: demo-008
    company: Lumen Digital
    role: Head of Operations
    industry: SaaS
    location: Austin, TX (Hybrid)
    remote: hybrid
    postingUrl: https://lumendigital.io/careers/head-ops
    status: applied
    dateDiscovered: "2026-03-25"
    dateApplied: "2026-03-26"
    dateUpdated: "2026-03-26T14:00:00.000Z"
    priority: medium
    excitement: 6
    source: LinkedIn
    salaryRange:
      min: 150000
      max: 175000
      currency: USD
    contacts: []
    interviewRounds: []
    notes:
      - "[2026-03-25] Spotted on LinkedIn. Local Austin company, marketing SaaS, ~100 employees."
      - "[2026-03-26] Applied. Resume tailored to emphasize SaaS ops and growth-stage experience."
    followUpDue: "2026-04-02"
    coverLetterGenerated: true
    tags: [saas, operations, austin]
```

- [ ] **Step 2: Verify the YAML parses correctly**

Run: `node -e "const yaml = require('yaml'); const fs = require('fs'); const d = yaml.parse(fs.readFileSync('data/example/pipeline/applications.yaml','utf-8')); console.log(d.applications.length + ' applications loaded'); d.applications.forEach(a => console.log(a.id, a.company, a.status))"`

Expected: `8 applications loaded` with statuses: interviewing, applied, rejected, discovered, screening, offer, withdrawn, applied.

- [ ] **Step 3: Commit**

```bash
git add data/example/pipeline/applications.yaml
git commit -m "data: expand example pipeline to 8 applications across all stages"
```

---

## Task 2: Color System Refactor — Single Source of Truth

**Files:**
- Modify: `dashboard/app/globals.css` — restructure brand tokens to use `:root`/`.dark` blocks
- Modify: `dashboard/tailwind.config.ts` — reference CSS vars instead of hex literals
- Modify: `dashboard/lib/theme.ts` — read CSS vars at runtime, keep static fallbacks for SSR
- Modify: `dashboard/components/career/skills-radar.tsx` — use theme helpers instead of hardcoded hex
- Modify: `dashboard/components/analytics/source-effectiveness.tsx` — use theme helpers
- Modify: `dashboard/components/analytics/excitement-vs-outcome.tsx` — check for hardcoded colors
- Modify: `dashboard/components/analytics/status-breakdown.tsx` — check for hardcoded colors

- [ ] **Step 1: Restructure globals.css brand tokens**

Currently the `@theme` block (lines 8-30) defines brand tokens inline. These need to move into `:root` and `.dark` blocks so they respond to theme changes. The `@theme` block should only keep references.

In `dashboard/app/globals.css`, replace the `@theme { --color-bg-base... }` block (lines 7-30) with CSS var references, and add explicit `:root` and `.dark` blocks for brand tokens:

```css
/* ── Brand tokens (light mode) ─────────────────────────────────────────────── */
:root {
  --color-bg-base: #FAFAF8;
  --color-bg-surface: #FFFFFF;
  --color-bg-elevated: #F5F3F0;
  --color-text-primary: #1a1816;
  --color-text-secondary: #78716C;
  --color-text-muted: #A8A29E;
  --color-accent: #B45309;
  --color-accent-hover: #D97706;
  --color-accent-muted: rgba(180, 83, 9, 0.12);
  --color-border: #E5E2DD;

  /* Status colours — same in both themes for consistency */
  --color-status-discovered: #64748B;
  --color-status-applied: #3B82F6;
  --color-status-screening: #6366F1;
  --color-status-interviewing: #D97706;
  --color-status-offer: #059669;
  --color-status-negotiating: #EAB308;
  --color-status-accepted: #22C55E;
  --color-status-rejected: #D44460;
  --color-status-withdrawn: #6B7280;
  --color-status-ghosted: #4B5563;

  /* Priority colours */
  --color-priority-high: #E11D48;
  --color-priority-medium: #D97706;
  --color-priority-low: #6B7280;
}

/* ── Brand tokens (dark mode) ──────────────────────────────────────────────── */
.dark {
  --color-bg-base: #110f0d;
  --color-bg-surface: #1c1a17;
  --color-bg-elevated: #272421;
  --color-text-primary: #E8E0D5;
  --color-text-secondary: #968f87;
  --color-text-muted: #686260;
  --color-accent: #D97706;
  --color-accent-hover: #F59E0B;
  --color-accent-muted: rgba(217, 119, 6, 0.15);
  --color-border: #3a3632;
}
```

Remove the old `@theme { --color-bg-base... --color-status-* }` block since these are now in `:root`/`.dark`.

- [ ] **Step 2: Update tailwind.config.ts to use CSS vars**

Replace the entire `colors` extend in `dashboard/tailwind.config.ts`:

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "var(--color-bg-base)",
          surface: "var(--color-bg-surface)",
          elevated: "var(--color-bg-elevated)",
        },
        text: {
          primary: "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
          muted: "var(--color-text-muted)",
        },
        accent: {
          DEFAULT: "var(--color-accent)",
          hover: "var(--color-accent-hover)",
          muted: "var(--color-accent-muted)",
        },
        status: {
          discovered: "var(--color-status-discovered)",
          applied: "var(--color-status-applied)",
          screening: "var(--color-status-screening)",
          interviewing: "var(--color-status-interviewing)",
          offer: "var(--color-status-offer)",
          negotiating: "var(--color-status-negotiating)",
          accepted: "var(--color-status-accepted)",
          rejected: "var(--color-status-rejected)",
          withdrawn: "var(--color-status-withdrawn)",
          ghosted: "var(--color-status-ghosted)",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)"],
        mono: ["var(--font-geist-mono)"],
      },
      borderRadius: {
        card: "8px",
        button: "6px",
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 3: Rewrite theme.ts to resolve CSS vars at runtime**

Replace `dashboard/lib/theme.ts` entirely:

```typescript
export const ACTIVE_STATUSES = [
  "discovered", "applied", "screening", "interviewing", "offer", "negotiating",
] as const;

export const CLOSED_STATUSES = [
  "accepted", "rejected", "withdrawn", "ghosted",
] as const;

export const KANBAN_COLUMNS = [
  { key: "discovered", label: "Discovered" },
  { key: "applied", label: "Applied" },
  { key: "screening", label: "Screening" },
  { key: "interviewing", label: "Interviewing" },
  { key: "offer_negotiating", label: "Offer / Negotiating" },
] as const;

export function daysSince(dateString: string): number {
  const then = new Date(dateString);
  const now = new Date();
  return Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24));
}

/** Resolve a CSS custom property value. Falls back during SSR. */
function getCSSVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

// SSR fallbacks — must match dark mode values in globals.css
const STATUS_FALLBACKS: Record<string, string> = {
  discovered: "#64748B", applied: "#3B82F6", screening: "#6366F1",
  interviewing: "#D97706", offer: "#059669", negotiating: "#EAB308",
  accepted: "#22C55E", rejected: "#D44460", withdrawn: "#6B7280", ghosted: "#4B5563",
};

const PRIORITY_FALLBACKS: Record<string, string> = {
  high: "#E11D48", medium: "#D97706", low: "#6B7280",
};

export function getStatusColor(status: string): string {
  return getCSSVar(`--color-status-${status}`, STATUS_FALLBACKS[status] ?? "#666");
}

export function getPriorityColor(priority: string): string {
  return getCSSVar(`--color-priority-${priority}`, PRIORITY_FALLBACKS[priority] ?? "#666");
}

// Static maps kept for backward compat — consumers needing all colors at once
export const STATUS_COLORS: Record<string, string> = STATUS_FALLBACKS;
export const PRIORITY_COLORS: Record<string, string> = PRIORITY_FALLBACKS;
```

- [ ] **Step 4: Update skills-radar.tsx**

Replace hardcoded hex in `dashboard/components/career/skills-radar.tsx`:

```tsx
"use client";

import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";
import { getStatusColor } from "@/lib/theme";
import type { Skill } from "@shared/schemas/career-schema";

interface SkillsRadarProps { skills: Skill[]; }

export function SkillsRadar({ skills }: SkillsRadarProps) {
  const categories = ["Leadership", "Operations", "Domain", "Technical"];
  const data = categories.map((cat) => {
    const catSkills = skills.filter((s) => s.category === cat);
    const avg = catSkills.length > 0 ? catSkills.reduce((sum, s) => sum + (s.proficiency ?? 0), 0) / catSkills.length : 0;
    return { category: cat, proficiency: Math.round(avg * 10) / 10 };
  });

  const accent = getStatusColor("interviewing"); // amber — matches brand accent

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
          <PolarGrid stroke="var(--color-border, #3a3632)" />
          <PolarAngleAxis dataKey="category" tick={{ fill: "var(--color-text-secondary, #968f87)", fontSize: 12 }} />
          <PolarRadiusAxis domain={[0, 5]} tick={{ fill: "var(--color-text-muted, #686260)", fontSize: 10 }} />
          <Radar dataKey="proficiency" stroke={accent} fill={accent} fillOpacity={0.2} strokeWidth={2} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 5: Update source-effectiveness.tsx**

Replace hardcoded colors in `dashboard/components/analytics/source-effectiveness.tsx`:

```tsx
"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { getStatusColor } from "@/lib/theme";
import type { SourceStat } from "@/lib/analytics";

export function SourceEffectiveness({ sources }: { sources: SourceStat[] }) {
  const accent = getStatusColor("interviewing");
  const blue = getStatusColor("applied");

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={sources}>
          <XAxis dataKey="source" tick={{ fill: "var(--color-text-secondary, #999)", fontSize: 12 }} />
          <YAxis tick={{ fill: "var(--color-text-muted, #666)", fontSize: 10 }} />
          <Tooltip contentStyle={{ backgroundColor: "var(--color-bg-surface, #1a1a1a)", border: "1px solid var(--color-border, #333)", borderRadius: "6px", color: "var(--color-text-primary, #E8E0D5)" }} />
          <Legend />
          <Bar dataKey="count" fill={accent} name="Applications" radius={[4, 4, 0, 0]} />
          <Bar dataKey="responseRate" fill={blue} name="Response %" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 6: Update remaining analytics components**

Read `excitement-vs-outcome.tsx` and `status-breakdown.tsx` and replace any remaining hardcoded hex values with CSS var references or `getStatusColor()` calls, following the pattern from steps 4-5.

- [ ] **Step 7: Verify the dashboard builds**

Run: `cd dashboard && npx next build`

Expected: Build succeeds. No errors from CSS var references.

- [ ] **Step 8: Commit**

```bash
git add dashboard/app/globals.css dashboard/tailwind.config.ts dashboard/lib/theme.ts dashboard/components/career/skills-radar.tsx dashboard/components/analytics/
git commit -m "refactor: single source of truth for colors — CSS vars drive Tailwind, theme.ts, and charts"
```

---

## Task 3: Typed Tool Handlers (Command Pattern)

**Files:**
- Create: `src/types/tool-args.ts` — discriminated union types
- Modify: `src/tools/pipeline.ts` — extract handlers, typed dispatch

- [ ] **Step 1: Create discriminated union types**

Create `src/types/tool-args.ts`:

```typescript
import type { ApplicationStatus } from "../schemas/career-schema.js";

export type PipelineAddArgs = {
  action: "add";
  company: string;
  role: string;
  postingUrl?: string;
  postingText?: string;
  source?: string;
  referral?: string;
  priority?: "high" | "medium" | "low";
  excitement?: number;
  salaryMin?: number;
  salaryMax?: number;
};

export type PipelineUpdateArgs = {
  action: "update";
  id: string;
  status?: ApplicationStatus;
  notes?: string;
  followUpDue?: string;
  priority?: "high" | "medium" | "low";
  contactName?: string;
  contactTitle?: string;
  contactEmail?: string;
  interviewType?: "phone_screen" | "behavioral" | "technical" | "panel" | "final" | "offer_call" | "other";
  interviewDate?: string;
};

export type PipelineGetArgs = { action: "get"; id: string };

export type PipelineListArgs = {
  action: "list";
  filterStatus?: ApplicationStatus;
  filterPriority?: "high" | "medium" | "low";
  sortBy?: "date" | "status" | "priority" | "company" | "excitement";
  limit?: number;
};

export type PipelineStatsArgs = { action: "stats" };
export type PipelineNextActionsArgs = { action: "next_actions" };

export type PipelineArgs =
  | PipelineAddArgs
  | PipelineUpdateArgs
  | PipelineGetArgs
  | PipelineListArgs
  | PipelineStatsArgs
  | PipelineNextActionsArgs;

export type ToolResponse = {
  content: Array<{ type: "text"; text: string }>;
};
```

- [ ] **Step 2: Extract pipeline handlers**

Refactor `src/tools/pipeline.ts`: move each switch case into an exported async function (`handleAdd`, `handleUpdate`, `handleGet`, `handleList`, `handleStats`, `handleNextActions`). Keep the `registerPipelineTools` function with its schema and make the callback a thin dispatcher that casts `args` and delegates. Keep `classify_email` inline (single-action tool, no switch).

Each handler takes typed args + the loaded pipeline. Export all handlers so tests can import them directly.

Full handler code: extract the existing case bodies verbatim into named functions with the types from step 1. See `src/tools/pipeline.ts` lines 48-218 for the current code.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/tool-args.ts src/tools/pipeline.ts
git commit -m "refactor: typed tool handlers with extracted functions for testability"
```

---

## Task 4: Light/Dark Mode

**Files:**
- Modify: `dashboard/app/globals.css` — warm light palette in `:root` (done as part of Task 2 Step 1)
- Create: `dashboard/lib/theme-provider.tsx` — client-side theme detection + toggle
- Modify: `dashboard/app/layout.tsx` — remove hardcoded `className="dark"`, add ThemeProvider
- Modify: `dashboard/components/layout/settings-dropdown.tsx` — add light/dark/system toggle

- [ ] **Step 1: Create theme provider**

Create `dashboard/lib/theme-provider.tsx`:

```tsx
"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: "system",
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");

  useEffect(() => {
    const stored = localStorage.getItem("theme") as Theme | null;
    if (stored) setThemeState(stored);
  }, []);

  useEffect(() => {
    const root = document.documentElement;

    if (theme === "system") {
      localStorage.removeItem("theme");
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const apply = () => root.classList.toggle("dark", mq.matches);
      apply();
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }

    localStorage.setItem("theme", theme);
    root.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme: setThemeState }}>
      {children}
    </ThemeContext.Provider>
  );
}
```

- [ ] **Step 2: Update layout.tsx**

In `dashboard/app/layout.tsx`:
1. Remove `className="dark"` from `<html>` tag, add `suppressHydrationWarning`
2. Add inline `<script>` in `<head>` for FOUC prevention (reads localStorage + prefers-color-scheme before paint)
3. Wrap children with `<ThemeProvider>`
4. Change body classes from `bg-bg-base text-text-primary` to `bg-background text-foreground` (shadcn semantic tokens)

The inline script is a static string with no user input — standard Next.js FOUC prevention pattern:
```
(function(){var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}})()
```

- [ ] **Step 3: Add theme toggle to settings dropdown**

Update `dashboard/components/layout/settings-dropdown.tsx`:
- Import `useTheme` from `@/lib/theme-provider`
- Import `Sun`, `Moon`, `Monitor` from `lucide-react`
- Add theme section with 3 items: Light, Dark, System — each calls `setTheme()`
- Show checkmark on active selection
- Keep existing data path and version items below a separator

- [ ] **Step 4: Test both modes**

Run: `cd dashboard && npx next dev --turbopack`

Verify:
- Default follows system preference
- Toggle works between light/dark/system
- Colors are correct in both modes (brand tokens, status colors, charts)
- No flash of wrong theme on page load

- [ ] **Step 5: Commit**

```bash
git add dashboard/lib/theme-provider.tsx dashboard/app/layout.tsx dashboard/components/layout/settings-dropdown.tsx
git commit -m "feat: light/dark mode with system preference detection and manual toggle"
```

---

## Task 5: Error Boundaries

**Files:**
- Create: `dashboard/app/error.tsx`
- Create: `dashboard/app/pipeline/[id]/error.tsx`

- [ ] **Step 1: Create root error boundary**

Create `dashboard/app/error.tsx` — a `"use client"` component that receives `{ error, reset }` props. Shows warning icon, error message, and "Try again" button that calls `reset()`. Use shadcn semantic color classes (`bg-primary`, `text-primary-foreground`, etc.).

- [ ] **Step 2: Create pipeline detail error boundary**

Create `dashboard/app/pipeline/[id]/error.tsx` — similar to root but with "Back to pipeline" link alongside the retry button. Use `next/link` to `/pipeline`.

- [ ] **Step 3: Commit**

```bash
git add dashboard/app/error.tsx dashboard/app/pipeline/\[id\]/error.tsx
git commit -m "feat: error boundaries for root and pipeline detail pages"
```

---

## Task 6: UX Details

**Files:**
- Modify: `dashboard/components/layout/completeness-ring.tsx` — proper Tooltip component
- Modify: `dashboard/app/analytics/page.tsx` — actionable empty state CTA
- Create: `dashboard/app/icon.svg` — compass favicon

- [ ] **Step 1: Add shadcn Tooltip to completeness ring**

Replace the basic `title` attribute in `dashboard/components/layout/completeness-ring.tsx` with the shadcn `<Tooltip>` component. Add optional `missingFields` prop and display them in the tooltip. Replace hardcoded stroke colors with CSS var references (`className="stroke-border"` and `className="stroke-primary"`).

Update the caller in `dashboard/components/layout/nav-bar.tsx` to pass `missingFields` from the completeness calculation.

- [ ] **Step 2: Improve analytics empty state**

In `dashboard/app/analytics/page.tsx` line 15, replace the message with an actionable CTA:
```
Add 3+ applications via Claude to unlock analytics. Try: "I found a job posting I'm interested in" — and Claude will add it to your pipeline.
```

- [ ] **Step 3: Add compass SVG favicon**

Create `dashboard/app/icon.svg` — a simple compass icon (circle with directional markers and a needle). Next.js App Router automatically serves `app/icon.svg` as the favicon.

- [ ] **Step 4: Commit**

```bash
git add dashboard/components/layout/completeness-ring.tsx dashboard/components/layout/nav-bar.tsx dashboard/app/analytics/page.tsx dashboard/app/icon.svg
git commit -m "polish: completeness tooltip, analytics CTA, compass favicon"
```

---

## Task 7: MCP Server Tests

**Files:**
- Create: `vitest.config.ts` (root — for MCP server)
- Create: `src/tools/__tests__/pipeline.test.ts`
- Create: `src/storage/__tests__/file-store.test.ts`
- Create: `src/resources/__tests__/career-kb.test.ts`

- [ ] **Step 1: Set up Vitest for MCP server**

Run: `npm install -D vitest`

Create root `vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
```

Add to root `package.json` scripts: `"test:mcp": "vitest run --config vitest.config.ts"`

- [ ] **Step 2: Write pipeline handler tests**

Create `src/tools/__tests__/pipeline.test.ts`. Mock `savePipeline` via `vi.mock`. Test all 6 handlers:

- `handleAdd`: creates app, returns success, adds to pipeline array
- `handleUpdate`: updates status, appends notes, adds contacts, returns error for unknown ID
- `handleGet`: returns JSON, returns error for missing ID
- `handleList`: markdown table, filters by status, sorts by excitement
- `handleStats`: correct counts for mixed statuses, empty pipeline
- `handleNextActions`: flags overdue follow-ups, pending offers, all-clear for clean pipeline

Use helper functions `makePipeline()` and `makeApp(overrides)` to create test data.

- [ ] **Step 3: Run tests**

Run: `npx vitest run --config vitest.config.ts`

Expected: All pipeline tests pass.

- [ ] **Step 4: Write file-store tests**

Create `src/storage/__tests__/file-store.test.ts`. Mock `fs/promises` and `fs`. Test:
- `loadCareerData`: returns parsed data when files exist, returns null when profile missing, handles corrupt YAML gracefully
- `loadPipeline`: returns parsed pipeline, returns empty pipeline when file missing
- `saveCareerSection`: writes YAML to correct path
- `savePipeline`: writes YAML with updated timestamp

- [ ] **Step 5: Write resource tests**

Create `src/resources/__tests__/career-kb.test.ts`. Test that resource handlers return expected JSON structure when career data is loaded. Mock `loadCareerData` and `loadPipeline`.

- [ ] **Step 6: Run full MCP test suite**

Run: `npx vitest run --config vitest.config.ts`

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts src/tools/__tests__/ src/storage/__tests__/ src/resources/__tests__/ package.json package-lock.json
git commit -m "test: full MCP server test suite — pipeline handlers, file-store, resources"
```

---

## Task 8: Dashboard Component Tests

**Files:**
- Modify: `dashboard/vitest.config.ts` — add jsdom, aliases
- Create: `dashboard/components/__tests__/application-card.test.tsx`
- Create: `dashboard/components/__tests__/empty-state.test.tsx`

- [ ] **Step 1: Install test dependencies**

Run: `cd dashboard && npm install -D @testing-library/react @testing-library/jest-dom jsdom`

Update `dashboard/vitest.config.ts` to include `environment: "jsdom"` and path aliases for `@/` and `@shared/`.

- [ ] **Step 2: Write application-card tests**

Test: renders company and role, shows correct status badge, shows overdue indicator when `followUpDue` is past, shows excitement gauge.

- [ ] **Step 3: Write empty-state tests**

Test: renders icon and message text, accepts custom className.

- [ ] **Step 4: Run all dashboard tests**

Run: `cd dashboard && npx vitest run`

Expected: All tests pass (existing analytics/completeness/CLI tests + new component tests).

- [ ] **Step 5: Commit**

```bash
git add dashboard/vitest.config.ts dashboard/components/__tests__/ dashboard/package.json dashboard/package-lock.json
git commit -m "test: dashboard component tests for application-card and empty-state"
```

---

## Task 9: Storybook Setup

**Files:**
- Create: `dashboard/.storybook/main.ts`
- Create: `dashboard/.storybook/preview.ts`
- Create: story files for key components

- [ ] **Step 1: Initialize Storybook**

Run: `cd dashboard && npx storybook@latest init --builder vite --skip-install && npm install`

Verify `.storybook/` directory is created with `main.ts` and `preview.ts`.

- [ ] **Step 2: Configure for Tailwind + theme switching**

Update `.storybook/preview.ts` to import `../app/globals.css` and configure dark mode toggle. Ensure the Tailwind classes render in the Storybook iframe.

- [ ] **Step 3: Write stories for key components**

Create stories for at minimum:
- `application-card.stories.tsx` — default, overdue, high-excitement, offer-stage, rejected
- `skills-radar.stories.tsx` — with data, empty skills
- `completeness-ring.stories.tsx` — 0%, 50%, 72%, 100%
- `empty-state.stories.tsx` — various messages and icons

- [ ] **Step 4: Verify Storybook runs**

Run: `cd dashboard && npx storybook dev -p 6006`

Expected: Opens in browser, components render, dark/light toggle works.

- [ ] **Step 5: Add scripts**

Root `package.json`: `"storybook": "cd dashboard && npx storybook dev -p 6006"`
Dashboard `package.json`: `"storybook": "storybook dev -p 6006"`, `"build-storybook": "storybook build"`

- [ ] **Step 6: Commit**

```bash
git add dashboard/.storybook/ "dashboard/components/**/*.stories.tsx" dashboard/package.json package.json
git commit -m "feat: Storybook with stories for key dashboard components"
```

---

## Task 10: README Enhancements

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add architecture diagram**

Add an ASCII architecture diagram after the "What it feels like" section showing: Claude ↔ MCP Server (tools/resources/prompts) ↔ File Store (YAML) ← Dashboard UI (Next.js).

- [ ] **Step 2: Add Development section**

Add before Contributing. Include: git clone, npm install (both root + dashboard), dev commands (`npm run dev`, `npm run dev:dashboard`, `npm run inspect`, `npm run test`, `npm run test:mcp`, `npm run storybook`), and how to use example data.

- [ ] **Step 3: Add Data Structure section**

Add after Quick Start. Show the `~/.career-compass/` directory tree with file descriptions. Document `CAREER_DATA_PATH` env var.

- [ ] **Step 4: Add screenshot image references**

Add after the Dashboard heading. Reference dark-mode screenshots from `docs/screenshots/`:
```markdown
![Pipeline Kanban](docs/screenshots/pipeline-kanban-dark.png)
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: architecture diagram, dev guide, data structure, screenshot placeholders"
```

---

## Task 11: Automated Screenshots

**Files:**
- Create: `scripts/capture-screenshots.ts`
- Create: `docs/screenshots/` (output directory)

- [ ] **Step 1: Install Playwright**

Run: `npm install -D playwright && npx playwright install chromium`

- [ ] **Step 2: Write screenshot capture script**

Create `scripts/capture-screenshots.ts` that:
1. Starts the Next.js dev server with `CAREER_DATA_PATH=data/example` on a non-default port
2. Launches Chromium via Playwright at 1280×800
3. Captures 4 views (pipeline, detail, career, analytics) in both dark and light `colorScheme`
4. Saves 8 PNGs to `docs/screenshots/`
5. Kills the dev server and closes the browser

- [ ] **Step 3: Add npm script**

Root `package.json`: `"screenshots": "npx tsx scripts/capture-screenshots.ts"`

- [ ] **Step 4: Run screenshots**

Run: `npm run screenshots`

Expected: 8 screenshots in `docs/screenshots/`. Verify they look good.

- [ ] **Step 5: Update README image paths if needed**

Verify the paths in README match the generated filenames.

- [ ] **Step 6: Commit**

```bash
git add scripts/capture-screenshots.ts docs/screenshots/ package.json
git commit -m "feat: automated Playwright screenshot capture for README"
```

---

## Final Verification

- [ ] **Step 1: Run all tests**

```bash
npx vitest run --config vitest.config.ts && cd dashboard && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 2: Full build**

```bash
npm run build
```

Expected: TypeScript compiles, Next.js builds, no errors.

- [ ] **Step 3: Visual spot-check**

Run: `CAREER_DATA_PATH=data/example npm run dev:dashboard`

Verify: 8-app kanban, light/dark toggle, analytics charts, error boundaries, favicon, completeness tooltip.
