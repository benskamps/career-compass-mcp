---
name: start
description: Get started with Career Compass. Checks the install, then sets up your career history from a pasted résumé, or shows what to try first.
argument-hint: "[paste your résumé, or leave blank]"
disable-model-invocation: true
---

The user ran the Career Compass start command. Follow the career-compass skill's
"First contact" guidance.

1. If the Career Compass tools are available, call `check_setup` (offline; do not pass
   `checkForUpdates`). If they are not, say in one sentence that saving needs Claude Code or
   Cowork on their computer with Node.js 22 or newer, and continue without them.
2. If they pasted a résumé below, extract it with `ingest_document`, show a short summary of
   what you found, ask about the two or three vaguest claims, then offer to save each section
   with `save_career_section`.
3. If they pasted nothing and the KB is empty, ask them to paste a résumé or LinkedIn
   experience, and offer the three things they can try once it is in: a fit check on a
   posting, interview prep, or an offer review.
4. If the KB is already filled in, say what is there in two lines and ask what they are
   working on: a posting, an interview, or an offer.

Keep it short. One question at a time.

$ARGUMENTS
