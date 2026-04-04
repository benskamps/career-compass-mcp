# Career Compass MCP v2.0 — Rewrite Polish Spec

**Date:** 2026-04-04
**Scope:** Full architectural refactor + polish pass across 15 audit findings
**Goal:** Take the project from 8/10 to 10/10 for Anthropic review and real-world usage

---

## Context

Career Compass MCP v2.0 shipped with a clean MCP server, Next.js dashboard, and CLI. A full audit identified 15 issues across visual design, UX, code quality, testing, and documentation. Since people are actively checking out and using the project, we're going with the deep "Rewrite Polish" approach — not just surface fixes, but structural improvements that make the codebase maintainable long-term.

---

## 1. Architecture Refactors

### 1A. Single Source of Truth for Colors

**Problem:** Colors are defined in three places — `globals.css`, `tailwind.config.ts`, and `lib/theme.ts`. Changing a color requires updating all three files.

**Solution:** CSS custom properties become the canonical definition.

- `globals.css` defines all color tokens as CSS custom properties in `:root` (light) and `.dark` (dark)
- `tailwind.config.ts` references CSS vars: `status: { applied: "var(--status-applied)" }`
- `lib/theme.ts` exports a `getStatusColor(status)` helper that reads computed CSS vars at runtime via `getComputedStyle`
- Charts (Recharts, skills radar) use the CSS var helper instead of hardcoded hex values

**Files modified:**
- `dashboard/app/globals.css` — becomes the single source for all color tokens
- `dashboard/tailwind.config.ts` — references CSS vars instead of hex literals
- `dashboard/lib/theme.ts` — `STATUS_COLORS` and `PRIORITY_COLORS` become runtime CSS var readers
- `dashboard/components/career/skills-radar.tsx` — use theme tokens
- `dashboard/components/analytics/*.tsx` — use theme tokens for all chart colors

### 1B. Typed Tool Handlers (Command Pattern)

**Problem:** MCP tool handlers use `args: any` and contain 200+ line switch blocks mixing validation, logic, and response formatting.

**Solution:** Discriminated union types + extracted handler functions.

- Define `PipelineArgs` as a discriminated union: `{ action: "add"; company: string; role: string; ... } | { action: "update"; id: string; ... } | ...`
- Extract each case into a standalone async function: `handleAdd(args, pipeline)`, `handleUpdate(args, pipeline)`, etc.
- The switch block becomes a thin dispatcher that delegates to the right handler
- Each handler is independently importable and testable

**Files modified:**
- `src/tools/pipeline.ts` — extract handlers, add types
- `src/tools/career-kb.ts` — extract handlers, add types
- `src/tools/opportunity.ts` — add input types
- `src/tools/resume.ts` — add input types
- `src/tools/interview.ts` — add input types

**New types file:**
- `src/types/tool-args.ts` — discriminated union types for all tool inputs

### 1C. Storybook for Component Library

**Problem:** Reviewers and users can't browse components without running the full app.

**Solution:** Add Storybook with stories for all custom components.

- Configure Storybook 8 with Next.js + Tailwind support
- Write stories for all `dashboard/components/` custom components (not shadcn/ui primitives)
- Each story covers: default state, empty state, loading state, edge cases
- Storybook theme switcher enables light/dark mode testing

**Key story files:**
- `dashboard/components/pipeline/application-card.stories.tsx`
- `dashboard/components/pipeline/kanban-board.stories.tsx`
- `dashboard/components/pipeline/kanban-column.stories.tsx`
- `dashboard/components/pipeline/closed-section.stories.tsx`
- `dashboard/components/career/skills-radar.stories.tsx`
- `dashboard/components/career/experience-timeline.stories.tsx`
- `dashboard/components/career/profile-header.stories.tsx`
- `dashboard/components/analytics/pipeline-funnel.stories.tsx`
- `dashboard/components/analytics/stat-cards-row.stories.tsx`
- `dashboard/components/layout/nav-bar.stories.tsx`
- `dashboard/components/layout/completeness-ring.stories.tsx`
- `dashboard/components/ui/empty-state.stories.tsx`
- `dashboard/components/onboarding/wizard-shell.stories.tsx`

**New dependencies:** `@storybook/nextjs`, `@storybook/react`, `@storybook/addon-essentials`, `@storybook/addon-themes`

**New scripts:** `npm run storybook`, `npm run build-storybook`

---

## 2. Functionality & UX

### 2A. Onboarding Wizard Mutations

**Problem:** Onboarding wizard renders form inputs but nothing saves. The UI appears interactive but isn't — reads as unfinished.

**Solution:** Implement Next.js server actions that write to YAML.

- `dashboard/app/onboarding/actions.ts` — implement `"use server"` actions:
  - `saveProfile(data)` → writes `data/career/profile.yaml`
  - `saveSkills(data)` → writes `data/career/skills.yaml`
  - `saveSalary(data)` → writes salary fields in `data/career/profile.yaml`
  - `saveTargets(data)` → writes target fields in `data/career/profile.yaml`
- Reuse existing `saveCareerSection()` from `src/storage/file-store.ts`
- Validate with Zod before writing
- Return `{ success: boolean, errors?: string[] }` for form feedback
- Pipeline management remains Claude-only — the dashboard is a viewer for pipeline data, matching the product thesis

**Files modified:**
- `dashboard/app/onboarding/actions.ts` — implement server actions
- `dashboard/components/onboarding/step-profile.tsx` — wire up form submission
- `dashboard/components/onboarding/step-skills.tsx` — wire up form submission
- `dashboard/components/onboarding/step-salary.tsx` — wire up form submission
- `dashboard/components/onboarding/step-targets.tsx` — wire up form submission

### 2B. Light/Dark Mode with System Preference + Toggle

**Problem:** Layout hardcodes `className="dark"`. If a reviewer's system prefers light mode, the page is unreadable.

**Solution:** Respect `prefers-color-scheme` with a manual toggle.

- Light mode palette: warm-tinted to match Claude aesthetic
  - Background: `#FAFAF8` (warm white)
  - Surface: `#FFFFFF`
  - Border: `#E5E2DD`
  - Text primary: `#1a1816`
  - Text secondary: `#78716C`
  - Accent: `#B45309` (darker amber for light-on-light contrast)
- `globals.css` `:root` block gets the warm light palette (replaces current grayscale placeholder)
- Remove hardcoded `className="dark"` from `layout.tsx`
- Add theme detection: `prefers-color-scheme` media query as default
- Settings dropdown gets light/dark/system toggle, persists to `localStorage`
- Enabled by color refactor (1A) — just swap CSS var values per context

**Files modified:**
- `dashboard/app/globals.css` — warm light mode `:root` overrides
- `dashboard/app/layout.tsx` — remove hardcoded dark class, add theme script
- `dashboard/components/layout/settings-dropdown.tsx` — add theme toggle

### 2C. Error Boundaries & Loading Skeletons

**Problem:** Pipeline detail page has no error fallback. Loading states are blank placeholders.

**Solution:** Add error.tsx files and skeleton loaders.

- Error boundaries:
  - `dashboard/app/error.tsx` — root error boundary with retry + back navigation
  - `dashboard/app/pipeline/[id]/error.tsx` — application-specific error with "Back to pipeline" link
- Loading skeletons (replace blank `loading.tsx` files):
  - `dashboard/app/pipeline/loading.tsx` — kanban column skeleton (3 columns, card-shaped blocks)
  - `dashboard/app/career/loading.tsx` — profile header + skills grid skeleton
  - `dashboard/app/analytics/loading.tsx` — stat cards + chart area skeleton
- Use Tailwind `animate-pulse` on neutral bg-elevated blocks matching each page's layout

### 2D. UX Details

Small but noticeable improvements:

- **Completeness ring tooltip** — hover shows "Career KB: X% complete. Missing: [list of gaps]"
  - File: `dashboard/components/layout/completeness-ring.tsx`
- **Collapsible closed section** — kanban closed apps collapse to count badge, expand on click
  - File: `dashboard/components/pipeline/closed-section.tsx`
- **Analytics chart legends** — color legend below each chart mapping colors to statuses
  - Files: `dashboard/components/analytics/pipeline-funnel.tsx`, `source-effectiveness.tsx`, `status-breakdown.tsx`
- **Chart colors from theme** — all charts use CSS var tokens via `getStatusColor()` helper
  - Files: `dashboard/components/career/skills-radar.tsx`, all analytics components
- **Favicon** — compass icon SVG favicon + og-image for link previews
  - Files: `dashboard/app/favicon.ico`, `dashboard/app/opengraph-image.png`
- **Analytics empty state CTA** — message says "Add 3+ applications via Claude to unlock analytics"
  - File: `dashboard/app/analytics/page.tsx`

---

## 3. Testing & Documentation

### 3A. MCP Server Test Suite

**Problem:** All 11 tools and 8 resources have zero test coverage.

**Solution:** Full Vitest test suite for the MCP server.

- Extend Vitest config to cover `src/` (currently only covers `dashboard/`)
- Mock filesystem for all file-store operations (no disk I/O in tests)
- Test each handler function directly (enabled by command pattern refactor in 1B)

**Test files:**
- `src/tools/__tests__/pipeline.test.ts` — add, update, list, stats, next_actions, get; edge cases (empty pipeline, missing fields, invalid IDs)
- `src/tools/__tests__/career-kb.test.ts` — ingest_document, generate_rejection_response
- `src/tools/__tests__/opportunity.test.ts` — evaluate_opportunity
- `src/tools/__tests__/resume.test.ts` — tailor_resume
- `src/tools/__tests__/interview.test.ts` — prep_interview, evaluate_offer
- `src/resources/__tests__/career-kb.test.ts` — all 8 resource URIs resolve, template params work
- `src/storage/__tests__/file-store.test.ts` — load/save YAML, missing files, corrupt data, schema validation

**Config changes:**
- Root `vitest.config.ts` (new) or extend `tsconfig.json` to include test paths
- Add vitest as root devDependency

### 3B. Dashboard Component Tests

**Problem:** No component render or interaction tests.

**Solution:** Add React Testing Library tests for key components.

**New devDependencies:** `@testing-library/react`, `@testing-library/jest-dom`

**Test files:**
- `dashboard/components/__tests__/application-card.test.tsx` — renders all statuses, overdue badge, excitement gauge
- `dashboard/components/__tests__/kanban-board.test.tsx` — filters, sort, column grouping, empty columns
- `dashboard/components/__tests__/skills-radar.test.tsx` — renders with data, handles empty skills
- `dashboard/components/__tests__/pipeline-funnel.test.tsx` — chart renders, correct stage counts
- `dashboard/components/__tests__/completeness-ring.test.tsx` — percentage display, tooltip content
- `dashboard/components/__tests__/empty-state.test.tsx` — renders icon + message

### 3C. README Enhancements

**Problem:** README sells the vision well but lacks visual proof, development docs, and architecture context.

**Additions:**
- **Screenshots** — 5 Playwright-captured images (dark mode): kanban, detail view, career KB, analytics, onboarding. Plus 1 light mode shot for comparison.
- **Architecture diagram** — ASCII or SVG: `Claude → MCP Server (tools/resources/prompts) ↔ File Store (YAML) ← Dashboard UI (Next.js)`
- **Development section** — clone, install, `npm run dev`, `npm run dev:dashboard`, `npm run inspect`, `npm run test`, `npm run storybook`
- **Data structure** — example YAML snippets showing career-data/ file format
- **Configuration** — all env vars documented: `CAREER_DATA_PATH`, `PORT`, `NODE_ENV`

### 3D. Example Data Expansion

**Problem:** 3 applications leave the kanban sparse and analytics thin.

**Solution:** Expand to 8 applications across all pipeline stages.

New applications:
| Company | Role | Status | Purpose |
|---------|------|--------|---------|
| Canopy Analytics | VP Operations | Discovered | Fills empty column |
| Stratos Cloud | Program Director | Screening | Fills empty column |
| Brightpath Health | Sr. Program Manager | Offer | Fills empty column |
| Apex Consulting | Engagement Manager | Withdrawn | Second closed status |
| Lumen Digital | Head of Ops | Applied | Multiple in one column |

Each gets realistic contacts, notes, interview history, and diverse sources (LinkedIn, referral, company site, recruiter outreach) for analytics variety.

**File modified:** `data/example/pipeline/applications.yaml`

### 3E. Automated Screenshots via Playwright

**Problem:** No screenshots in README; reviewers can't assess visual quality without building.

**Solution:** Playwright script that captures all dashboard views.

- `scripts/capture-screenshots.ts` — starts dev server with `CAREER_DATA_PATH=data/example`, captures 5 views at 1280×800 in both dark and light mode
- Saves to `docs/screenshots/`
- README references images from that directory
- Rerunnable: `npm run screenshots`
- Runs as the final step after all visual changes are complete

**New devDependency:** `playwright` (or use existing MCP Playwright plugin)

**New script:** `npm run screenshots`

---

## Build Order

The work should be done in this sequence to avoid rework:

1. **Example data expansion** (3D) — needed for all visual work and screenshots
2. **Color system refactor** (1A) — foundational; light/dark mode depends on it
3. **Typed tool handlers** (1B) — foundational; MCP tests depend on it
4. **Light/dark mode** (2B) — depends on color refactor
5. **Onboarding mutations** (2A) — independent
6. **Error boundaries + loading skeletons** (2C) — independent
7. **UX details** (2D) — tooltips, collapsible closed, chart legends, favicon
8. **MCP server tests** (3A) — depends on command pattern refactor
9. **Dashboard component tests** (3B) — independent
10. **Storybook** (1C) — independent, but benefits from all components being final
11. **README enhancements** (3C) — near-final
12. **Automated screenshots** (3E) — absolute last step, captures final state

---

## @shared Path Fix

**Problem:** `dashboard/tsconfig.json` maps `@shared/*` → `../src/*` (TypeScript source). Initial audit flagged this as broken on npm install.

**Actual state:** Next.js config already handles this correctly — both Turbopack (`resolveAlias`) and webpack (`resolve.alias`) point `@shared` to `../src/`, and `outputFileTracingRoot` is set to the parent directory so standalone builds include the shared source files. The tsconfig path is for TypeScript type checking only (`noEmit: true`); runtime resolution is handled by the bundler.

**Verdict:** Not broken. No changes needed. The only improvement would be adding a comment in `dashboard/tsconfig.json` explaining why the path works despite pointing at `.ts` source (bundler resolution mode + Next.js aliases).

---

## Out of Scope

- Drag-and-drop on kanban board (pipeline mutations stay in Claude)
- Video demo / walkthrough
- CHANGELOG
- CI/CD pipeline
- npm publish workflow
