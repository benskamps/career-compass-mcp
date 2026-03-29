# Career Compass MCP v2.0 — Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a built-in Next.js dashboard to the Career Compass MCP server, launched via `career-compass-mcp dashboard`, providing pipeline kanban, career KB overview, analytics, and guided onboarding — reading from the same YAML files.

**Architecture:** Single npm package with two modes (MCP stdio server + localhost dashboard). Dashboard uses Next.js 16 server components to read YAML directly via shared `file-store.ts`. Read-only except onboarding wizard. Claude-themed dark UI with shadcn/ui + Recharts.

**Tech Stack:** Next.js 16, TypeScript, Tailwind CSS, shadcn/ui, Recharts, Geist fonts

**Design Spec:** `docs/superpowers/specs/2026-03-29-v2-dashboard-design.md`

---

## File Map

### New Files (dashboard/)

```
dashboard/
├── app/
│   ├── globals.css                          # Claude theme CSS variables + Tailwind base
│   ├── layout.tsx                           # Root layout: Geist fonts, dark theme, nav bar
│   ├── page.tsx                             # Root redirect: → /onboarding or /pipeline
│   ├── onboarding/
│   │   ├── page.tsx                         # Onboarding page (Phase 1 + Phase 2 wizard)
│   │   └── actions.ts                       # Server actions: poll for data, save wizard steps
│   ├── pipeline/
│   │   ├── page.tsx                         # Kanban board page
│   │   └── [id]/
│   │       └── page.tsx                     # Application detail page
│   ├── career/
│   │   └── page.tsx                         # Career KB overview page
│   └── analytics/
│       └── page.tsx                         # Analytics dashboard page
├── lib/
│   ├── data.ts                              # Server-side data loaders (wraps file-store.ts)
│   ├── theme.ts                             # Status colors, priority colors, constants
│   ├── completeness.ts                      # KB completeness score calculation
│   └── analytics.ts                         # Analytics computation functions
├── components/
│   ├── layout/
│   │   ├── nav-bar.tsx                      # Top navigation bar
│   │   ├── completeness-ring.tsx            # Circular progress indicator
│   │   └── settings-dropdown.tsx            # Settings gear dropdown
│   ├── pipeline/
│   │   ├── kanban-board.tsx                 # Full kanban board (columns + cards)
│   │   ├── kanban-column.tsx                # Single status column
│   │   ├── application-card.tsx             # Pipeline card (company, role, status indicators)
│   │   ├── filter-bar.tsx                   # Filter/sort/search controls
│   │   ├── closed-section.tsx               # Collapsible closed applications
│   │   ├── application-header.tsx           # Detail page header
│   │   ├── application-timeline.tsx         # Vertical event timeline
│   │   ├── contacts-panel.tsx               # Contact cards grid
│   │   ├── notes-log.tsx                    # Chronological notes
│   │   └── metadata-sidebar.tsx             # Detail page sidebar
│   ├── career/
│   │   ├── profile-header.tsx               # Name, summary, targets, preferences
│   │   ├── skills-radar.tsx                 # Radar chart (Recharts, client component)
│   │   ├── skills-list.tsx                  # Grouped skills with proficiency dots
│   │   ├── experience-timeline.tsx          # Role cards with expandable achievements
│   │   ├── testimonials.tsx                 # Pull-quote cards
│   │   └── education-list.tsx               # Education + certs list
│   ├── analytics/
│   │   ├── stat-card.tsx                    # Single metric card
│   │   ├── stat-cards-row.tsx               # Top 4 stat cards
│   │   ├── pipeline-funnel.tsx              # Funnel chart (client component)
│   │   ├── status-breakdown.tsx             # Donut chart (client component)
│   │   ├── applications-over-time.tsx       # Area chart (client component)
│   │   ├── source-effectiveness.tsx         # Grouped bar chart (client component)
│   │   └── excitement-vs-outcome.tsx        # Scatter plot (client component)
│   ├── onboarding/
│   │   ├── phase-one.tsx                    # "Start with Claude" screen
│   │   ├── wizard-shell.tsx                 # Wizard step container
│   │   ├── step-profile.tsx                 # Profile check step
│   │   ├── step-targets.tsx                 # Target roles & industries
│   │   ├── step-salary.tsx                  # Salary & preferences
│   │   ├── step-skills.tsx                  # Skills review
│   │   └── step-completion.tsx              # Completion summary
│   └── ui/                                  # shadcn/ui components (installed via CLI)
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.mjs
└── tsconfig.json
```

### New Files (repo root)

```
bin/
└── cli.ts                                   # CLI entry point (replaces src/index.ts as bin)
```

### Modified Files

```
src/storage/file-store.ts                    # Update default data path to ~/.career-compass/
package.json                                 # Add dashboard deps, update bin, update scripts
tsconfig.json                                # Add shared path config
```

---

## Task 1: Scaffold Next.js Dashboard + Shared Config

**Files:**
- Create: `dashboard/next.config.ts`
- Create: `dashboard/tsconfig.json`
- Create: `dashboard/tailwind.config.ts`
- Create: `dashboard/postcss.config.mjs`
- Create: `dashboard/app/globals.css`
- Create: `dashboard/app/layout.tsx`
- Create: `dashboard/app/page.tsx`
- Modify: `package.json`
- Modify: `src/storage/file-store.ts`

- [ ] **Step 1: Install Next.js and dashboard dependencies**

Run from repo root:
```bash
cd dashboard
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*" --turbopack --skip-install
```

Then from repo root:
```bash
npm install next@latest react@latest react-dom@latest recharts
npm install -D @types/react @types/react-dom tailwindcss @tailwindcss/postcss postcss
```

- [ ] **Step 2: Configure dashboard/tsconfig.json with shared path aliases**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"],
      "@shared/*": ["../src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Configure next.config.ts with standalone output and shared imports**

```typescript
// dashboard/next.config.ts
import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, ".."),
  serverExternalPackages: ["yaml"],
  turbopack: {
    resolveAlias: {
      "@shared": path.join(import.meta.dirname, "../src"),
    },
  },
};

export default nextConfig;
```

- [ ] **Step 4: Configure tailwind.config.ts with Claude theme tokens**

```typescript
// dashboard/tailwind.config.ts
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
          base: "#0d0d0d",
          surface: "#1a1a1a",
          elevated: "#242424",
        },
        border: "#333333",
        text: {
          primary: "#E8E0D5",
          secondary: "#999999",
          muted: "#666666",
        },
        accent: {
          DEFAULT: "#D97706",
          hover: "#F59E0B",
          muted: "rgba(217, 119, 6, 0.2)",
        },
        status: {
          discovered: "#64748B",
          applied: "#3B82F6",
          screening: "#6366F1",
          interviewing: "#D97706",
          offer: "#059669",
          negotiating: "#EAB308",
          accepted: "#22C55E",
          rejected: "rgba(244, 63, 94, 0.7)",
          withdrawn: "#6B7280",
          ghosted: "#4B5563",
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

- [ ] **Step 5: Create globals.css with CSS variables and base styles**

```css
/* dashboard/app/globals.css */
@import "tailwindcss";

@theme {
  --color-bg-base: #0d0d0d;
  --color-bg-surface: #1a1a1a;
  --color-bg-elevated: #242424;
  --color-border: #333333;
  --color-text-primary: #E8E0D5;
  --color-text-secondary: #999999;
  --color-text-muted: #666666;
  --color-accent: #D97706;
  --color-accent-hover: #F59E0B;
  --color-accent-muted: rgba(217, 119, 6, 0.2);
}

body {
  background-color: var(--color-bg-base);
  color: var(--color-text-primary);
}

::selection {
  background-color: var(--color-accent-muted);
  color: var(--color-text-primary);
}
```

- [ ] **Step 6: Create root layout with Geist fonts**

```tsx
// dashboard/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Career Compass",
  description: "Your AI-native career co-pilot",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased bg-bg-base text-text-primary`}
      >
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 7: Create placeholder root page**

```tsx
// dashboard/app/page.tsx
export default function Home() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <h1 className="text-2xl font-semibold text-accent">Career Compass</h1>
    </div>
  );
}
```

- [ ] **Step 8: Update file-store.ts default data path**

In `src/storage/file-store.ts`, change `getDataDir()`:

```typescript
// Replace:
function getDataDir(): string {
  return process.env.CAREER_DATA_PATH ?? join(process.cwd(), "data");
}

// With:
import { homedir } from "os";

function getDataDir(): string {
  return process.env.CAREER_DATA_PATH ?? join(homedir(), ".career-compass");
}
```

Also add the `homedir` import at the top of the file (add `homedir` to the `os` import, or add new import line).

- [ ] **Step 9: Update package.json with dashboard scripts**

Add to `package.json`:
```json
{
  "scripts": {
    "build": "tsc && npm run build:dashboard",
    "build:dashboard": "cd dashboard && npx next build",
    "dev": "tsc --watch",
    "dev:dashboard": "cd dashboard && npx next dev --turbopack",
    "start": "node build/index.js"
  }
}
```

Keep existing scripts, merge the new ones in.

- [ ] **Step 10: Verify the dashboard builds and runs**

```bash
cd dashboard && npx next dev --turbopack
```

Open `http://localhost:3000` — should see "Career Compass" in amber on a dark background.

Expected: Page loads with dark background (#0d0d0d), amber text, Geist font.

- [ ] **Step 11: Commit**

```bash
git add dashboard/ package.json package-lock.json src/storage/file-store.ts
git commit -m "feat: scaffold Next.js dashboard with Claude theme"
```

---

## Task 2: Install shadcn/ui + Base Components

**Files:**
- Create: `dashboard/components/ui/*.tsx` (via shadcn CLI)
- Create: `dashboard/lib/utils.ts`
- Modify: `dashboard/app/globals.css` (shadcn additions)

- [ ] **Step 1: Initialize shadcn/ui**

```bash
cd dashboard && npx shadcn@latest init
```

Select: New York style, Zinc base color, CSS variables: yes.

This creates `components/ui/` and `lib/utils.ts` with the `cn()` helper.

- [ ] **Step 2: Install required shadcn components**

```bash
cd dashboard
npx shadcn@latest add badge button card dropdown-menu input label select separator slider tabs tooltip
```

- [ ] **Step 3: Override shadcn CSS variables for Claude theme**

After shadcn init modifies `globals.css`, ensure the dark theme variables are overridden with our Claude palette. The `:root` and `.dark` blocks should use our custom values. Key overrides:

```css
.dark {
  --background: 0 0% 5%;          /* #0d0d0d */
  --foreground: 33 20% 88%;       /* #E8E0D5 */
  --card: 0 0% 10%;               /* #1a1a1a */
  --card-foreground: 33 20% 88%;
  --primary: 36 91% 44%;          /* #D97706 */
  --primary-foreground: 33 20% 88%;
  --border: 0 0% 20%;             /* #333333 */
  --muted: 0 0% 14%;              /* #242424 */
  --muted-foreground: 0 0% 60%;   /* #999999 */
  --accent: 36 91% 44%;
  --accent-foreground: 33 20% 88%;
  --destructive: 349 80% 50%;     /* #E11D48 */
  --ring: 36 91% 44%;
  --radius: 0.5rem;
}
```

- [ ] **Step 4: Verify shadcn components render correctly**

Add a test card to `dashboard/app/page.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex items-center justify-center min-h-screen p-8">
      <Card className="w-96">
        <CardHeader>
          <CardTitle>Career Compass</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-text-secondary">Dashboard scaffolded.</p>
          <div className="flex gap-2">
            <Badge>Pipeline</Badge>
            <Badge variant="outline">Career</Badge>
            <Badge variant="secondary">Analytics</Badge>
          </div>
          <Button>Launch</Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

Run `cd dashboard && npx next dev --turbopack` and verify dark card renders with amber accents.

- [ ] **Step 5: Commit**

```bash
git add dashboard/
git commit -m "feat: install shadcn/ui with Claude theme overrides"
```

---

## Task 3: Theme Constants + Data Layer + Completeness Score

**Files:**
- Create: `dashboard/lib/theme.ts`
- Create: `dashboard/lib/data.ts`
- Create: `dashboard/lib/completeness.ts`
- Create: `dashboard/lib/completeness.test.ts`

- [ ] **Step 1: Create theme.ts with status colors and constants**

```typescript
// dashboard/lib/theme.ts
export const STATUS_COLORS: Record<string, string> = {
  discovered: "#64748B",
  applied: "#3B82F6",
  screening: "#6366F1",
  interviewing: "#D97706",
  offer: "#059669",
  negotiating: "#EAB308",
  accepted: "#22C55E",
  rejected: "rgba(244, 63, 94, 0.7)",
  withdrawn: "#6B7280",
  ghosted: "#4B5563",
};

export const PRIORITY_COLORS: Record<string, string> = {
  high: "#E11D48",
  medium: "#D97706",
  low: "#6B7280",
};

export const ACTIVE_STATUSES = [
  "discovered",
  "applied",
  "screening",
  "interviewing",
  "offer",
  "negotiating",
] as const;

export const CLOSED_STATUSES = [
  "accepted",
  "rejected",
  "withdrawn",
  "ghosted",
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
```

- [ ] **Step 2: Create data.ts server-side data loaders**

```typescript
// dashboard/lib/data.ts
import { loadCareerData, loadPipeline } from "@shared/storage/file-store.js";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export { loadCareerData, loadPipeline };

export function getDataDir(): string {
  return process.env.CAREER_DATA_PATH ?? join(homedir(), ".career-compass");
}

export function hasProfileData(): boolean {
  const profilePath = join(getDataDir(), "career", "profile.yaml");
  return existsSync(profilePath);
}

export type DataStatus = "empty" | "incomplete" | "complete";

export async function getDataStatus(): Promise<DataStatus> {
  if (!hasProfileData()) return "empty";
  const career = await loadCareerData();
  if (!career) return "empty";

  // Check for gaps
  const { profile, experience, skills } = career;
  const hasTargets = profile.targetRoles.length > 0;
  const hasSalary = profile.salaryMin !== undefined && profile.salaryMax !== undefined;
  const hasSkillProficiency = skills.some((s) => s.proficiency !== undefined);
  const hasExperience = experience.length > 0;

  if (!hasTargets || !hasSalary || !hasSkillProficiency || !hasExperience) {
    return "incomplete";
  }
  return "complete";
}
```

- [ ] **Step 3: Write failing test for completeness score**

Create the test file:

```typescript
// dashboard/lib/completeness.test.ts
import { describe, it, expect } from "vitest";
import { calculateCompleteness } from "./completeness";
import type { CareerData } from "@shared/schemas/career-schema.js";

const emptyCareer: CareerData = {
  profile: {
    name: "",
    summary: "",
    targetRoles: [],
    targetIndustries: [],
    targetCompanySize: [],
    salaryCurrency: "USD",
    openToRemote: true,
    openToRelocation: false,
  },
  experience: [],
  skills: [],
  education: [],
  projects: [],
  testimonials: [],
};

const fullCareer: CareerData = {
  profile: {
    name: "Alex Rivera",
    summary: "Operations leader with 9 years experience",
    targetRoles: ["Program Manager"],
    targetIndustries: ["SaaS"],
    targetCompanySize: ["Series B"],
    salaryMin: 140000,
    salaryMax: 180000,
    salaryCurrency: "USD",
    openToRemote: true,
    openToRelocation: false,
  },
  experience: [
    {
      role: "Senior PM",
      company: "MedFlow",
      startDate: "2021-03",
      endDate: "present",
      achievements: [
        { metric: "Reduced time 40%", context: "Process", impact: "Saved $2M", keywords: [] },
      ],
      tags: [],
    },
  ],
  skills: [
    { name: "Leadership", category: "Leadership", proficiency: 5 },
    { name: "Operations", category: "Operations", proficiency: 4 },
    { name: "Data Analysis", category: "Technical", proficiency: 3 },
  ],
  education: [{ degree: "BS", institution: "UT Austin", date: "2015", relevantCoursework: [], certifications: [] }],
  projects: [],
  testimonials: [
    { source: "Jane Doe, VP", relationship: "Manager", quote: "Outstanding performer" },
  ],
};

describe("calculateCompleteness", () => {
  it("returns 0 for empty career data", () => {
    expect(calculateCompleteness(emptyCareer)).toBe(0);
  });

  it("returns 100 for fully populated career data", () => {
    expect(calculateCompleteness(fullCareer)).toBe(100);
  });

  it("returns partial score for partial data", () => {
    const partial: CareerData = {
      ...emptyCareer,
      profile: { ...emptyCareer.profile, name: "Alex", summary: "A summary" },
      experience: fullCareer.experience,
    };
    // profile (20%) + experience (25%) = 45%
    expect(calculateCompleteness(partial)).toBe(45);
  });

  it("skills need 3+ with proficiency to count", () => {
    const twoSkills: CareerData = {
      ...emptyCareer,
      profile: { ...emptyCareer.profile, name: "Alex", summary: "A summary" },
      skills: [
        { name: "A", category: "X", proficiency: 3 },
        { name: "B", category: "Y", proficiency: 4 },
      ],
    };
    // profile (20%) only, skills has 2 not 3
    expect(calculateCompleteness(twoSkills)).toBe(20);
  });
});
```

- [ ] **Step 4: Install vitest and run test to verify it fails**

```bash
npm install -D vitest
```

Add to `package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

Create `dashboard/vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "../src"),
      "@": path.resolve(import.meta.dirname),
    },
  },
  test: {
    include: ["**/*.test.ts"],
  },
});
```

Run:
```bash
cd dashboard && npx vitest run lib/completeness.test.ts
```

Expected: FAIL — `calculateCompleteness` not found.

- [ ] **Step 5: Implement completeness score**

```typescript
// dashboard/lib/completeness.ts
import type { CareerData } from "@shared/schemas/career-schema.js";

interface CompletenessRule {
  weight: number;
  check: (data: CareerData) => boolean;
}

const RULES: CompletenessRule[] = [
  {
    weight: 20,
    check: (d) => d.profile.name.length > 0 && d.profile.summary.length > 0,
  },
  {
    weight: 10,
    check: (d) => d.profile.targetRoles.length > 0,
  },
  {
    weight: 5,
    check: (d) => d.profile.salaryMin !== undefined && d.profile.salaryMax !== undefined,
  },
  {
    weight: 25,
    check: (d) =>
      d.experience.length > 0 &&
      d.experience.some((e) => e.achievements.length > 0),
  },
  {
    weight: 20,
    check: (d) =>
      d.skills.filter((s) => s.proficiency !== undefined).length >= 3,
  },
  {
    weight: 10,
    check: (d) => d.education.length > 0,
  },
  {
    weight: 10,
    check: (d) => d.testimonials.length > 0,
  },
];

export function calculateCompleteness(data: CareerData): number {
  return RULES.reduce(
    (score, rule) => score + (rule.check(data) ? rule.weight : 0),
    0
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd dashboard && npx vitest run lib/completeness.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add dashboard/lib/ dashboard/vitest.config.ts package.json
git commit -m "feat: add theme constants, data layer, and completeness score with tests"
```

---

## Task 4: Navigation Bar + Root Layout Shell

**Files:**
- Create: `dashboard/components/layout/nav-bar.tsx`
- Create: `dashboard/components/layout/completeness-ring.tsx`
- Create: `dashboard/components/layout/settings-dropdown.tsx`
- Modify: `dashboard/app/layout.tsx`
- Modify: `dashboard/app/page.tsx`

- [ ] **Step 1: Create completeness ring component**

```tsx
// dashboard/components/layout/completeness-ring.tsx
"use client";

interface CompletenessRingProps {
  score: number;
  size?: number;
}

export function CompletenessRing({ score, size = 32 }: CompletenessRingProps) {
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex items-center gap-2" title={`KB: ${score}% complete`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#333333"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#D97706"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <span className="text-xs font-mono text-text-secondary">{score}%</span>
    </div>
  );
}
```

- [ ] **Step 2: Create settings dropdown**

```tsx
// dashboard/components/layout/settings-dropdown.tsx
"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SettingsDropdownProps {
  dataPath: string;
  version: string;
}

export function SettingsDropdown({ dataPath, version }: SettingsDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="p-2 rounded-button text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors duration-150">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="8" cy="8" r="2.5" />
            <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M2.87 2.87l1.06 1.06M12.07 12.07l1.06 1.06M2.87 13.13l1.06-1.06M12.07 3.93l1.06-1.06" />
          </svg>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Settings</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <span className="text-xs font-mono text-text-muted truncate">{dataPath}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <span className="text-xs text-text-muted">v{version}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 3: Create nav bar**

```tsx
// dashboard/components/layout/nav-bar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CompletenessRing } from "./completeness-ring";
import { SettingsDropdown } from "./settings-dropdown";

const NAV_ITEMS = [
  { href: "/pipeline", label: "Pipeline" },
  { href: "/career", label: "Career" },
  { href: "/analytics", label: "Analytics" },
];

interface NavBarProps {
  completenessScore: number;
  dataPath: string;
}

export function NavBar({ completenessScore, dataPath }: NavBarProps) {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between h-14 px-6 border-b border-border bg-bg-base/95 backdrop-blur-sm">
      <Link href="/" className="text-lg font-semibold tracking-tight text-text-primary">
        Career Compass
      </Link>

      <div className="flex items-center gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`px-4 py-2 text-sm font-medium rounded-button transition-colors duration-150 ${
                isActive
                  ? "text-accent border-b-2 border-accent"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <CompletenessRing score={completenessScore} />
        <SettingsDropdown dataPath={dataPath} version="2.0.0" />
      </div>
    </nav>
  );
}
```

- [ ] **Step 4: Update root layout to include nav bar**

```tsx
// dashboard/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NavBar } from "@/components/layout/nav-bar";
import { loadCareerData } from "@/lib/data";
import { calculateCompleteness } from "@/lib/completeness";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Career Compass",
  description: "Your AI-native career co-pilot",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const career = await loadCareerData();
  const score = career ? calculateCompleteness(career) : 0;
  const dataPath = process.env.CAREER_DATA_PATH ?? "~/.career-compass";

  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased bg-bg-base text-text-primary`}
      >
        <NavBar completenessScore={score} dataPath={dataPath} />
        <main className="min-h-[calc(100vh-3.5rem)]">{children}</main>
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Update root page with redirect logic**

```tsx
// dashboard/app/page.tsx
import { redirect } from "next/navigation";
import { getDataStatus } from "@/lib/data";

export default async function Home() {
  const status = await getDataStatus();

  if (status === "empty" || status === "incomplete") {
    redirect("/onboarding");
  }

  redirect("/pipeline");
}
```

- [ ] **Step 6: Verify nav bar renders**

Set `CAREER_DATA_PATH` to the example data dir and run:
```bash
CAREER_DATA_PATH=./data/example cd dashboard && npx next dev --turbopack
```

Expected: Page redirects to `/pipeline` (404 for now is fine). Nav bar visible with "Pipeline | Career | Analytics" tabs, completeness ring, and settings gear.

- [ ] **Step 7: Commit**

```bash
git add dashboard/
git commit -m "feat: add navigation bar with completeness ring and settings"
```

---

## Task 5: Onboarding Flow

**Files:**
- Create: `dashboard/app/onboarding/page.tsx`
- Create: `dashboard/app/onboarding/actions.ts`
- Create: `dashboard/components/onboarding/phase-one.tsx`
- Create: `dashboard/components/onboarding/wizard-shell.tsx`
- Create: `dashboard/components/onboarding/step-profile.tsx`
- Create: `dashboard/components/onboarding/step-targets.tsx`
- Create: `dashboard/components/onboarding/step-salary.tsx`
- Create: `dashboard/components/onboarding/step-skills.tsx`
- Create: `dashboard/components/onboarding/step-completion.tsx`

- [ ] **Step 1: Create server actions for onboarding**

```typescript
// dashboard/app/onboarding/actions.ts
"use server";

import { hasProfileData, loadCareerData } from "@/lib/data";
import { saveCareerSection } from "@shared/storage/file-store.js";
import type { Profile, Skill } from "@shared/schemas/career-schema.js";

export async function checkForData(): Promise<boolean> {
  return hasProfileData();
}

export async function saveProfile(profile: Partial<Profile>): Promise<void> {
  const career = await loadCareerData();
  const existing = career?.profile ?? {
    name: "",
    summary: "",
    targetRoles: [],
    targetIndustries: [],
    targetCompanySize: [],
    salaryCurrency: "USD",
    openToRemote: true,
    openToRelocation: false,
  };
  await saveCareerSection("profile", { ...existing, ...profile });
}

export async function saveTargets(data: {
  targetRoles: string[];
  targetIndustries: string[];
  targetCompanySize: string[];
}): Promise<void> {
  const career = await loadCareerData();
  if (!career) return;
  await saveCareerSection("profile", { ...career.profile, ...data });
}

export async function saveSalaryPrefs(data: {
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency: string;
  openToRemote: boolean;
  openToRelocation: boolean;
  noticePeriod?: string;
}): Promise<void> {
  const career = await loadCareerData();
  if (!career) return;
  await saveCareerSection("profile", { ...career.profile, ...data });
}

export async function saveSkills(skills: Skill[]): Promise<void> {
  await saveCareerSection("skills", skills);
}
```

- [ ] **Step 2: Create Phase 1 — "Start with Claude" screen**

```tsx
// dashboard/components/onboarding/phase-one.tsx
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { checkForData } from "@/app/onboarding/actions";

interface PhaseOneProps {
  onDataDetected: () => void;
}

export function PhaseOne({ onDataDetected }: PhaseOneProps) {
  const [detected, setDetected] = useState(false);
  const [copied, setCopied] = useState(false);

  const PROMPT = 'Set up my Career KB. Here\'s my resume:';

  useEffect(() => {
    const interval = setInterval(async () => {
      const exists = await checkForData();
      if (exists) {
        setDetected(true);
        clearInterval(interval);
        setTimeout(onDataDetected, 2000);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [onDataDetected]);

  const copyPrompt = () => {
    navigator.clipboard.writeText(PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (detected) {
    return (
      <div className="flex flex-col items-center gap-4 animate-pulse">
        <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold">Data detected!</h2>
        <p className="text-text-secondary">Setting up your dashboard...</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-semibold">Let&apos;s build your Career KB</h1>
        <p className="text-text-secondary">
          Career Compass needs your career history to get started. Claude will extract it from your resume.
        </p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-4">
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="font-mono text-accent font-semibold">1.</span>
              <span>Open Claude (Claude Code or claude.ai with MCP configured)</span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-accent font-semibold">2.</span>
              <span>Say the prompt below and paste your resume after it</span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-accent font-semibold">3.</span>
              <span>Claude extracts your data into structured YAML automatically</span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-accent font-semibold">4.</span>
              <span>Come back here — the dashboard will detect your data</span>
            </li>
          </ol>

          <div className="flex items-center gap-2 p-3 rounded-card bg-bg-elevated border border-border">
            <code className="flex-1 text-sm font-mono text-accent">{PROMPT}</code>
            <Button variant="outline" size="sm" onClick={copyPrompt}>
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-text-muted">
        Waiting for data at ~/.career-compass/ ...
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Create wizard shell**

```tsx
// dashboard/components/onboarding/wizard-shell.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface WizardStep {
  id: string;
  label: string;
  component: React.ReactNode;
  hasGap: boolean;
}

interface WizardShellProps {
  steps: WizardStep[];
  onComplete: () => void;
}

export function WizardShell({ steps, onComplete }: WizardShellProps) {
  const visibleSteps = steps.filter((s) => s.hasGap);
  const [currentIndex, setCurrentIndex] = useState(0);

  if (visibleSteps.length === 0) {
    onComplete();
    return null;
  }

  const current = visibleSteps[currentIndex];
  const isLast = currentIndex === visibleSteps.length - 1;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Progress bar */}
      <div className="flex gap-1">
        {visibleSteps.map((step, i) => (
          <div
            key={step.id}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              i <= currentIndex ? "bg-accent" : "bg-border"
            }`}
          />
        ))}
      </div>

      <div className="text-sm text-text-secondary">
        Step {currentIndex + 1} of {visibleSteps.length}: {current.label}
      </div>

      {/* Step content */}
      <div>{current.component}</div>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <Button
          variant="ghost"
          onClick={() => setCurrentIndex((i) => i - 1)}
          disabled={currentIndex === 0}
        >
          Back
        </Button>
        <Button
          onClick={() => {
            if (isLast) {
              onComplete();
            } else {
              setCurrentIndex((i) => i + 1);
            }
          }}
        >
          {isLast ? "Complete Setup" : "Next"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create wizard steps (profile, targets, salary, skills, completion)**

Create each step component. They are all client components that accept current data as props and call server actions on change. Here is each file:

**step-profile.tsx:**
```tsx
// dashboard/components/onboarding/step-profile.tsx
"use client";

import { Card, CardContent } from "@/components/ui/card";
import type { Profile } from "@shared/schemas/career-schema.js";

interface StepProfileProps {
  profile: Profile;
}

export function StepProfile({ profile }: StepProfileProps) {
  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <h2 className="text-xl font-semibold">Confirm your profile</h2>
        <p className="text-sm text-text-secondary">
          Claude extracted this from your resume. Does it look right?
        </p>
        <div className="space-y-3">
          {[
            { label: "Name", value: profile.name },
            { label: "Summary", value: profile.summary },
            { label: "Location", value: profile.location ?? "Not set" },
            { label: "Email", value: profile.email ?? "Not set" },
            { label: "LinkedIn", value: profile.linkedIn ?? "Not set" },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between items-start p-3 rounded-card bg-bg-elevated">
              <span className="text-sm text-text-secondary">{label}</span>
              <span className="text-sm text-right max-w-xs">{value}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-text-muted">
          To fix anything, ask Claude: &quot;Update my profile summary to...&quot;
        </p>
      </CardContent>
    </Card>
  );
}
```

**step-targets.tsx:**
```tsx
// dashboard/components/onboarding/step-targets.tsx
"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { saveTargets } from "@/app/onboarding/actions";

const COMMON_ROLES = [
  "Software Engineer", "Product Manager", "Program Manager", "Data Scientist",
  "Engineering Manager", "Designer", "DevOps Engineer", "Chief of Staff",
  "Director of Operations", "Head of Customer Success", "Solutions Architect",
];

const COMMON_INDUSTRIES = [
  "SaaS", "Healthcare", "Fintech", "E-commerce", "Logistics",
  "Education", "AI/ML", "Cybersecurity", "Media", "Enterprise",
];

const COMPANY_SIZES = [
  "Seed/Pre-seed", "Series A", "Series B", "Series C+",
  "Mid-market (200-2000)", "Enterprise (2000+)", "Public",
];

interface StepTargetsProps {
  currentRoles: string[];
  currentIndustries: string[];
  currentSizes: string[];
}

export function StepTargets({ currentRoles, currentIndustries, currentSizes }: StepTargetsProps) {
  const [roles, setRoles] = useState<string[]>(currentRoles);
  const [industries, setIndustries] = useState<string[]>(currentIndustries);
  const [sizes, setSizes] = useState<string[]>(currentSizes);
  const [customRole, setCustomRole] = useState("");

  const addCustomRole = () => {
    if (customRole.trim() && !roles.includes(customRole.trim())) {
      setRoles([...roles, customRole.trim()]);
      setCustomRole("");
    }
  };

  // Auto-save on any change
  const save = async (r: string[], i: string[], s: string[]) => {
    await saveTargets({ targetRoles: r, targetIndustries: i, targetCompanySize: s });
  };

  const toggleRole = (role: string) => {
    const next = roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role];
    setRoles(next);
    save(next, industries, sizes);
  };

  const toggleIndustry = (ind: string) => {
    const next = industries.includes(ind) ? industries.filter((i) => i !== ind) : [...industries, ind];
    setIndustries(next);
    save(roles, next, sizes);
  };

  const toggleSize = (size: string) => {
    const next = sizes.includes(size) ? sizes.filter((s) => s !== size) : [...sizes, size];
    setSizes(next);
    save(roles, industries, next);
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Target Roles</h3>
          <div className="flex flex-wrap gap-2">
            {COMMON_ROLES.map((role) => (
              <Badge
                key={role}
                variant={roles.includes(role) ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => toggleRole(role)}
              >
                {role}
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={customRole}
              onChange={(e) => setCustomRole(e.target.value)}
              placeholder="Add custom role..."
              onKeyDown={(e) => e.key === "Enter" && addCustomRole()}
              className="max-w-xs"
            />
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Target Industries</h3>
          <div className="flex flex-wrap gap-2">
            {COMMON_INDUSTRIES.map((ind) => (
              <Badge
                key={ind}
                variant={industries.includes(ind) ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => toggleIndustry(ind)}
              >
                {ind}
              </Badge>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Company Size</h3>
          <div className="flex flex-wrap gap-2">
            {COMPANY_SIZES.map((size) => (
              <Badge
                key={size}
                variant={sizes.includes(size) ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => toggleSize(size)}
              >
                {size}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

**step-salary.tsx:**
```tsx
// dashboard/components/onboarding/step-salary.tsx
"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveSalaryPrefs } from "@/app/onboarding/actions";

interface StepSalaryProps {
  currentMin?: number;
  currentMax?: number;
  currentCurrency: string;
  currentRemote: boolean;
  currentRelocation: boolean;
  currentNotice?: string;
}

export function StepSalary({
  currentMin, currentMax, currentCurrency, currentRemote, currentRelocation, currentNotice,
}: StepSalaryProps) {
  const [min, setMin] = useState(currentMin ?? 0);
  const [max, setMax] = useState(currentMax ?? 0);
  const [currency] = useState(currentCurrency);
  const [remote, setRemote] = useState(currentRemote);
  const [relocation, setRelocation] = useState(currentRelocation);
  const [notice, setNotice] = useState(currentNotice ?? "");

  const save = () => {
    saveSalaryPrefs({
      salaryMin: min || undefined,
      salaryMax: max || undefined,
      salaryCurrency: currency,
      openToRemote: remote,
      openToRelocation: relocation,
      noticePeriod: notice || undefined,
    });
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        <h2 className="text-xl font-semibold">Salary & Preferences</h2>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Minimum ({currency})</Label>
            <Input
              type="number"
              value={min || ""}
              onChange={(e) => { setMin(Number(e.target.value)); }}
              onBlur={save}
              placeholder="140000"
            />
          </div>
          <div className="space-y-2">
            <Label>Maximum ({currency})</Label>
            <Input
              type="number"
              value={max || ""}
              onChange={(e) => { setMax(Number(e.target.value)); }}
              onBlur={save}
              placeholder="180000"
            />
          </div>
        </div>

        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={remote} onChange={(e) => { setRemote(e.target.checked); save(); }} className="accent-accent" />
            <span>Open to remote work</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={relocation} onChange={(e) => { setRelocation(e.target.checked); save(); }} className="accent-accent" />
            <span>Open to relocation</span>
          </label>
        </div>

        <div className="space-y-2">
          <Label>Notice period</Label>
          <Input
            value={notice}
            onChange={(e) => setNotice(e.target.value)}
            onBlur={save}
            placeholder="2 weeks"
          />
        </div>
      </CardContent>
    </Card>
  );
}
```

**step-skills.tsx:**
```tsx
// dashboard/components/onboarding/step-skills.tsx
"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { saveSkills } from "@/app/onboarding/actions";
import type { Skill } from "@shared/schemas/career-schema.js";

interface StepSkillsProps {
  currentSkills: Skill[];
}

export function StepSkills({ currentSkills }: StepSkillsProps) {
  const [skills, setSkills] = useState<Skill[]>(currentSkills);

  const grouped = skills.reduce((acc, skill) => {
    const cat = skill.category || "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(skill);
    return acc;
  }, {} as Record<string, Skill[]>);

  const setProficiency = (name: string, proficiency: number) => {
    const updated = skills.map((s) =>
      s.name === name ? { ...s, proficiency } : s
    );
    setSkills(updated);
    saveSkills(updated);
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        <h2 className="text-xl font-semibold">Review your skills</h2>
        <p className="text-sm text-text-secondary">
          Rate your proficiency for each skill. This helps tailor resumes and identify gaps.
        </p>

        {Object.entries(grouped).map(([category, catSkills]) => (
          <div key={category} className="space-y-3">
            <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
              {category}
            </h3>
            {catSkills.map((skill) => (
              <div
                key={skill.name}
                className="flex items-center justify-between p-3 rounded-card bg-bg-elevated"
              >
                <div>
                  <span className="text-sm">{skill.name}</span>
                  {skill.lastUsed && (
                    <span className="ml-2 text-xs font-mono text-text-muted">
                      {skill.lastUsed === "current" ? "current" : `last: ${skill.lastUsed}`}
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <button
                      key={level}
                      onClick={() => setProficiency(skill.name, level)}
                      className={`w-5 h-5 rounded-full border transition-colors duration-150 ${
                        (skill.proficiency ?? 0) >= level
                          ? "bg-accent border-accent"
                          : "border-border hover:border-accent/50"
                      }`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

**step-completion.tsx:**
```tsx
// dashboard/components/onboarding/step-completion.tsx
"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CompletenessRing } from "@/components/layout/completeness-ring";
import { useRouter } from "next/navigation";

interface StepCompletionProps {
  score: number;
}

export function StepCompletion({ score }: StepCompletionProps) {
  const router = useRouter();

  return (
    <Card>
      <CardContent className="p-8 space-y-6 text-center">
        <CompletenessRing score={score} size={80} />
        <h2 className="text-2xl font-semibold">Your Career KB is ready</h2>
        <p className="text-text-secondary max-w-md mx-auto">
          You can always enrich it later by pasting performance reviews, recommendations, or project summaries into Claude.
        </p>
        <div className="flex flex-col gap-3 max-w-xs mx-auto pt-4">
          <Button onClick={() => router.push("/pipeline")} className="w-full">
            Go to Pipeline
          </Button>
          <Button variant="ghost" onClick={() => router.push("/career")} className="w-full">
            View Career KB
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Create onboarding page that ties it all together**

```tsx
// dashboard/app/onboarding/page.tsx
import { loadCareerData, hasProfileData } from "@/lib/data";
import { calculateCompleteness } from "@/lib/completeness";
import { OnboardingClient } from "./client";

export default async function OnboardingPage() {
  const hasData = hasProfileData();
  const career = hasData ? await loadCareerData() : null;
  const score = career ? calculateCompleteness(career) : 0;

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] p-8">
      <OnboardingClient
        hasData={hasData}
        career={career ? JSON.parse(JSON.stringify(career)) : null}
        completenessScore={score}
      />
    </div>
  );
}
```

Create the client wrapper:

```tsx
// dashboard/app/onboarding/client.tsx
"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PhaseOne } from "@/components/onboarding/phase-one";
import { WizardShell } from "@/components/onboarding/wizard-shell";
import { StepProfile } from "@/components/onboarding/step-profile";
import { StepTargets } from "@/components/onboarding/step-targets";
import { StepSalary } from "@/components/onboarding/step-salary";
import { StepSkills } from "@/components/onboarding/step-skills";
import { StepCompletion } from "@/components/onboarding/step-completion";
import type { CareerData } from "@shared/schemas/career-schema.js";

interface OnboardingClientProps {
  hasData: boolean;
  career: CareerData | null;
  completenessScore: number;
}

export function OnboardingClient({ hasData, career, completenessScore }: OnboardingClientProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<1 | 2>(hasData ? 2 : 1);

  const handleDataDetected = useCallback(() => {
    setPhase(2);
    router.refresh();
  }, [router]);

  const handleComplete = useCallback(() => {
    router.push("/pipeline");
  }, [router]);

  if (phase === 1) {
    return <PhaseOne onDataDetected={handleDataDetected} />;
  }

  if (!career) return null;

  const profile = career.profile;
  const skills = career.skills;

  const steps = [
    {
      id: "profile",
      label: "Confirm Profile",
      component: <StepProfile profile={profile} />,
      hasGap: true, // always show
    },
    {
      id: "targets",
      label: "Target Roles & Industries",
      component: (
        <StepTargets
          currentRoles={profile.targetRoles}
          currentIndustries={profile.targetIndustries}
          currentSizes={profile.targetCompanySize}
        />
      ),
      hasGap: profile.targetRoles.length === 0,
    },
    {
      id: "salary",
      label: "Salary & Preferences",
      component: (
        <StepSalary
          currentMin={profile.salaryMin}
          currentMax={profile.salaryMax}
          currentCurrency={profile.salaryCurrency}
          currentRemote={profile.openToRemote}
          currentRelocation={profile.openToRelocation}
          currentNotice={profile.noticePeriod}
        />
      ),
      hasGap: profile.salaryMin === undefined || profile.salaryMax === undefined,
    },
    {
      id: "skills",
      label: "Review Skills",
      component: <StepSkills currentSkills={skills} />,
      hasGap: skills.filter((s) => s.proficiency !== undefined).length < 3,
    },
    {
      id: "completion",
      label: "Setup Complete",
      component: <StepCompletion score={completenessScore} />,
      hasGap: true, // always show
    },
  ];

  return <WizardShell steps={steps} onComplete={handleComplete} />;
}
```

- [ ] **Step 6: Verify onboarding flow**

Test Phase 1 (empty data):
```bash
CAREER_DATA_PATH=/tmp/test-career-empty cd dashboard && npx next dev --turbopack
```
Expected: "Let's build your Career KB" screen with instructions and copy button.

Test Phase 2 (with example data):
```bash
CAREER_DATA_PATH=./data/example cd dashboard && npx next dev --turbopack
```
Navigate to `/onboarding`. Expected: Wizard with profile check, then steps with gaps filled/skipped.

- [ ] **Step 7: Commit**

```bash
git add dashboard/
git commit -m "feat: add onboarding flow — Phase 1 Claude instructions + Phase 2 gap-filling wizard"
```

---

## Task 6: Pipeline Kanban Board

**Files:**
- Create: `dashboard/app/pipeline/page.tsx`
- Create: `dashboard/components/pipeline/kanban-board.tsx`
- Create: `dashboard/components/pipeline/kanban-column.tsx`
- Create: `dashboard/components/pipeline/application-card.tsx`
- Create: `dashboard/components/pipeline/filter-bar.tsx`
- Create: `dashboard/components/pipeline/closed-section.tsx`

- [ ] **Step 1: Create application card component**

```tsx
// dashboard/components/pipeline/application-card.tsx
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PRIORITY_COLORS, daysSince } from "@/lib/theme";
import type { Application } from "@shared/schemas/career-schema.js";

interface ApplicationCardProps {
  app: Application;
}

export function ApplicationCard({ app }: ApplicationCardProps) {
  const daysInStage = daysSince(app.dateUpdated);
  const isOverdue = app.followUpDue && new Date(app.followUpDue) < new Date();

  return (
    <Link href={`/pipeline/${app.id}`}>
      <Card className="hover:bg-bg-elevated transition-colors duration-150 cursor-pointer">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-sm">{app.company}</h3>
              <p className="text-xs text-text-secondary">{app.role}</p>
            </div>
            <span
              className="w-2.5 h-2.5 rounded-full mt-1 shrink-0"
              style={{ backgroundColor: PRIORITY_COLORS[app.priority] }}
              title={`${app.priority} priority`}
            />
          </div>

          {/* Excitement bar */}
          {app.excitement && (
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${(app.excitement / 10) * 100}%` }}
                />
              </div>
              <span className="text-xs font-mono text-text-muted">{app.excitement}</span>
            </div>
          )}

          <div className="flex items-center justify-between text-xs">
            <span className="font-mono text-text-muted">{daysInStage}d</span>
            {app.source && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {app.source}
              </Badge>
            )}
          </div>

          {isOverdue && (
            <div className="text-xs text-accent font-medium">
              Follow-up overdue
            </div>
          )}

          {app.contacts.length > 0 && (
            <div className="flex items-center gap-1">
              <div className="w-5 h-5 rounded-full bg-bg-elevated border border-border flex items-center justify-center">
                <span className="text-[10px] font-mono text-text-muted">{app.contacts.length}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
```

- [ ] **Step 2: Create kanban column**

```tsx
// dashboard/components/pipeline/kanban-column.tsx
import { ApplicationCard } from "./application-card";
import type { Application } from "@shared/schemas/career-schema.js";

interface KanbanColumnProps {
  label: string;
  applications: Application[];
  color: string;
}

export function KanbanColumn({ label, applications, color }: KanbanColumnProps) {
  return (
    <div className="flex flex-col w-72 shrink-0">
      <div className="flex items-center gap-2 px-3 py-2 mb-3">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <h2 className="text-sm font-semibold">{label}</h2>
        <span className="text-xs font-mono text-text-muted">{applications.length}</span>
      </div>
      <div className="flex flex-col gap-2 flex-1">
        {applications.map((app) => (
          <ApplicationCard key={app.id} app={app} />
        ))}
        {applications.length === 0 && (
          <div className="text-xs text-text-muted text-center py-8 border border-dashed border-border rounded-card">
            No applications
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create filter bar**

```tsx
// dashboard/components/pipeline/filter-bar.tsx
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FilterBarProps {
  onSearchChange: (query: string) => void;
  onSortChange: (sort: string) => void;
  onPriorityFilter: (priority: string | null) => void;
}

export function FilterBar({ onSearchChange, onSortChange, onPriorityFilter }: FilterBarProps) {
  return (
    <div className="flex items-center gap-3 pb-4">
      <Input
        placeholder="Search company or role..."
        onChange={(e) => onSearchChange(e.target.value)}
        className="max-w-xs"
      />
      <Select defaultValue="date" onValueChange={onSortChange}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Sort by" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="date">Date updated</SelectItem>
          <SelectItem value="excitement">Excitement</SelectItem>
          <SelectItem value="priority">Priority</SelectItem>
          <SelectItem value="company">Company</SelectItem>
        </SelectContent>
      </Select>
      <Select defaultValue="all" onValueChange={(v) => onPriorityFilter(v === "all" ? null : v)}>
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Priority" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All priorities</SelectItem>
          <SelectItem value="high">High</SelectItem>
          <SelectItem value="medium">Medium</SelectItem>
          <SelectItem value="low">Low</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
```

- [ ] **Step 4: Create closed section**

```tsx
// dashboard/components/pipeline/closed-section.tsx
"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { STATUS_COLORS } from "@/lib/theme";
import Link from "next/link";
import type { Application } from "@shared/schemas/career-schema.js";

interface ClosedSectionProps {
  applications: Application[];
}

export function ClosedSection({ applications }: ClosedSectionProps) {
  const [open, setOpen] = useState(false);

  if (applications.length === 0) return null;

  return (
    <div className="mt-6 border-t border-border pt-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
      >
        <span className={`transition-transform ${open ? "rotate-90" : ""}`}>&#9654;</span>
        Closed ({applications.length})
      </button>
      {open && (
        <div className="mt-3 space-y-1">
          {applications.map((app) => (
            <Link
              key={app.id}
              href={`/pipeline/${app.id}`}
              className="flex items-center justify-between p-2 rounded-card hover:bg-bg-elevated transition-colors"
            >
              <div className="flex items-center gap-3">
                <Badge
                  variant="outline"
                  className="text-[10px]"
                  style={{ borderColor: STATUS_COLORS[app.status], color: STATUS_COLORS[app.status] }}
                >
                  {app.status}
                </Badge>
                <span className="text-sm">{app.company}</span>
                <span className="text-sm text-text-secondary">{app.role}</span>
              </div>
              <span className="text-xs font-mono text-text-muted">{app.dateUpdated.slice(0, 10)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create kanban board (client component orchestrating filter + columns)**

```tsx
// dashboard/components/pipeline/kanban-board.tsx
"use client";

import { useState, useMemo } from "react";
import { KanbanColumn } from "./kanban-column";
import { FilterBar } from "./filter-bar";
import { ClosedSection } from "./closed-section";
import { KANBAN_COLUMNS, CLOSED_STATUSES, STATUS_COLORS } from "@/lib/theme";
import type { Application } from "@shared/schemas/career-schema.js";

interface KanbanBoardProps {
  applications: Application[];
}

export function KanbanBoard({ applications }: KanbanBoardProps) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("date");
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let apps = [...applications];
    if (search) {
      const q = search.toLowerCase();
      apps = apps.filter(
        (a) => a.company.toLowerCase().includes(q) || a.role.toLowerCase().includes(q)
      );
    }
    if (priorityFilter) {
      apps = apps.filter((a) => a.priority === priorityFilter);
    }
    apps.sort((a, b) => {
      if (sort === "date") return b.dateUpdated.localeCompare(a.dateUpdated);
      if (sort === "company") return a.company.localeCompare(b.company);
      if (sort === "excitement") return (b.excitement ?? 0) - (a.excitement ?? 0);
      if (sort === "priority") {
        const p = { high: 0, medium: 1, low: 2 };
        return (p[a.priority as keyof typeof p] ?? 1) - (p[b.priority as keyof typeof p] ?? 1);
      }
      return 0;
    });
    return apps;
  }, [applications, search, sort, priorityFilter]);

  const active = filtered.filter(
    (a) => !(CLOSED_STATUSES as readonly string[]).includes(a.status)
  );
  const closed = filtered.filter(
    (a) => (CLOSED_STATUSES as readonly string[]).includes(a.status)
  );

  const getColumnApps = (key: string): Application[] => {
    if (key === "offer_negotiating") {
      return active.filter((a) => a.status === "offer" || a.status === "negotiating");
    }
    return active.filter((a) => a.status === key);
  };

  if (applications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <h2 className="text-xl font-semibold mb-2">No applications yet</h2>
        <p className="text-text-secondary max-w-md">
          Open Claude and use <code className="font-mono text-accent">manage_pipeline</code> to add your first one,
          or paste a job posting and use <code className="font-mono text-accent">explore_opportunity</code>.
        </p>
      </div>
    );
  }

  return (
    <div>
      <FilterBar
        onSearchChange={setSearch}
        onSortChange={setSort}
        onPriorityFilter={setPriorityFilter}
      />
      <div className="flex gap-4 overflow-x-auto pb-4">
        {KANBAN_COLUMNS.map((col) => (
          <KanbanColumn
            key={col.key}
            label={col.label}
            applications={getColumnApps(col.key)}
            color={
              col.key === "offer_negotiating"
                ? STATUS_COLORS.offer
                : STATUS_COLORS[col.key] ?? "#666"
            }
          />
        ))}
      </div>
      <ClosedSection applications={closed} />
    </div>
  );
}
```

- [ ] **Step 6: Create pipeline page (server component)**

```tsx
// dashboard/app/pipeline/page.tsx
import { loadPipeline } from "@/lib/data";
import { KanbanBoard } from "@/components/pipeline/kanban-board";

export default async function PipelinePage() {
  const pipeline = await loadPipeline();

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-6">Pipeline</h1>
      <KanbanBoard applications={pipeline.applications} />
    </div>
  );
}
```

- [ ] **Step 7: Verify kanban renders with example data**

```bash
CAREER_DATA_PATH=./data/example cd dashboard && npx next dev --turbopack
```

Navigate to `/pipeline`. Expected: Kanban board with 3 example applications across columns. Veridian Health in "Interviewing", Meridian in "Applied", Novare in "Closed" section.

- [ ] **Step 8: Commit**

```bash
git add dashboard/
git commit -m "feat: add pipeline kanban board with filters and closed section"
```

---

## Task 7: Application Detail View

**Files:**
- Create: `dashboard/app/pipeline/[id]/page.tsx`
- Create: `dashboard/components/pipeline/application-header.tsx`
- Create: `dashboard/components/pipeline/application-timeline.tsx`
- Create: `dashboard/components/pipeline/contacts-panel.tsx`
- Create: `dashboard/components/pipeline/notes-log.tsx`
- Create: `dashboard/components/pipeline/metadata-sidebar.tsx`

- [ ] **Step 1: Create header, timeline, contacts, notes, and sidebar components**

**application-header.tsx:**
```tsx
// dashboard/components/pipeline/application-header.tsx
import { Badge } from "@/components/ui/badge";
import { STATUS_COLORS, PRIORITY_COLORS, daysSince } from "@/lib/theme";
import type { Application } from "@shared/schemas/career-schema.js";

export function ApplicationHeader({ app }: { app: Application }) {
  const daysActive = app.dateApplied ? daysSince(app.dateApplied) : 0;
  const isOverdue = app.followUpDue && new Date(app.followUpDue) < new Date();

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{app.company}</h1>
          <p className="text-lg text-text-secondary">{app.role}</p>
        </div>
        <Badge
          className="text-sm px-3 py-1"
          style={{ backgroundColor: STATUS_COLORS[app.status], color: "#fff" }}
        >
          {app.status}
        </Badge>
      </div>

      <div className="flex items-center gap-4 text-sm">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PRIORITY_COLORS[app.priority] }} />
          {app.priority} priority
        </span>
        {app.excitement && <span>Excitement: {app.excitement}/10</span>}
        {app.salaryRange && (
          <span className="font-mono text-text-secondary">
            ${app.salaryRange.min?.toLocaleString()}–${app.salaryRange.max?.toLocaleString()}
          </span>
        )}
      </div>

      <div className="flex gap-6 text-xs text-text-muted font-mono border-t border-border pt-3">
        <span>{daysActive}d since applied</span>
        <span>{app.interviewRounds.length} interview rounds</span>
        {isOverdue && <span className="text-accent">Follow-up overdue</span>}
      </div>
    </div>
  );
}
```

**application-timeline.tsx:**
```tsx
// dashboard/components/pipeline/application-timeline.tsx
import type { Application } from "@shared/schemas/career-schema.js";
import { STATUS_COLORS } from "@/lib/theme";

export function ApplicationTimeline({ app }: { app: Application }) {
  const events: { date: string; label: string; detail?: string; color: string }[] = [];

  if (app.dateDiscovered) {
    events.push({ date: app.dateDiscovered, label: "Discovered", color: STATUS_COLORS.discovered });
  }
  if (app.dateApplied) {
    events.push({ date: app.dateApplied, label: "Applied", color: STATUS_COLORS.applied });
  }
  for (const round of app.interviewRounds) {
    events.push({
      date: round.date ?? "TBD",
      label: `Interview: ${round.type.replace("_", " ")}`,
      detail: [
        round.interviewers.length > 0 ? `With: ${round.interviewers.join(", ")}` : null,
        round.outcome,
        round.notes,
      ].filter(Boolean).join(" — "),
      color: STATUS_COLORS.interviewing,
    });
  }
  // Current status node
  events.push({
    date: app.dateUpdated.slice(0, 10),
    label: `Status: ${app.status}`,
    color: STATUS_COLORS[app.status] ?? "#666",
  });

  return (
    <div className="space-y-0">
      {events.map((event, i) => (
        <div key={i} className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className="w-3 h-3 rounded-full border-2" style={{ borderColor: event.color }} />
            {i < events.length - 1 && <div className="w-px flex-1 bg-border" />}
          </div>
          <div className="pb-6">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-text-muted">{event.date}</span>
              <span className="text-sm font-medium">{event.label}</span>
            </div>
            {event.detail && (
              <p className="text-xs text-text-secondary mt-1">{event.detail}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

**contacts-panel.tsx:**
```tsx
// dashboard/components/pipeline/contacts-panel.tsx
import { Card, CardContent } from "@/components/ui/card";
import type { Contact } from "@shared/schemas/career-schema.js";

export function ContactsPanel({ contacts }: { contacts: Contact[] }) {
  if (contacts.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Contacts</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {contacts.map((c, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <p className="font-medium text-sm">{c.name}</p>
              {c.title && <p className="text-xs text-text-secondary">{c.title}</p>}
              {c.email && <p className="text-xs font-mono text-text-muted mt-1">{c.email}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

**notes-log.tsx:**
```tsx
// dashboard/components/pipeline/notes-log.tsx
export function NotesLog({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Notes</h3>
      <div className="space-y-2">
        {[...notes].reverse().map((note, i) => {
          const dateMatch = note.match(/^\[(\d{4}-\d{2}-\d{2})\]\s*/);
          const date = dateMatch ? dateMatch[1] : null;
          const text = dateMatch ? note.slice(dateMatch[0].length) : note;
          return (
            <div key={i} className="flex gap-3 py-2 border-b border-border last:border-0">
              {date && <span className="text-xs font-mono text-text-muted shrink-0">{date}</span>}
              <p className="text-sm text-text-secondary">{text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

**metadata-sidebar.tsx:**
```tsx
// dashboard/components/pipeline/metadata-sidebar.tsx
import { Badge } from "@/components/ui/badge";
import type { Application } from "@shared/schemas/career-schema.js";

export function MetadataSidebar({ app }: { app: Application }) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Details</h3>

      <div className="space-y-3 text-sm">
        {app.source && (
          <div className="flex justify-between">
            <span className="text-text-muted">Source</span>
            <span>{app.source}</span>
          </div>
        )}
        {app.referral && (
          <div className="flex justify-between">
            <span className="text-text-muted">Referral</span>
            <span>{app.referral}</span>
          </div>
        )}
        {app.postingUrl && (
          <div className="flex justify-between">
            <span className="text-text-muted">Posting</span>
            <a href={app.postingUrl} target="_blank" rel="noopener" className="text-accent hover:underline truncate max-w-[200px]">
              View posting
            </a>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-text-muted">Remote</span>
          <Badge variant="outline" className="text-xs">{app.remote}</Badge>
        </div>
        {app.location && (
          <div className="flex justify-between">
            <span className="text-text-muted">Location</span>
            <span>{app.location}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-text-muted">Cover letter</span>
          <span>{app.coverLetterGenerated ? "Yes" : "No"}</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create application detail page**

```tsx
// dashboard/app/pipeline/[id]/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { loadPipeline } from "@/lib/data";
import { ApplicationHeader } from "@/components/pipeline/application-header";
import { ApplicationTimeline } from "@/components/pipeline/application-timeline";
import { ContactsPanel } from "@/components/pipeline/contacts-panel";
import { NotesLog } from "@/components/pipeline/notes-log";
import { MetadataSidebar } from "@/components/pipeline/metadata-sidebar";

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const pipeline = await loadPipeline();
  const app = pipeline.applications.find((a) => a.id === id);

  if (!app) notFound();

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link href="/pipeline" className="text-sm text-text-muted hover:text-text-primary mb-4 inline-block">
        &larr; Back to Pipeline
      </Link>

      <ApplicationHeader app={app} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
        <div className="lg:col-span-2 space-y-8">
          <ApplicationTimeline app={app} />
          <ContactsPanel contacts={app.contacts} />
          <NotesLog notes={app.notes} />
        </div>
        <div>
          <MetadataSidebar app={app} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify detail page**

```bash
CAREER_DATA_PATH=./data/example cd dashboard && npx next dev --turbopack
```

Navigate to `/pipeline`, click the Veridian Health card. Expected: detail page with header, timeline (discovered → applied → phone screen → panel), contacts (Rachel Torres, David Kim), notes log, and sidebar metadata.

- [ ] **Step 4: Commit**

```bash
git add dashboard/
git commit -m "feat: add application detail view with timeline, contacts, notes, and metadata"
```

---

## Task 8: Career KB Overview

**Files:**
- Create: `dashboard/app/career/page.tsx`
- Create: `dashboard/components/career/profile-header.tsx`
- Create: `dashboard/components/career/skills-radar.tsx`
- Create: `dashboard/components/career/skills-list.tsx`
- Create: `dashboard/components/career/experience-timeline.tsx`
- Create: `dashboard/components/career/testimonials.tsx`
- Create: `dashboard/components/career/education-list.tsx`

- [ ] **Step 1: Create profile header**

```tsx
// dashboard/components/career/profile-header.tsx
import { Badge } from "@/components/ui/badge";
import { CompletenessRing } from "@/components/layout/completeness-ring";
import type { Profile } from "@shared/schemas/career-schema.js";

export function ProfileHeader({ profile, completeness }: { profile: Profile; completeness: number }) {
  return (
    <div className="space-y-4 pb-8 border-b border-border">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold">{profile.name}</h1>
          <p className="text-text-secondary mt-1 max-w-2xl">{profile.summary}</p>
        </div>
        <CompletenessRing score={completeness} size={56} />
      </div>

      <div className="flex items-center gap-4 text-sm text-text-secondary">
        {profile.location && <span>{profile.location}</span>}
        {profile.linkedIn && (
          <a href={`https://${profile.linkedIn}`} target="_blank" rel="noopener" className="text-accent hover:underline">
            LinkedIn
          </a>
        )}
        {profile.portfolio && (
          <a href={`https://${profile.portfolio}`} target="_blank" rel="noopener" className="text-accent hover:underline">
            Portfolio
          </a>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {profile.targetRoles.map((role) => (
          <Badge key={role}>{role}</Badge>
        ))}
        {profile.targetIndustries.map((ind) => (
          <Badge key={ind} variant="outline">{ind}</Badge>
        ))}
      </div>

      <div className="flex items-center gap-4 text-sm text-text-muted">
        {profile.salaryMin && profile.salaryMax && (
          <span className="font-mono">
            ${profile.salaryMin.toLocaleString()}–${profile.salaryMax.toLocaleString()} {profile.salaryCurrency}
          </span>
        )}
        {profile.openToRemote && <Badge variant="secondary">Remote</Badge>}
        {profile.openToRelocation && <Badge variant="secondary">Open to relocation</Badge>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create skills radar chart (client component)**

```tsx
// dashboard/components/career/skills-radar.tsx
"use client";

import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";
import type { Skill } from "@shared/schemas/career-schema.js";

interface SkillsRadarProps {
  skills: Skill[];
}

export function SkillsRadar({ skills }: SkillsRadarProps) {
  const categories = ["Leadership", "Operations", "Domain", "Technical"];
  const data = categories.map((cat) => {
    const catSkills = skills.filter((s) => s.category === cat);
    const avg = catSkills.length > 0
      ? catSkills.reduce((sum, s) => sum + (s.proficiency ?? 0), 0) / catSkills.length
      : 0;
    return { category: cat, proficiency: Math.round(avg * 10) / 10 };
  });

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
          <PolarGrid stroke="#333333" />
          <PolarAngleAxis dataKey="category" tick={{ fill: "#999999", fontSize: 12 }} />
          <PolarRadiusAxis domain={[0, 5]} tick={{ fill: "#666666", fontSize: 10 }} />
          <Radar
            dataKey="proficiency"
            stroke="#D97706"
            fill="#D97706"
            fillOpacity={0.2}
            strokeWidth={2}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 3: Create skills list, experience timeline, testimonials, education list**

**skills-list.tsx:**
```tsx
// dashboard/components/career/skills-list.tsx
import type { Skill } from "@shared/schemas/career-schema.js";

export function SkillsList({ skills }: { skills: Skill[] }) {
  const grouped = skills.reduce((acc, s) => {
    const cat = s.category || "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {} as Record<string, Skill[]>);

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([category, catSkills]) => (
        <div key={category}>
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">{category}</h3>
          <div className="space-y-2">
            {catSkills.map((skill) => {
              const isCurrent = skill.lastUsed === "current";
              return (
                <div
                  key={skill.name}
                  className={`flex items-center justify-between p-3 rounded-card bg-bg-surface ${
                    !isCurrent && skill.lastUsed ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm">{skill.name}</span>
                    {skill.yearsUsed && (
                      <span className="text-xs font-mono text-text-muted">{skill.yearsUsed}y</span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <div
                        key={level}
                        className={`w-3 h-3 rounded-full ${
                          (skill.proficiency ?? 0) >= level ? "bg-accent" : "bg-border"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
```

**experience-timeline.tsx:**
```tsx
// dashboard/components/career/experience-timeline.tsx
"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Experience } from "@shared/schemas/career-schema.js";

export function ExperienceTimeline({ experience }: { experience: Experience[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {experience.map((role, i) => {
        const key = `${role.company}-${role.startDate}`;
        const isOpen = expanded === key;

        return (
          <div key={key} className="flex gap-4">
            <div className="flex flex-col items-center pt-1">
              <div className="w-3 h-3 rounded-full bg-accent" />
              {i < experience.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
            </div>
            <Card className="flex-1 cursor-pointer" onClick={() => setExpanded(isOpen ? null : key)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{role.role}</h3>
                    <p className="text-sm text-text-secondary">{role.company}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-mono text-text-muted">
                      {role.startDate} — {role.endDate}
                    </span>
                    {role.industry && (
                      <Badge variant="outline" className="ml-2 text-[10px]">{role.industry}</Badge>
                    )}
                  </div>
                </div>
                {isOpen && role.achievements.length > 0 && (
                  <div className="mt-4 space-y-3 border-t border-border pt-3">
                    {role.achievements.map((ach, j) => (
                      <div key={j} className="space-y-1">
                        <p className="text-sm font-medium">{ach.metric}</p>
                        <p className="text-xs text-text-secondary">{ach.context}</p>
                        <p className="text-xs text-text-muted">{ach.impact}</p>
                        <div className="flex gap-1 flex-wrap">
                          {ach.keywords.map((kw) => (
                            <span key={kw} className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted">
                              {kw}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );
      })}
    </div>
  );
}
```

**testimonials.tsx:**
```tsx
// dashboard/components/career/testimonials.tsx
import { Card, CardContent } from "@/components/ui/card";
import type { Testimonial } from "@shared/schemas/career-schema.js";

export function Testimonials({ testimonials }: { testimonials: Testimonial[] }) {
  if (testimonials.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {testimonials.map((t, i) => (
        <Card key={i} className="bg-accent-muted border-accent/20">
          <CardContent className="p-5">
            <blockquote className="text-sm italic mb-3">&ldquo;{t.quote}&rdquo;</blockquote>
            <div className="text-xs text-text-secondary">
              <span className="font-medium">{t.source}</span>
              <span className="text-text-muted"> &middot; {t.relationship}</span>
            </div>
            {t.context && <p className="text-xs text-text-muted mt-1">{t.context}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

**education-list.tsx:**
```tsx
// dashboard/components/career/education-list.tsx
import { Badge } from "@/components/ui/badge";
import type { Education } from "@shared/schemas/career-schema.js";

export function EducationList({ education }: { education: Education[] }) {
  if (education.length === 0) return null;

  return (
    <div className="space-y-3">
      {education.map((edu, i) => (
        <div key={i} className="flex items-start justify-between p-3 rounded-card bg-bg-surface">
          <div>
            <p className="text-sm font-medium">{edu.degree}</p>
            <p className="text-xs text-text-secondary">{edu.institution}</p>
            {edu.honors && <p className="text-xs text-text-muted">{edu.honors}</p>}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-text-muted">{edu.date}</span>
            {edu.certifications.map((cert) => (
              <Badge key={cert} variant="outline" className="text-[10px]">{cert}</Badge>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create career page**

```tsx
// dashboard/app/career/page.tsx
import { loadCareerData } from "@/lib/data";
import { calculateCompleteness } from "@/lib/completeness";
import { ProfileHeader } from "@/components/career/profile-header";
import { SkillsRadar } from "@/components/career/skills-radar";
import { SkillsList } from "@/components/career/skills-list";
import { ExperienceTimeline } from "@/components/career/experience-timeline";
import { Testimonials } from "@/components/career/testimonials";
import { EducationList } from "@/components/career/education-list";
import { Separator } from "@/components/ui/separator";

export default async function CareerPage() {
  const career = await loadCareerData();

  if (!career) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-text-secondary">No career data found. Complete onboarding first.</p>
      </div>
    );
  }

  const completeness = calculateCompleteness(career);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <ProfileHeader profile={career.profile} completeness={completeness} />

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Skills</h2>
        <SkillsRadar skills={career.skills} />
        <SkillsList skills={career.skills} />
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Experience</h2>
        <ExperienceTimeline experience={career.experience} />
      </section>

      {career.testimonials.length > 0 && (
        <>
          <Separator />
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Testimonials</h2>
            <Testimonials testimonials={career.testimonials} />
          </section>
        </>
      )}

      {career.education.length > 0 && (
        <>
          <Separator />
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Education</h2>
            <EducationList education={career.education} />
          </section>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify career page with example data**

```bash
CAREER_DATA_PATH=./data/example cd dashboard && npx next dev --turbopack
```

Navigate to `/career`. Expected: Profile header with Alex Rivera, radar chart, skills list grouped by category, experience timeline with 3 roles (expandable achievements), testimonials.

- [ ] **Step 6: Commit**

```bash
git add dashboard/
git commit -m "feat: add career KB overview with skills radar, experience timeline, testimonials"
```

---

## Task 9: Analytics Dashboard

**Files:**
- Create: `dashboard/lib/analytics.ts`
- Create: `dashboard/lib/analytics.test.ts`
- Create: `dashboard/app/analytics/page.tsx`
- Create: `dashboard/components/analytics/stat-card.tsx`
- Create: `dashboard/components/analytics/stat-cards-row.tsx`
- Create: `dashboard/components/analytics/pipeline-funnel.tsx`
- Create: `dashboard/components/analytics/status-breakdown.tsx`
- Create: `dashboard/components/analytics/applications-over-time.tsx`
- Create: `dashboard/components/analytics/source-effectiveness.tsx`
- Create: `dashboard/components/analytics/excitement-vs-outcome.tsx`

- [ ] **Step 1: Write failing tests for analytics computation**

```typescript
// dashboard/lib/analytics.test.ts
import { describe, it, expect } from "vitest";
import { computeAnalytics } from "./analytics";
import type { Application } from "@shared/schemas/career-schema.js";

const makeApp = (overrides: Partial<Application>): Application => ({
  id: "test",
  company: "TestCo",
  role: "Tester",
  status: "applied",
  dateUpdated: "2026-03-20T00:00:00.000Z",
  contacts: [],
  interviewRounds: [],
  notes: [],
  coverLetterGenerated: false,
  remote: "unknown",
  priority: "medium",
  ...overrides,
});

describe("computeAnalytics", () => {
  it("returns zeros for empty pipeline", () => {
    const result = computeAnalytics([]);
    expect(result.totalApplications).toBe(0);
    expect(result.responseRate).toBe(0);
    expect(result.activeCount).toBe(0);
  });

  it("computes response rate correctly", () => {
    const apps = [
      makeApp({ id: "1", status: "applied" }),
      makeApp({ id: "2", status: "screening" }),
      makeApp({ id: "3", status: "interviewing" }),
      makeApp({ id: "4", status: "rejected" }),
    ];
    const result = computeAnalytics(apps);
    expect(result.totalApplications).toBe(4);
    // 3 out of 4 moved past "applied"
    expect(result.responseRate).toBe(75);
  });

  it("counts active applications correctly", () => {
    const apps = [
      makeApp({ id: "1", status: "applied" }),
      makeApp({ id: "2", status: "rejected" }),
      makeApp({ id: "3", status: "interviewing" }),
      makeApp({ id: "4", status: "ghosted" }),
    ];
    const result = computeAnalytics(apps);
    expect(result.activeCount).toBe(2);
  });

  it("groups by source correctly", () => {
    const apps = [
      makeApp({ id: "1", source: "LinkedIn", status: "screening" }),
      makeApp({ id: "2", source: "LinkedIn", status: "applied" }),
      makeApp({ id: "3", source: "Referral", status: "interviewing" }),
    ];
    const result = computeAnalytics(apps);
    expect(result.sourceStats).toHaveLength(2);
    const linkedin = result.sourceStats.find((s) => s.source === "LinkedIn");
    expect(linkedin?.count).toBe(2);
    expect(linkedin?.responseRate).toBe(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd dashboard && npx vitest run lib/analytics.test.ts
```

Expected: FAIL — `computeAnalytics` not found.

- [ ] **Step 3: Implement analytics computation**

```typescript
// dashboard/lib/analytics.ts
import type { Application, ApplicationStatus } from "@shared/schemas/career-schema.js";

const TERMINAL_STATUSES: ApplicationStatus[] = ["rejected", "withdrawn", "accepted", "ghosted"];
const STAGE_ORDER: ApplicationStatus[] = [
  "discovered", "applied", "screening", "interviewing", "offer", "negotiating", "accepted",
];

export interface SourceStat {
  source: string;
  count: number;
  responseRate: number;
  furthestStage: string;
}

export interface FunnelStage {
  stage: string;
  count: number;
  conversionRate: number | null;
}

export interface AnalyticsResult {
  totalApplications: number;
  responseRate: number;
  avgDaysToResponse: number;
  activeCount: number;
  statusCounts: Record<string, number>;
  funnelStages: FunnelStage[];
  sourceStats: SourceStat[];
  priorityCounts: Record<string, number>;
  excitementOutcome: { excitement: number; stageIndex: number; company: string }[];
}

function stageIndex(status: ApplicationStatus): number {
  const idx = STAGE_ORDER.indexOf(status);
  return idx >= 0 ? idx : 0;
}

export function computeAnalytics(applications: Application[]): AnalyticsResult {
  const total = applications.length;

  // Status counts
  const statusCounts: Record<string, number> = {};
  for (const app of applications) {
    statusCounts[app.status] = (statusCounts[app.status] ?? 0) + 1;
  }

  // Response rate: % that moved past "applied"
  const responded = applications.filter((a) => a.status !== "applied" && a.status !== "discovered").length;
  const responseRate = total > 0 ? Math.round((responded / total) * 100) : 0;

  // Active count
  const activeCount = applications.filter((a) => !TERMINAL_STATUSES.includes(a.status)).length;

  // Avg days to response
  const withResponse = applications.filter(
    (a) => a.dateApplied && a.status !== "applied" && a.status !== "ghosted"
  );
  const avgDaysToResponse = withResponse.length > 0
    ? Math.round(
        withResponse.reduce((sum, a) => {
          const applied = new Date(a.dateApplied!);
          const updated = new Date(a.dateUpdated);
          return sum + (updated.getTime() - applied.getTime()) / (1000 * 60 * 60 * 24);
        }, 0) / withResponse.length
      )
    : 0;

  // Funnel
  const funnelStages: FunnelStage[] = STAGE_ORDER.filter((s) => s !== "negotiating").map((stage, i) => {
    const count = applications.filter((a) => stageIndex(a.status) >= i).length;
    return { stage, count, conversionRate: null };
  });
  for (let i = 1; i < funnelStages.length; i++) {
    const prev = funnelStages[i - 1].count;
    funnelStages[i].conversionRate = prev > 0 ? Math.round((funnelStages[i].count / prev) * 100) : null;
  }

  // Source stats
  const sourceMap = new Map<string, Application[]>();
  for (const app of applications) {
    const src = app.source ?? "Unknown";
    if (!sourceMap.has(src)) sourceMap.set(src, []);
    sourceMap.get(src)!.push(app);
  }
  const sourceStats: SourceStat[] = [...sourceMap.entries()].map(([source, apps]) => {
    const resp = apps.filter((a) => a.status !== "applied" && a.status !== "discovered").length;
    const furthest = apps.reduce((max, a) => Math.max(max, stageIndex(a.status)), 0);
    return {
      source,
      count: apps.length,
      responseRate: apps.length > 0 ? Math.round((resp / apps.length) * 100) : 0,
      furthestStage: STAGE_ORDER[furthest] ?? "discovered",
    };
  });

  // Priority counts
  const priorityCounts: Record<string, number> = { high: 0, medium: 0, low: 0 };
  for (const app of applications.filter((a) => !TERMINAL_STATUSES.includes(a.status))) {
    priorityCounts[app.priority] = (priorityCounts[app.priority] ?? 0) + 1;
  }

  // Excitement vs outcome
  const excitementOutcome = applications
    .filter((a) => a.excitement !== undefined)
    .map((a) => ({
      excitement: a.excitement!,
      stageIndex: stageIndex(a.status),
      company: a.company,
    }));

  return {
    totalApplications: total,
    responseRate,
    avgDaysToResponse,
    activeCount,
    statusCounts,
    funnelStages,
    sourceStats,
    priorityCounts,
    excitementOutcome,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd dashboard && npx vitest run lib/analytics.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 5: Create chart components**

**stat-card.tsx:**
```tsx
// dashboard/components/analytics/stat-card.tsx
import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
  label: string;
  value: string | number;
  detail?: string;
}

export function StatCard({ label, value, detail }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs text-text-muted uppercase tracking-wider">{label}</p>
        <p className="text-3xl font-semibold font-mono mt-1">{value}</p>
        {detail && <p className="text-xs text-text-secondary mt-1">{detail}</p>}
      </CardContent>
    </Card>
  );
}
```

**stat-cards-row.tsx:**
```tsx
// dashboard/components/analytics/stat-cards-row.tsx
import { StatCard } from "./stat-card";
import type { AnalyticsResult } from "@/lib/analytics";

export function StatCardsRow({ data }: { data: AnalyticsResult }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard label="Total Applications" value={data.totalApplications} />
      <StatCard label="Response Rate" value={`${data.responseRate}%`} />
      <StatCard label="Avg Days to Response" value={data.avgDaysToResponse} detail="Excludes ghosted" />
      <StatCard label="Active" value={data.activeCount} detail={`${data.activeCount} in play`} />
    </div>
  );
}
```

**pipeline-funnel.tsx:**
```tsx
// dashboard/components/analytics/pipeline-funnel.tsx
"use client";

import type { FunnelStage } from "@/lib/analytics";
import { STATUS_COLORS } from "@/lib/theme";

export function PipelineFunnel({ stages }: { stages: FunnelStage[] }) {
  const max = Math.max(...stages.map((s) => s.count), 1);

  return (
    <div className="space-y-2">
      {stages.map((stage) => (
        <div key={stage.stage} className="flex items-center gap-3">
          <span className="text-xs w-24 text-right text-text-secondary capitalize">{stage.stage}</span>
          <div className="flex-1 h-8 relative">
            <div
              className="h-full rounded-button transition-all duration-300"
              style={{
                width: `${(stage.count / max) * 100}%`,
                backgroundColor: STATUS_COLORS[stage.stage] ?? "#666",
                minWidth: stage.count > 0 ? "2rem" : "0",
              }}
            />
          </div>
          <span className="text-sm font-mono w-8">{stage.count}</span>
          {stage.conversionRate !== null && (
            <span className="text-xs text-text-muted w-12">{stage.conversionRate}%</span>
          )}
        </div>
      ))}
    </div>
  );
}
```

**status-breakdown.tsx:**
```tsx
// dashboard/components/analytics/status-breakdown.tsx
"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { STATUS_COLORS } from "@/lib/theme";

export function StatusBreakdown({ statusCounts }: { statusCounts: Record<string, number> }) {
  const data = Object.entries(statusCounts)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => ({
      name: status,
      value: count,
      fill: STATUS_COLORS[status] ?? "#666",
    }));

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={50}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid #333", borderRadius: "6px" }}
            labelStyle={{ color: "#E8E0D5" }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-3 justify-center mt-2">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-1.5 text-xs">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.fill }} />
            <span className="text-text-secondary capitalize">{d.name}</span>
            <span className="font-mono text-text-muted">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**source-effectiveness.tsx:**
```tsx
// dashboard/components/analytics/source-effectiveness.tsx
"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { SourceStat } from "@/lib/analytics";

export function SourceEffectiveness({ sources }: { sources: SourceStat[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={sources}>
          <XAxis dataKey="source" tick={{ fill: "#999", fontSize: 12 }} />
          <YAxis tick={{ fill: "#666", fontSize: 10 }} />
          <Tooltip
            contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid #333", borderRadius: "6px" }}
            labelStyle={{ color: "#E8E0D5" }}
          />
          <Bar dataKey="count" fill="#D97706" name="Applications" radius={[4, 4, 0, 0]} />
          <Bar dataKey="responseRate" fill="#3B82F6" name="Response %" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

**excitement-vs-outcome.tsx:**
```tsx
// dashboard/components/analytics/excitement-vs-outcome.tsx
"use client";

import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface DataPoint {
  excitement: number;
  stageIndex: number;
  company: string;
}

export function ExcitementVsOutcome({ data }: { data: DataPoint[] }) {
  if (data.length < 2) return null;

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart>
          <XAxis dataKey="excitement" name="Excitement" domain={[0, 10]} tick={{ fill: "#666", fontSize: 10 }} />
          <YAxis dataKey="stageIndex" name="Furthest Stage" domain={[0, 6]} tick={{ fill: "#666", fontSize: 10 }} />
          <Tooltip
            contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid #333", borderRadius: "6px" }}
            labelStyle={{ color: "#E8E0D5" }}
          />
          <Scatter data={data} fill="#D97706" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 6: Create analytics page**

```tsx
// dashboard/app/analytics/page.tsx
import { loadPipeline } from "@/lib/data";
import { computeAnalytics } from "@/lib/analytics";
import { StatCardsRow } from "@/components/analytics/stat-cards-row";
import { PipelineFunnel } from "@/components/analytics/pipeline-funnel";
import { StatusBreakdown } from "@/components/analytics/status-breakdown";
import { SourceEffectiveness } from "@/components/analytics/source-effectiveness";
import { ExcitementVsOutcome } from "@/components/analytics/excitement-vs-outcome";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AnalyticsPage() {
  const pipeline = await loadPipeline();
  const data = computeAnalytics(pipeline.applications);

  if (data.totalApplications < 3) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6">
        <h2 className="text-xl font-semibold mb-2">Not enough data yet</h2>
        <p className="text-text-secondary max-w-md">
          Add more applications to unlock analytics. Your data tells a story — we need a few more chapters.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <h1 className="text-2xl font-semibold">Analytics</h1>

      <StatCardsRow data={data} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Pipeline Funnel</CardTitle></CardHeader>
          <CardContent><PipelineFunnel stages={data.funnelStages} /></CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Status Breakdown</CardTitle></CardHeader>
          <CardContent><StatusBreakdown statusCounts={data.statusCounts} /></CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Source Effectiveness</CardTitle></CardHeader>
          <CardContent><SourceEffectiveness sources={data.sourceStats} /></CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Excitement vs. Outcome</CardTitle></CardHeader>
          <CardContent><ExcitementVsOutcome data={data.excitementOutcome} /></CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Verify analytics page**

```bash
CAREER_DATA_PATH=./data/example cd dashboard && npx next dev --turbopack
```

Navigate to `/analytics`. Expected: 4 stat cards at top, then pipeline funnel, status donut, source bars, and excitement scatter (3 applications — just above the threshold).

- [ ] **Step 8: Commit**

```bash
git add dashboard/
git commit -m "feat: add analytics dashboard with funnel, charts, and tested computation"
```

---

## Task 10: CLI Dashboard Subcommand

**Files:**
- Create: `bin/cli.ts`
- Modify: `src/index.ts` (extract to be importable)
- Modify: `package.json`
- Modify: `tsconfig.json`

- [ ] **Step 1: Create CLI entry point**

```typescript
// bin/cli.ts
#!/usr/bin/env node
import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { createServer as createNetServer } from "net";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const args = process.argv.slice(2);
const isDashboard = args[0] === "dashboard";

if (!isDashboard) {
  // Run MCP server on stdio (existing behavior)
  await import("../src/index.js");
} else {
  // Dashboard mode
  const portArg = args.indexOf("--port");
  const requestedPort = portArg >= 0 ? parseInt(args[portArg + 1], 10) : 3141;
  const noOpen = args.includes("--no-open");

  // Resolve data path
  const dataPath = process.env.CAREER_DATA_PATH ?? join(homedir(), ".career-compass");
  if (!existsSync(dataPath)) {
    mkdirSync(join(dataPath, "career"), { recursive: true });
    mkdirSync(join(dataPath, "pipeline"), { recursive: true });
  }

  // Find available port
  const port = await findPort(requestedPort);

  // Resolve standalone server path
  const __dirname = fileURLToPath(new URL(".", import.meta.url));
  const standalonePath = join(__dirname, "..", "dashboard", ".next", "standalone", "dashboard", "server.js");

  if (!existsSync(standalonePath)) {
    console.error("Dashboard not built. Run 'npm run build' first.");
    process.exit(1);
  }

  // Start Next.js standalone server
  const child = spawn("node", [standalonePath], {
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: "localhost",
      CAREER_DATA_PATH: dataPath,
    },
    stdio: ["pipe", "pipe", "inherit"],
  });

  child.stdout?.on("data", (data: Buffer) => {
    const output = data.toString();
    if (output.includes("Ready") || output.includes("started")) {
      console.error(`Dashboard running at http://localhost:${port}`);
      if (!noOpen) {
        openBrowser(`http://localhost:${port}`);
      }
    }
  });

  // Clean shutdown
  const shutdown = () => {
    child.kill("SIGTERM");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function findPort(preferred: number): Promise<number> {
  return new Promise((resolve) => {
    const server = createNetServer();
    server.listen(preferred, () => {
      server.close(() => resolve(preferred));
    });
    server.on("error", () => {
      // Port busy, find random one
      const fallback = createNetServer();
      fallback.listen(0, () => {
        const addr = fallback.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        fallback.close(() => resolve(port));
      });
    });
  });
}

function openBrowser(url: string): void {
  const cmd = process.platform === "win32" ? "start" : process.platform === "darwin" ? "open" : "xdg-open";
  spawn(cmd, [url], { shell: true, stdio: "ignore", detached: true }).unref();
}
```

- [ ] **Step 2: Update package.json bin and scripts**

```json
{
  "bin": {
    "career-compass-mcp": "build/cli.js"
  },
  "scripts": {
    "build": "tsc && npm run build:dashboard",
    "build:dashboard": "cd dashboard && npx next build",
    "build:mcp": "tsc",
    "dev": "tsc --watch",
    "dev:dashboard": "cd dashboard && npx next dev --turbopack",
    "start": "node build/index.js",
    "dashboard": "node build/cli.js dashboard",
    "test": "cd dashboard && npx vitest run",
    "inspect": "mcp-inspector node build/index.js",
    "prepublishOnly": "npm run build"
  },
  "files": [
    "build/",
    "dashboard/.next/standalone/",
    "dashboard/.next/static/",
    "dashboard/public/",
    "data/example/",
    "README.md",
    "LICENSE"
  ]
}
```

- [ ] **Step 3: Update tsconfig.json to include bin/**

Add `"bin"` to the `include` array in the root `tsconfig.json`:

```json
{
  "include": ["src/**/*", "bin/**/*"]
}
```

- [ ] **Step 4: Build and test the CLI**

```bash
npm run build:mcp
node build/cli.js dashboard --no-open
```

Expected: Either "Dashboard not built" error (if Next.js not built yet) or dashboard starts on port 3141.

If MCP mode: `echo '{}' | node build/cli.js` should start the MCP server (may error on invalid input, but confirms it routes correctly).

- [ ] **Step 5: Commit**

```bash
git add bin/ package.json tsconfig.json
git commit -m "feat: add CLI dashboard subcommand with port finding and browser launch"
```

---

## Task 11: README Update + Version Bump

**Files:**
- Modify: `README.md`
- Modify: `package.json` (version bump)
- Modify: `src/server.ts` (version bump)

- [ ] **Step 1: Bump version to 2.0.0**

In `package.json`, change:
```json
"version": "2.0.0"
```

In `src/server.ts`, change:
```typescript
version: "2.0.0",
```

- [ ] **Step 2: Update README.md**

Replace the entire README with the updated v2.0 version. Keep the same structure and tone, but add the Dashboard section, update Quick Start, and add CLI flags. Key additions:

- After the "What it feels like" section, add a "Dashboard" section showing the 4 views (pipeline, career, analytics, onboarding)
- Update Quick Start step 3 to include `career-compass-mcp dashboard`
- Add `## Dashboard` section describing each view
- Add CLI flags section (`--port`, `--no-open`)
- Update "Building from Source" to mention `npm run build` builds both MCP + dashboard
- Add `npm run dev:dashboard` for development
- Keep all existing tool/resource/prompt documentation intact

- [ ] **Step 3: Commit**

```bash
git add README.md package.json src/server.ts
git commit -m "docs: update README for v2.0, bump version to 2.0.0"
```

---

## Task 12: Full Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Clean build from scratch**

```bash
rm -rf build/ dashboard/.next/
npm run build
```

Expected: Both `tsc` and `next build` succeed. `dashboard/.next/standalone/` exists.

- [ ] **Step 2: Run all tests**

```bash
cd dashboard && npx vitest run
```

Expected: All tests pass (completeness + analytics).

- [ ] **Step 3: Test MCP server mode**

```bash
node build/cli.js
```

Expected: MCP server starts on stdio (waiting for input). Ctrl+C to exit.

- [ ] **Step 4: Test dashboard mode with example data**

```bash
CAREER_DATA_PATH=./data/example node build/cli.js dashboard --no-open
```

Expected: "Dashboard running at http://localhost:3141". Open in browser manually — verify all 4 views work with example data.

- [ ] **Step 5: Test empty data onboarding**

```bash
CAREER_DATA_PATH=/tmp/test-empty-career node build/cli.js dashboard --no-open
```

Expected: Dashboard opens to onboarding Phase 1 ("Let's build your Career KB").

- [ ] **Step 6: Commit any fixes found during verification**

If any issues found, fix and commit:
```bash
git add -A
git commit -m "fix: resolve issues found during full build verification"
```
