---
name: week
description: Review your job-search week. What moved, stalled or closed, the patterns in your notes, your pace against your goal, and one focus for next week.
argument-hint: "[anything to center it on, or leave blank]"
disable-model-invocation: true
---

The user wants a weekly review of their job search. Anything to center it on is below.

With the Career Compass tools, call `pipeline_view` with `action: "stats"` and with
`action: "list"`, and read the journal (`career://journal`) and profile if the host can
read resources. Then, in this order:

1. **Movement:** what advanced, stalled or closed this week, and where applications are
   getting stuck.
2. **Pace:** applications this week against `profile.weeklyPace`, in one line ("4 sent
   against your pace of 5"). If no pace is set, skip it.
3. **Patterns:** strengths that keep landing and gaps that keep surfacing in recent
   journal entries.
4. **A month on:** one line, only when the data shows it, e.g. "A month ago your journal
   kept flagging no metrics; your last three fit checks didn't." Skip it otherwise.
5. **The honest read:** one thing working to do more of, one not working to change.
6. **Next week's focus:** the single highest-leverage bet.

Cite the application (company, role) or journal entry (date and summary) behind every
claim. If you can't point to one, cut the claim.

Then offer one `capture_insight` (type `note` or `fit_signal`) recording the week's
takeaway, with `origin: "inferred"` for your read or `"user_said"` if it's their words.
Write it only after they say yes. If the search ended in an accepted offer, the week is
instead a win capture (`capture_insight` type `win`).

Without the tools (claude.ai chat), ask: "Paste this week's applications: company, role,
date, stage, last contact, and any notes." Then do the same review, citing their lines.

$ARGUMENTS
