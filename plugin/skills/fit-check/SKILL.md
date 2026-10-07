---
name: fit-check
description: Check how well you fit a job posting. Paste the posting or its URL text, and get a verdict, your strongest evidence, and the gaps to address.
argument-hint: "[paste the job posting]"
disable-model-invocation: true
# Read-only tools only (readOnlyHint: true); saving still asks every time.
allowed-tools:
  - mcp__plugin_career-compass_career-compass__explore_opportunity
---

The user wants a fit check on the job posting below.

- If no posting is included, ask them to paste it and stop.
- If the Career Compass tools are available, use `explore_opportunity` with the posting. If
  it says there is no saved history yet, ask them to paste a résumé first (that is the
  only question), run `explore_opportunity` again with the pasted text as `resume`, then
  offer to save the résumé with `save_career_section`.
- If the tools are not available, follow "Doing the work without the tools" in the
  career-compass skill.

Lead with the verdict (strong, stretch, or long shot) in one line, then the evidence and the
top two gaps. Finish by offering one next step: tailor the résumé, track it with
`pipeline_add`, or "paste the next posting and I'll tell you which to apply to first".

$ARGUMENTS
