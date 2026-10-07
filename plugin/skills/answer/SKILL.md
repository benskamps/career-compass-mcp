---
name: answer
description: Answer a job application form's questions from your real history, each within its character limit, without inflating years or guessing your eligibility answers.
argument-hint: "[paste the form's questions, with any character limits]"
disable-model-invocation: true
---

The user wants answers to an application form's questions. The questions are below.

- If no questions are included, ask them to paste them, with character limits if shown,
  and stop.
- **Source.** With the Career Compass tools, answer from the Career KB (`career://full`,
  including `narrative` and `stories`); if it's empty, ask for a résumé. Without the tools
  (claude.ai chat), answer from the résumé they paste.
- **Each answer** in their voice, from facts in their history only, within its character
  limit. Show the count after it, like "(412/500)".
- **Eligibility is theirs to answer:** work authorization or sponsorship, relocation,
  salary expectation, start date or notice. Fill these only from a saved `narrative` entry
  or the profile (`salaryMin`/`salaryMax`, `openToRelocation`, `noticePeriod`), quoted as
  saved; otherwise `[confirm: ...]`. Never guess.
- **"Years of experience with X":** count only from roles where their history names X.
  If it can't support the number, flag it and give what it does support. Never round up,
  and never answer yes to a requirement their history doesn't show.
- End with the placeholder footer when there are any: "2 things to confirm before
  sending: salary expectation, start date."
- When they fill in a narrative answer (why they're leaving, a gap, work authorization),
  offer to save it verbatim to `narrative` so the next form reuses it.

$ARGUMENTS
