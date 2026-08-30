# The Next.js dashboard is frozen (a spec quarry)

**Status:** frozen as of 2026-08-29 (gauntlet-v2, Gate 7). Not deleted — kept as a
worked-out design reference. Reversible: unfreezing is a decision, not a rebuild.

## Why

This directory is a full Next.js app (kanban with drag-free stage moves, an
application detail view, a Career KB overview with a skills radar, an onboarding
wizard, and an analytics page). It is **not shipped to anyone**: the npm package's
`files` allowlist excludes it, so an `npx -y career-compass-mcp` user never gets it.
It runs only from a source clone that builds it, and it duplicates the funnel and
arithmetic the **lite dashboard** (`src/dashboard-lite/`) already ships.

Two independent review lanes in the gauntlet recommended routing all GUI
investment to the lite dashboard rather than maintaining two implementations of
the same views. The original plan was to replace this with an in-Claude **MCP App**
board (a `ui://` resource rendered inside Claude Desktop). The Gate 7 spike found
that **Claude renders MCP Apps only for remote HTTP custom connectors, not for the
local stdio / `.mcpb` transport this project ships as** — so the App board is
deferred too, and the lite dashboard is the in-and-alongside-Claude visual surface
for now. See the audit's §9 and §19 (`docs/architecture-audit.md`).

## What "frozen" means in practice

- **Shipped GUI = the lite dashboard.** New visual features, fixes, and polish go
  there (`src/dashboard-lite/render.ts`).
- **This app is a reference, not a product.** Its detail-view layout, wizard flow,
  and analytics designs are here to mine when the lite dashboard grows those
  surfaces, or if a hosted remote-connector build is ever pursued.
- **It still builds and its bugs still get fixed** — the gauntlet closed its
  lost-update, chart, and copy defects. Frozen means "no new feature investment,"
  not "abandoned" or "broken."
- CI still builds and tests it (it shares MCP source through `@shared`), so it
  cannot silently rot.

## To unfreeze

If Anthropic documents MCP App rendering for local stdio servers, or you decide to
stand up a hosted HTTP + custom-connector distribution (different hosting, auth,
and a Pro/Max/Team paywall for users), this app — or its designs — is the head
start. That is a product decision, recorded here so the next session doesn't
re-derive it.
