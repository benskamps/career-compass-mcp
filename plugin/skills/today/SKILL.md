---
name: today
description: See what needs attention in your job search today, such as follow-ups due, upcoming interviews, and stale applications, in priority order.
disable-model-invocation: true
# Read-only tools only (readOnlyHint: true); pipeline changes still ask every time.
allowed-tools:
  - mcp__plugin_career-compass_career-compass__pipeline_view
---

The user wants today's job-search digest: the one thing to do first, then the rest.

- If the Career Compass tools are available, call `pipeline_view` with `action: "next_actions"`.
  It returns a ranked digest: a "Start here" move, the rest of today's list, and what is
  coming up. Lead with the Start here move in a sentence or two and offer to do its first
  step right now (draft the check-in, build the interview prep, review the offer). Then the
  other items, one line each with its action. Keep the whole reply short enough to read
  over coffee, and don't pad it with generic job-search advice.
- Never change a status, date or note on your own. Where the digest suggests one (mark a
  silent application ghosted, record where an offer stands, set a follow-up date), offer
  the exact `pipeline_update` and make it only after the user says yes.
- If nothing is due, say so in one line, name the "📅 Next up" date when the digest has
  one, and suggest one forward move such as tracking a new role. Don't invent work.
- If the result ends with "↩️ Since you were last here", open with what is new since their
  last visit in one line, then the digest as usual.
- If the pipeline is empty, say so in one line and ask for one thing: "Tell me one role
  you've applied to or are considering (company and title) and I'll start tracking it."
  That is the whole reply. When they answer, show the `pipeline_add` calls as one batch,
  make them after one yes, then give the first digest (`pipeline_view` `next_actions`) in
  the same reply. Since these were their first applications, end with the career-compass
  skill's one-time morning briefing offer.
- If the search has ended in an accepted offer, offer the career-compass skill's landing
  mode (this week's wins) instead of tracking new roles.
- If the tools are not available, explain in one sentence that tracking needs Career
  Compass running in Claude Code or Cowork on their computer. Then offer to build today's
  list anyway from what they paste: each application's company, role, date applied and
  last contact.

$ARGUMENTS
