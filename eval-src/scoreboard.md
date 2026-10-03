# Eval scoreboard

One row per scored release or branch. Written by `node eval-src/scoreboard.mjs --append`.
Activation is the share of should-fire prompts where the skill fired; false fires is the share of
should-not-fire prompts where it fired anyway.

| Date | Version | activation | false-fire | first-reply | task | honesty | surface | memory | trust | Cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-10-03 | 2.9.4 | 97% | 0% | 95% | 61% | 57% | 100% | 75% | 100% | $41.16 |
| 2026-10-03 | 2.9.4 + #73 | 98% | 0% | 96% | 89% | 73% | 99% | 100% | 100% | $22.70 |
| 2026-10-03 | 2.9.4 + #74 | 99% | not run | 95% | 94% | 89% | 99% | 100% | 100% | $20.86 |

Notes on the second row: one run per trigger prompt and no baseline arm, so it cost less. Memory honesty in that row was judged without the pipeline file, and 6 of its 8 failures were judge errors that the current rubric fixes.

Notes on the third row: the chat and tools quality suites only, 3 runs each; the trigger suite was not re-run because nothing it measures changed. On the Claude.ai chat suite, honesty failures fell from 13 to 1. A careful claim-by-claim audit found all 7 tools-suite honesty failures (6 on memory cases with a long Career KB rubric, 1 on the executive) were judge errors, so audited honesty is 83 of 84.
