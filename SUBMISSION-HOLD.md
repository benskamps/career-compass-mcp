# 🚩 DO NOT SUBMIT YET — read this first

**Status as of 2026-07-24, end of the day-shift session.**
Ben called a hold for another quality loop. This file is the reason and the
worklist. Delete it when the loop closes and the bundle is rebuilt.

---

## Why the hold

A pre-submission audit found that **the documented first-run flow could not
succeed**. That is now fixed on `main` (`9b342c0`), but it was found *after*
`career-compass-2.2.0.mcpb` was built, and finding it changed the confidence
level: the visual pass was going well enough to be misleading. Something that
fundamental surviving this long means the product has not actually been driven
from zero by anyone, and one more loop is cheaper than a rejected submission.

---

## 🔴 The bundle on disk is stale — do not upload it

`career-compass-2.2.0.mcpb` was packed at **20:04**. Everything below landed
after it. Uploading that file ships none of it:

- the lite dashboard's chart rendering at all (it painted five empty tracks)
- dark mode (the bundle has `color-scheme: light` and indigo `#4f46e5`)
- the board not overflowing off the right edge
- the IPv6-only bind fix (the bundled build refuses `127.0.0.1`)
- `save_career_section` — the bundle physically cannot populate a Career KB

**Rebuild from `main` before doing anything else.**

---

## ✅ Fixed since the bundle was built

| | |
|---|---|
| `9b342c0` | **No tool could write the Career KB.** `saveCareerSection()` had zero callers. Added `save_career_section` (schema-validated before disk, section allowlisted against traversal). Also: `generate_rejection_response` reported a status change it never made; `classify_email` told Claude to call `manage_pipeline`, which no longer exists; the empty-state message named `data/career/`, a path no installed user has. |
| `3cea97a` | Stage colours were a Tailwind rainbow inside a warm page — now a temperature ramp. Closed applications collapse behind a disclosure. Chart panel lost a dead third. |
| `cf495cf` | Chart `.fill` was `display:inline`, so width never applied — the chart had **never** rendered. Server bound IPv6-only. Follow-up "due today" read "overdue by 1d" (UTC day boundary). |

142 tests green, `tsc` clean, npm 2.2.0 published (12→15 tool surface is on main, **not** on npm).

---

## 🔲 Owed before submitting

1. **Rebuild + re-verify the bundle.** Then open the rendered dashboard at
   1512px **and** in dark mode as the last check. The audit found the stale
   bundle blew its grid out at that width — `overflow-x:auto` on `.board` does
   not let the grid *item* shrink (default `min-width:auto`), so the 1fr rail
   collapsed and the chart track went to 0px. Harden it: `min-width:0` on the
   `.grid2` children, or `minmax(0,1fr)`.
2. **198 compiled test files still ship in the MCPB.** npm ships zero — the
   `files` allowlist blocks them. The MCPB staging copies `build/` wholesale and
   bypasses that guard. Strip them and add a pack-time assertion so it cannot
   regress.
3. **Publish 2.3.0.** npm is at 2.2.0 / 14 tools; main is 15 and carries the
   first-run fix. Anyone installing from npm today still cannot populate a KB.
4. **README onboarding still describes the old flow** — it should name
   `save_career_section` as the step that saves.
5. **Response rate disagrees between dashboards** — 71% (lite) vs 63% (Next).
   The lite one is right; the Next one divides by total instead of by
   applications actually sent. Only the lite one ships, but fix or delete.
6. **Re-run the embarrassment audit against the rebuilt bundle.** The last run
   was against the stale one, so its lite-dashboard findings are already
   obsolete and its other findings were never re-checked post-fix.

---

## Also open (from the earlier audit, none regressions)

Lite dashboard has no Host allowlist (DNS-rebinding surface). `.bak` files are
never pruned. `ingest_document`'s `autoSave` still promises more than it does.
Sample fixture is now current but will go stale again — consider generating
dates relative to today at render time instead of baking them in.

---

## The other thread

The office-hours design doc is at
`~/.gstack/projects/benskamps-career-compass-mcp/beschipp-main-design-20260724-210226.md`
— watchlist discovery via official Greenhouse/Ashby/Lever APIs, then a
career-ops interop reader. **Its assignment comes first:** ask Dione why she uses
it, and where she finds the jobs she brings it. Both answers are one message
away and either could redirect that whole design.
