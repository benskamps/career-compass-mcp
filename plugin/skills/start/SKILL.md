---
name: start
description: Get started with Career Compass. Checks the install, then sets up your career history from a pasted résumé, or shows what to try first.
argument-hint: "[paste your résumé, or leave blank]"
disable-model-invocation: true
# Read-only tools only (readOnlyHint: true); saving still asks every time.
allowed-tools:
  - mcp__plugin_career-compass_career-compass__check_setup
  - mcp__plugin_career-compass_career-compass__ingest_document
---

The user ran the Career Compass start command. Follow the career-compass skill's
"First contact" guidance.

1. If the Career Compass tools are available, call `check_setup` (offline; do not pass
   `checkForUpdates`). If they are not, say in one sentence that saving needs Claude Code or
   Cowork on their computer with Node.js 22 or newer, and continue without them.
2. If they pasted a résumé below, give value first: three role titles at the level it
   supports today, each with its one line of evidence, and the two bullets a screener
   would skip and why. Then extract it with `ingest_document` and offer to save each
   section with `save_career_section`, asking about the vaguest claims as you go.
3. If they pasted nothing and the KB is empty, ask them to paste a résumé or LinkedIn
   experience, and offer the things they can try once it is in: a fit check on a posting,
   interview prep, or an offer review. Or, to see it first, a sample fit check on the
   fictional Alex Rivera profile against any posting they paste (see the career-compass
   skill).
4. If the KB is already filled in, say what is there in two lines and ask what they are
   working on: a posting, an interview, or an offer.

Keep it short. One question at a time. Slash commands work in Claude Code and Cowork; in
claude.ai chat the user just asks in plain words.

$ARGUMENTS
