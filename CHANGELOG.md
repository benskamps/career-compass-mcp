# Changelog

## 2.9.1 — 2026-09-05

### Fixed

- **`install --dry-run` said "No Claude client was found" under two clients it had just listed.** A
  dry run that would configure a client has found one; the summary now says so and tells you to
  run it without `--dry-run` to write. Caught by the stranger install of 2.9.0.

## 2.9.0 — 2026-09-05

### Added — said and done

- **`npx -y career-compass-mcp install`.** Every install route still ended with a person opening a
  JSON file. One command now finds the Claude clients on the machine and wires each: Claude
  Desktop's config (backed up first, other servers untouched, Windows gets the `cmd /c npx` form
  it needs), Claude Code through its own `claude mcp add -s user`, and Cursor's `mcp.json`.
  Clients that are not installed are skipped and named. The report says what changed, what to
  restart, and the first sentence to say to Claude. Idempotent: run it twice and nothing is
  rewritten. `--dry-run` shows the plan and writes nothing; `--data <path>` sets your career
  folder in every entry; `--client desktop|code|cursor` limits it. A config that will not parse
  is left exactly as it was, with the fix named.

## 2.8.0 — 2026-09-05

### Added — the dashboard click that reaches Claude

- **`career-compass-mcp dashboard --ask-claude`.** Until now every dashboard button copied a
  prompt for you to paste into Claude — the one piece of friction the page could not remove
  on its own, because Claude Desktop has no door a web page can knock on. With Claude Code
  installed and this flag on, the buttons ask Claude directly: the lite server runs
  `claude -p` headless with this package as its only MCP server, and the answer streams into
  a panel on the page. Cards, next-action rows, and the toolbar all switch from "Copy" to
  "Ask Claude"; prompts with a `[paste posting]` slot keep copying, since Claude would only
  ask for the posting.
- **The panel** shows what Claude is reading (tool names as they run), the answer as it
  arrives, the cost of the turn, and a *Reload the board* button once Claude may have changed
  your files. Esc closes it; a copy button keeps the prompt yours if the bridge fails.
- **Guard rails.** Opt-in twice (the flag AND a `claude` binary on PATH); POST only from a
  loopback Origin with a per-process token; one ask at a time; the child is killed when the
  browser leaves. Claude Code runs with `--strict-mcp-config` (only this server),
  `--setting-sources project` from your data directory (none of your user hooks or other MCP
  servers), `--no-session-persistence`, and Bash/Edit/Write/Web tools disallowed. The bridge
  is off for the bundled `--sample` data, which is read-only by design.
- Without the flag, or without Claude Code, nothing changes: the buttons copy, as before.

## 2.7.0 — 2026-09-05

Productization pass: four phases drafted by Antigravity, validated and hardened here.
Every behaviour change below now has a test; the pass landed with only the prompt-count
test touched.

### Fixed

- **Corrupt-store reads surfaced as stack traces in the résumé and opportunity tools.**
  Both tools in `resume.ts` and both in `opportunity.ts` called `loadCareerData()` bare;
  they now go through `guardedRead()` like every other reader.
- **`tailor_resume` accepted `format: "academic"` and produced a standard résumé.** The
  academic structure (publications, grants, teaching, service) is now a real branch.
- **Subscribing to `career://pipeline/{id}` never notified.** A write to
  `applications.yaml` marked the aggregate URIs only; per-application subscriptions now
  fire too.
- **Validation failures in `pipeline_*` returned as successes.** Unknown id, bad status,
  refused transition, missing id and unknown action all carry `isError: true` now, so a
  host can tell a refusal from a result.
- **`pipeline_view next_actions` compared date-only fields as UTC timestamps.** Ported the
  calendar-day logic the lite dashboard already used; a follow-up due today is due today
  in every timezone. Ghosted applications are skipped, matching the dashboard.
- **`career-compass-mcp dashboard` only matched as the first argument.**
- **`CAREER_DATA_PATH=~/...` created a literal `~` directory.** Claude Desktop's env block
  never passes through a shell; the tilde is now expanded to the home directory.
- **`resume-tailor` prompt offered pages 1–2; the tool takes 1–4.** Aligned.

### Fixed — from the pre-publish stranger pass (drove the packed tarball over stdio as a first-time user)

- **The onboarding prompt taught the wrong field name.** `setup-career-kb` said experience takes
  "company, title, dates"; the schema wants `role`, `startDate`, `endDate` (`'present'` for a
  current job) and object achievements. A save built from the prompt's own words was refused
  on step 2. The prompt now uses the schema's names.
- **An empty pipeline read back as a table header over nothing.** `pipeline_view list` now says
  no applications are tracked and names `pipeline_add` (and `status: discovered`); a filter
  that matches nothing blames the filter. `next_actions` on an empty pipeline no longer says
  "your pipeline is up to date" — there is no pipeline.
- **Two spellings of one folder.** `check_setup` printed `CAREER_DATA_PATH` verbatim (mixed
  separators on Windows) while `tailor_resume` printed the same folder normalized.
  `getDataDir()` now resolves the path once, so every surface prints the same string.
- **The git tip was a bash-only `&&` chain** that fails in Windows PowerShell 5.1. Three plain
  lines now, like the other per-shell tips.
- **A bare `career-compass-mcp` in a terminal sat forever with no orientation.** When stdin is a
  TTY it now says the client launches this, points at `dashboard --sample`, and names Ctrl+C.
- **`--help` leaked "full if built" and "Next.js"** at the npm audience, who can have neither.
- **`pipeline_add` without a status silently recorded "applied".** The reply now says the
  status was defaulted and how to mark a role you have only found.

### Added

- **`setup-career-kb` prompt** — first-contact walkthrough that builds the Career KB in
  conversation, optionally from a pasted résumé. Seventh prompt.
- **Two-step empty state** in the lite dashboard: a Welcome screen when there is no Career
  KB yet, the pipeline-only empty state once there is.
- **Lite dashboard: per-card detail drawer** (follow-up, posting link, source, contacts,
  interview rounds, latest note), **clickable next actions** that copy a targeted prompt,
  a **company/role filter**, horizontal-scroll kanban under 700px, and keyboard/focus
  accessibility on every clickable element. A posting URL is only rendered as a link when
  it is http(s); anything else is shown as text.
- **`check_setup` git finding** — a `warn` with the init command when the data directory
  is not a git repository, `ok` when it is. Omitted, never misreported, when git is
  missing or fails for some other reason.
- **Lite dashboard polish on top of the pass.** Cards carry a chevron that turns when the
  drawer opens; the drawer leads with *days in stage*; the filter hugs the right of the
  toolbar, shows "N of M", re-counts every column badge, writes "No matches" into an
  emptied column, focuses on `/` and clears on Esc, and is not rendered on an empty
  pipeline; next-action rows reveal a copy hint on hover and focus.
- README: dashboard section describes the drawer and filter (it still said "clicking a
  card copies a prompt"); screenshots regenerated from 2.7.0; Zed config snippet; prompt
  table lists `setup-career-kb`.

## 2.6.1 — 2026-08-31

Documentation and distribution pass. No behaviour change in the server — the version
exists because the npm README is only republished with one.

### Fixed — copy truth

- **The README showed the wrong dashboard.** Four screenshots of the Next.js app led the
  dashboard section — the app that is frozen and ships to nobody. The two screenshots now
  embedded are the **lite** dashboard, the one in the npm package, captured fresh from
  2.6.0 (`npm run visuals`). The mcpb bundle stages what the README references, so it lost
  the four stale images too (3.75 MB → 3.66 MB).
- **`manifest.json` promised a view that does not exist.** `long_description` advertised
  "per-application detail" in the bundled dashboard; the lite dashboard has KPIs, a kanban
  by stage, next actions, and a stage-distribution chart, and no detail view. Same class of
  defect as the drag claim closed in 2.6.0, on the surface Claude Desktop shows a stranger
  before they install.
- **Dead link to the Releases page.** The upgrade section pointed Claude Desktop users at
  `/releases` for a `.mcpb` bundle, but no release had ever been published there — the link
  went to an empty page. Fixed from the other end: **this is the first tagged release, and
  it carries the `.mcpb`**, so the Claude Desktop extension route is real for the first
  time and is now documented as the short way to install.
- **`format_for_ats` listed six ATS targets; the tool takes eight** (SmartRecruiters and
  `generic` were missing).
- `career://journal` and `journal.yaml` were undocumented — the journal shipped as a
  resource in 2.6.0 but never reached the resource table or the directory diagram.

### Changed — install UX

- **Install is now the second thing you read**, not the fifth, with a per-client route:
  a one-line `claude mcp add` for Claude Code, the config-file path per OS for Claude
  Desktop, and the generic stdio shape for everything else. It previously offered a single
  hand-edited JSON block and named the wrong config file for Claude Code.
- **A no-install demo leads the page** — `npx -y career-compass-mcp dashboard --sample`
  was buried two-thirds down.
- The tool table is grouped by phase of a search (find → apply → track → interview →
  feed the KB → health) and marks each tool **Read** or **Write**, so it is clear up front
  which ones will ask for permission.
- Resource subscriptions are documented for the first time.
- Merged the two duplicate build sections and the two overlapping privacy sections.

### Added

- **`docs/architecture.md`** — six Mermaid diagrams of the shipped system for users rather
  than auditors: the system map, the path a posting takes from paste to offer, the
  application state machine, the first-run write sequence, the three-peers/subscription
  flow, and the write-claim path. All six validated through `mermaid-cli` and shaped to
  render legibly in a README-width column. The README keeps an ASCII system diagram and
  links out, because **npmjs.com does not render Mermaid** — verified against the `mermaid`
  package's own npm page, which shows six raw code blocks and zero diagrams.

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
