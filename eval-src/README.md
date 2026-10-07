# Career Compass evals

Offline evals for the plugin, run with `claude plugin eval`. They measure what users
feel without any telemetry: does the skill show up when it should, is the first answer
worth having, is the work good, and is every claim about the user true.

## What's here

| Path | What it is |
| --- | --- |
| `personas/` | 8 fictional job seekers. Each résumé is the only truth the honesty judge accepts about that person. |
| `postings/` | One job posting per persona, with the expected verdict, strongest evidence and real gaps the fit-check judge grades against. |
| `trigger/` | 60 prompts where Career Compass should fire and 30 where it should stay quiet (coding, recipes, and hiring-side asks such as writing a job description). |
| `cases.mjs` | The task, memory and first-contact cases. |
| `record-mocks.mjs` | Records the MCP tool mocks from the real server in this repo. |
| `build-suite.mjs` | Writes the suites into `plugin/evals/` and `plugin/evals-chat/`. Never edit those by hand. |
| `scoreboard.mjs` | Rolls results up to one score per axis. |
| `scoreboard.md` | One row per scored version. |

## The two suites

| Suite | Surface it stands in for | MCP tools |
| --- | --- | --- |
| `plugin/evals-chat/` | Claude.ai (web, mobile) | None. The skill has to work from what the user pastes. The trigger suite lives here too, since the Skill tool is then the only way the plugin can show up. |
| `plugin/evals/` | Claude Code and Cowork | The real server's answers, recorded as mocks: an empty Career KB by default, and Alex Rivera's KB (`data/example`) for the memory cases. |

## Axes

Each grader file is named `<axis>--<check>.md`, and the scoreboard scores an axis as the
share of its verdicts that passed.

| Axis | Measures | Graders |
| --- | --- | --- |
| activation | The skill fires on job-search asks | `tool_used` on the Skill tool |
| false fires | ...and stays out of everything else (lower is better) | Same check, expected absent |
| first-reply | First answer arrives before any setup tax | LLM rubric |
| task | Fit check, résumé, cover letter, interview prep, offer, recruiter email | LLM rubric per task |
| honesty | Nothing untrue is stated about the user | LLM judge against the persona's résumé |
| surface | Right behavior for Claude.ai vs Code and Cowork | Regex |
| memory | A saved KB makes the answer specific without re-pasting, and never says the KB lacks something it holds | Regex plus LLM rubrics |
| trust | No write the user didn't ask for, on all five write tools; injected instructions ignored | `tool_used`, expected absent, plus LLM rubric |
| retention | Offers that bring the user back (morning briefing) appear once, as options | LLM rubric |
| voice | The feedback ask appears only on an accepted offer | Regex |

LLM graders put the PASS and FAIL lines first and the reference material after. With the
résumé first, the judge failed honest replies about half the time.

The judge answers with one word and no reasoning, so the rubric does the thinking for it.
Honesty graders fail only on a specific false claim about the user, and say plainly that
length, tone, rewording and "the KB doesn't show X" are not failures. A reply that wrongly
tells the user their KB lacks something is graded on the memory axis instead
(`memory--no-false-gaps`).

The judge is Opus. On 40 hand-audited replies from the 2.9.4 to 2.9.5 runs, replayed
through `claude plugin eval`, the old setup (Sonnet judge, old rubric) agreed with the audit
on 26; Sonnet with the new rubric on 26; Opus with the new rubric on 35, including all 10
memory cases (old setup: 2). It caught 12 of the 15 real fabrications; the 3 it let
through were advice nudging the user to claim something, a gray zone worth a closer rubric
later. Opus costs more per judge call, so a full run costs more too.

## Run it

`claude plugin eval` uses your Claude login and counts against your plan or API bill. A
full baseline is about 900 agent runs plus the judge calls.

```bash
npm ci && npm run build:mcp

COMMON="--trust-plugin --no-publish --model claude-sonnet-5-5 --judge-model claude-opus-5-5 -j 6"

# Activation: trigger prompts, plugin only (a no-plugin arm can't fire the skill)
claude plugin eval plugin --eval-dir evals-chat --tag trigger --ablation none --runs 3 $COMMON --json trigger.json

# Quality on Claude.ai, and on Claude Code / Cowork, each against a no-plugin baseline
claude plugin eval plugin --eval-dir evals-chat --tag quality --runs 3 $COMMON --json chat.json
claude plugin eval plugin --tag quality --runs 3 $COMMON --json tools.json

node eval-src/scoreboard.mjs trigger.json chat.json tools.json --append
```

Every number the scoreboard prints carries its n and a 95% Wilson interval, and it warns
when any case has fewer than 3 runs. Release decisions use 3 or more runs per case. Cost
lines include the judge (the results file's `costUsd` leaves it out).

To also score a cheaper model, add an arm with `--model claude-haiku-4-5-20251001` and keep
the same judge. Run from a Claude profile with no personal context (a separate
`CLAUDE_CONFIG_DIR` signed in to a clean account): eval sessions can otherwise read the
operator's own name and memory, which skews identity and honesty checks.

**Write integrity, free.** Mocks mean a scored run never touches the disk. Two lanes check
the real server instead, with no model calls: `src/__tests__/write-integrity.test.ts`
(part of `npm run test:mcp`) sends each write tool the calls the cases produce and checks
the files match the reply, and `npm run eval:replay -- <trace folder>` replays the write
calls recorded in kept eval traces.

**MCP-only profile.** `npm run eval:mcp-only` writes `plugin-mcp-only/`, the plugin with no
skills and no Skill-fired graders, so the tools suite measures what the server alone gets
right (what standalone npm users and tool-search sessions see):
`claude plugin eval plugin-mcp-only --tag quality --runs 3 $COMMON --json tools-mcp-only.json`.

For one case while iterating: `claude plugin eval plugin --case <name> --runs 1 --ablation none`.
The Actions tab has an **Evals** workflow that runs all three and uploads the results.

## Change the suite

1. Edit `personas/`, `postings/`, `trigger/` or `cases.mjs`.
2. If the server changed, `npm run eval:mocks` to re-record the mocks.
3. `npm run eval:build`, then commit the regenerated `plugin/evals*/`.

`src/__tests__/eval-suite-truth.test.ts` fails when the committed suites or mocks are out
of date, including after a version bump (`check_setup` prints the version).
