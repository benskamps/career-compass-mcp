# Eval scoreboard

One row per scored release or branch. Written by `node eval-src/scoreboard.mjs --append`.
Activation is the share of should-fire prompts where the skill fired; false fires is the share of
should-not-fire prompts where it fired anyway.

Notes on the 2.9.4 + #73 row: one run per trigger prompt and no baseline arm, so it cost less. Memory honesty in that row was judged without the pipeline file, and 6 of its 8 failures were judge errors that the current rubric fixes.

Notes on the 2.9.4 + #74 row: the chat and tools quality suites only, 3 runs each; the trigger suite was not re-run because nothing it measures changed. On the Claude.ai chat suite, honesty failures fell from 13 to 1. A careful claim-by-claim audit found all 7 tools-suite honesty failures (6 on memory cases with a long Career KB rubric, 1 on the executive) were judge errors, so audited honesty is 83 of 84.

Notes on the 2.15.1 row: the trigger suite only, 3 runs, Sonnet 5.5, on the broadened description. The 20 casual openers added in this release scored 55/60 on both the old and the new description, and the 10 new near misses 30/30 on both, so the change held precision but did not measurably raise offline activation. The 4 misses on the new prompts are asks with nothing pasted ("here's the JD, thoughts?", "Is this a good offer?"), where Claude asks for the text before loading the skill.

Notes on the 2.15.2 + empty-handed row: the trigger suite only, 3 runs, Sonnet 5.5, on a description that adds "even a casual ask with nothing pasted yet" and names interviewing candidates as hiring-side. It adds 12 empty-handed openers ("Can you look at my resume? I'll paste it next."), 5 turn-2 cases (the opener and a plain reply asking for the text sit in the prompt, then the paste), and 5 hiring-side near misses. Before the change the empty-handed openers, plus "here's the JD, thoughts?" and "Is this a good offer?", fired 34/42; after it, 41/42. Turn-2 cases loaded the skill 15/15 both before and after, so a chat that starts empty-handed recovers once the text arrives; the change makes the first reply Career Compass's too. False fires stayed 0/135. On the 91 prompts the two runs share, activation went from 269/273 to 265/273, mostly "Write a reply accepting the interview invitation" (0/3 here, 4/6 on a rerun, against 5/6 on the old description).

| Date | Version | activation | false-fire | first-reply | task | honesty | surface | memory | trust | retention | voice | Cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-10-03 | 2.9.4 | 97% | 0% | 95% | 61% | 57% | 100% | 75% | 100% | not scored | not scored | $41.16 |
| 2026-10-03 | 2.9.4 + #73 | 98% | 0% | 96% | 89% | 73% | 99% | 100% | 100% | not scored | not scored | $22.70 |
| 2026-10-03 | 2.9.4 + #74 | 99% | not run | 95% | 94% | 89% | 99% | 100% | 100% | not scored | not scored | $20.86 |
| 2026-10-14 | 2.13.1 | 389/401 · 97% (CI 95–98%) | 0/90 · 0% (CI 0–4%) | 140/156 · 90% (CI 84–94%) | 131/150 · 87% (CI 81–92%) | 184/192 · 96% (CI 92–98%) | 185/186 · 99% (CI 97–100%) | 35/39 · 90% (CI 76–96%) | 531/531 · 100% (CI 99–100%) | 33/36 · 92% (CI 78–97%) | 84/84 · 100% (CI 96–100%) | $195.09 |
| 2026-10-24 | 2.15.1 | 270/279 · 97% (CI 94–98%) | 0/120 · 0% (CI 0–3%) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | $27.83 |
| 2026-11-06 | 2.15.2 + empty-handed | 321/330 · 97% (CI 95–99%) | 0/135 · 0% (CI 0–3%) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | $32.85 |
