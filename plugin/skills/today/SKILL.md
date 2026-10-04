---
name: today
description: See what needs attention in your job search today, such as follow-ups due, upcoming interviews, and stale applications, in priority order.
disable-model-invocation: true
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
- If nothing is due, say so in one line, name the next thing coming up, and suggest one
  forward move such as tracking a new role. Don't invent work.
- If the pipeline is empty, say so in one line, then ask for a job posting they're
  considering or a role they've already applied to, and offer to track it with
  `pipeline_add`. Nothing else.
- If the tools are not available, explain in one sentence that tracking needs Career
  Compass running in Claude Code or Cowork on their computer. Then offer to build today's
  list anyway from what they paste: each application's company, role, date applied and
  last contact.

$ARGUMENTS
