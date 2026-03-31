# Career Compass MCP v2.0 — Polish Pass

**Date:** 2026-03-30
**Goal:** Ship-ready + portfolio-quality single pass across all 14 identified issues
**Approach:** Single pass grouped by file to minimize context switches

---

## Critical Fixes

### 1. file-store.ts — Unhandled Parse Errors
**Problem:** `schema.parse()` throws `ZodError` on malformed YAML with no try/catch. `parseYaml()` can also throw on invalid YAML syntax. Both `loadCareerData()` and `loadPipeline()` are affected.
**Fix:** Wrap all `schema.parse()` and `parseYaml()` calls in try/catch. Return `null` with `console.error` on failure. No server crashes from bad YAML.

### 2. Port Mismatch — CLI vs README
**Problem:** `bin/cli.ts` defaults to port `3141`, README says `3333`.
**Fix:** Align on `3141` (pi-adjacent, memorable for a "compass" tool). Update README to match.

### 3. README Path Error
**Problem:** README references `build/index.js` but actual path is `build/src/index.js`.
**Fix:** Correct the path in README.

---

## Visual Polish

### 4. No Loading States
**Problem:** All async pages (pipeline, career, analytics) show blank screens while data loads. No Suspense boundaries, skeletons, or spinners.
**Fix:** Add `loading.tsx` files to `app/pipeline/`, `app/career/`, `app/analytics/` with skeleton UI (pulsing cards/bars matching each page's layout). Next.js handles Suspense automatically via the file convention.

### 5. Inconsistent Empty States
**Problem:** Kanban has nice empty messaging, but Contacts, Testimonials, Education, Notes silently return `null`. No visual feedback — user can't tell if data is missing or not displaying.
**Fix:** Create a small reusable `EmptyState` component (icon + message + optional action CTA). Apply to all components that currently return `null` for empty data.

### 6. Mobile Kanban Broken
**Problem:** Fixed `w-72` columns with `shrink-0` — small screens get cramped horizontal scroll with no responsive adaptation.
**Fix:** Make columns `min-w-[272px] w-full md:w-72` so they stack vertically on mobile, horizontal scroll preserved on tablet+.

### 7. Timeline Style Mismatch
**Problem:** Application timeline uses `border-2` hollow circles, Experience timeline uses solid filled circles. Two different visual languages.
**Fix:** Unify both timelines to use solid filled circles (experience timeline style — cleaner, more polished).

### 8. Inconsistent Heading Hierarchy
**Problem:** Page titles bounce between `text-xl`, `text-2xl`, `text-3xl`. Section headers mix uppercase tracking-wider vs. font-semibold.
**Fix:** Standardize: page titles = `text-2xl font-bold`, section headers = `text-lg font-semibold`. Apply consistently across all pages.

### 9. Status Badge Contrast Issues
**Problem:** White text on yellow (#EAB308) backgrounds fails WCAG AA contrast. Badge styling inconsistent between filled and outline variants.
**Fix:** Switch yellow/light status badges to dark text. Ensure all status color + text combinations pass WCAG AA (4.5:1 ratio).

---

## Code & DX

### 10. CLI Missing --help and Validation
**Problem:** No help text, no `--version` flag, no port argument validation (`parseInt` can return `NaN`).
**Fix:** Add `--help` with usage text, `--version` reading from package.json, validate port is numeric with clear error message.

### 11. Onboarding Forms — No Error Feedback
**Problem:** All wizard steps call save functions but show nothing if save fails. Silent data loss.
**Fix:** Wrap save calls in try/catch, show inline error message on failure (red text below save button).

### 12. Hardcoded Version in Nav
**Problem:** Nav bar has `version="2.0.0"` hardcoded.
**Fix:** Import version from root package.json, pass as prop to nav bar.

### 13. Phase One Polling — No Timeout
**Problem:** Infinite `setInterval` polling with no timeout, no error handling, no loading indicator. Runs forever if data never appears.
**Fix:** Add 60-second timeout with "timed out" message, loading spinner during poll, proper cleanup on unmount.

### 14. HTML Entities Instead of Icons
**Problem:** Closed section uses `&#9654;` (triangle) instead of a proper icon. Not accessible or stylable.
**Fix:** Replace with Lucide `ChevronRight` icon (already in project dependencies).

---

## Out of Scope

- No new shared component library or design system abstraction (YAGNI for this project size)
- No CI/CD setup (separate concern, not polish)
- No salary schema refactor (internal inconsistency, doesn't affect users)
- No lint/typecheck script additions (nice-to-have, not polish)
- No new test coverage (existing tests cover analytics + completeness)
