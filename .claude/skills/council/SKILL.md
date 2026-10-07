---
name: council
description: Reconvene the Career Compass advisory council (five PM personas plus an Anthropic technical staff reviewer) to review the plugin after a release or before a big climb. Use when asked to "reconvene the council", "run the council", or for a council review of a version.
---

# Reconvening the council

1. Read `council/charter.md` and `council/personas.md`, and the newest `council/runs/*.md`
   so the sitting can say what changed since last time.
2. Write a short context brief for the members (scratch file, not committed): version under
   review, what shipped since the last sitting (CHANGELOG), latest live numbers from
   `/mnt/project-files/metrics/weekly.md`, latest eval results under
   `/mnt/project-files/evals/`, and any decisions in project memory they must respect.
3. Start six subagents in parallel, one per member. Each gets: its persona block verbatim,
   the charter, the brief, read access to both repos (`career-compass-mcp`,
   `career-compass-plugin`), and an instruction to write its notes in the charter's output
   shape to `/mnt/project-files/council/<version>/<member-slug>.md`. Tell them not to edit
   either repository and not to post anywhere.
4. Synthesize per the charter into `council/runs/<version>.md` (ranked list, axis score
   table with the median per axis, consensus marks, dissent, delta vs the previous run).
5. Republish the findings page (same artifact URL as last time; the URL is in the newest
   run file) with the new sitting on top and earlier sittings kept below.
6. Hand every prompt/skill/tool-description item to the prompt-quality thread; open PRs
   only for items the user has agreed to.

Running cost: six subagent reviews in the session, no `claude plugin eval` run. If a member
wants an eval run to settle a question, list it as a recommendation with a cost quote.
