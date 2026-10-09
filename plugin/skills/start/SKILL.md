---
name: start
description: Start here. Paste or attach your résumé and a job you're considering, and get an honest fit verdict, your top two gaps, and what to fix before you apply. Or ask to see a sample first.
argument-hint: "[paste your résumé and a job posting, or leave blank]"
disable-model-invocation: true
# Read-only tools only (readOnlyHint: true); saving still asks every time.
allowed-tools:
  - mcp__plugin_career-compass_career-compass__check_setup
  - mcp__plugin_career-compass_career-compass__ingest_document
---

The user ran the Career Compass start command. Follow the career-compass skill's
"First contact" guidance.

1. If the Career Compass tools are available, call `check_setup` (offline; do not pass
   `checkForUpdates`). If they are not, you are most likely in claude.ai chat: follow the
   career-compass skill's chat mode (no setup talk, no Node.js), and skip the saving steps
   below in favor of the Career Compass card.
2. If they pasted a résumé and a posting, do the fit check: that is the start. If they
   pasted only a résumé below, give value first: three role titles at the level it
   supports today, each with its one line of evidence, and the two bullets a screener
   would skip and why. Then extract it with `ingest_document` and offer to save each
   section with `save_career_section`, asking about the vaguest claims as you go.
3. If they pasted nothing and the KB is empty (or there are no tools), the whole reply is
   one first step: "Paste or attach your résumé (a PDF is fine) and one job you're
   considering, and I'll tell you how well you fit, the top two gaps, and what to fix
   before you apply." Then at most one line: they can say "show me a sample first" to see
   a fit check on the fictional Alex Rivera profile (see the career-compass skill). No
   list of features. If they pasted a Career Compass card, follow the skill's card
   guidance instead.
4. If the KB is already filled in, say what is there in two lines and ask what they are
   working on: a posting, an interview, or an offer.

Keep it short. One question at a time. Slash commands work in Claude Code and Cowork; in
claude.ai chat the user just asks in plain words.

$ARGUMENTS
