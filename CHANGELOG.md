# Changelog

## 2.6.0 — 2026-08-29

The architectural-gauntlet v2 release: a full remediation of the audit findings,
three logic holes found by re-reading the fixes, the Gate 7 product rulings, and
three new daily-ritual prompts. See `docs/architecture-audit.md` (§19, §20).

### Added

- **Three daily-ritual prompts** — `daily-review` (triage the pipeline into
  today's highest-leverage moves), `post-interview-debrief` (capture what an
  interview surfaced, then set up the next step), and `weekly-retro` (review the
  week's movement and journal signals into one durable takeaway). Prompts are the
  one surface every Claude client renders as a slash command.
- **`career://journal` resource** and a `journal.yaml → career://full` live-update
  mapping, so the journal — the section the product thesis says compounds over
  years — is finally addressable and dirties the aggregate resource.

### Fixed — data integrity

- **Dashboard lost update (P1).** The onboarding Server Actions read the profile
  *outside* the write lock and wrote it back inside, so two concurrent edits — or
  one racing an MCP write — silently reverted each other while both reported
  success. They now go through a new locked `mutateCareerSection` door (the mirror
  of `mutatePipeline`); reproduced 20/20 before, 0/20 after.
- **Stale-claim break could pick two winners (P1).** The cross-process write
  claim's break path deleted whatever file sat at the path, including a rival
  breaker's freshly-won claim. It now captures the stale claim by atomic rename,
  so exactly one breaker wins.
- **pid-reuse permanent wedge.** Checking liveness before the TTL meant a claim
  whose crashed holder's pid had been reused by an unrelated process would never
  break — a permanent wedge. A hard cap now breaks a claim past it regardless of
  liveness.

### Fixed — untrusted input

- **Prompt-injection fence extended to prompts (P1).** The prompt templates
  interpolated job-posting, notes, offer, and market-data text raw, while the
  structural test only scanned the tools. All of it is now fenced, the test scans
  prompts too, and a second bare site the audit missed (`interview.ts` market
  data) was caught and closed.

### Fixed — honest failures & surfaces

- Refused writes now surface as a sentence on every path — the read-only demo
  store (including via `capture_insight`), a held claim, or a corrupt file — rather
  than escaping as a raw transport error.
- Live-resource watchers survive a data directory being deleted and recreated: the
  Windows event storm is stopped, and a bounded recovery poll re-arms the watcher
  under a standing subscription.
- Analytics: the excitement-vs-outcome scatter used a categorical X axis (its
  domain silently ignored); it now uses numeric, stage-labelled axes. The aged
  store no longer claims "in play right now" over stale data.
- Copy truth: removed the README/CLI "drag to advance stages" claim (no drag
  exists), and the kanban empty state no longer names a `manage_pipeline` tool that
  does not exist.

### Changed — build & distribution

- CI now runs `build:dashboard` (with the standalone staging step the CLI depends
  on), not a bare `next build`, so a staging regression can't ship a stylesheet-less
  dashboard behind a green build.
- `PRIVACY.md` now ships in the npm tarball.
- The Next.js dashboard is **frozen as a spec quarry** (`dashboard/FROZEN.md`): the
  bundled lite dashboard is the maintained, shipped GUI. An in-Claude MCP App board
  is deferred — Claude renders MCP Apps only for remote HTTP connectors, not the
  local stdio/`.mcpb` transport this ships as.

## 2.5.1 and earlier

See git history (`dc823a4..`) and the seals in `personal-infra/seals/` for the
first gauntlet, its remediation (PRs #37/#38), and the visual pass.
