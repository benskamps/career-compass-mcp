# Dev Pipeline — `career-compass-mcp`

This is a **published, public npm package** with no active feature roadmap and a
solo maintainer. That combination has a failure mode: nothing is "broken," so
nothing gets touched — and meanwhile dependencies drift, security advisories
pile up, docs quietly go stale, and the next time someone opens the repo it's a
weekend of cleanup instead of a green checkmark.

There is no finish line for maintaining a package. This document exists so we
stop pretending there is one. Instead of occasional heroic "night-shift" passes,
the package gets a **steady heartbeat**: a small, safe, automated maintenance
pass on a regular cadence, forever.

This file is the pipeline. A scheduled Routine (see
[§ How it runs](#how-it-runs)) spins up a fresh session on a cadence and follows
the loop below. Because the playbook lives in the repo, it evolves the normal
way — by PR.

---

## The contract (guardrails)

These are hard rules. A run that can't proceed without breaking one of them
stops and leaves the decision to a human instead.

1. **Never `npm publish`.** Publishing is 2FA-gated and human-only. The pipeline
   prepares releases; it never ships them.
2. **Never push to `main`.** Every change lands on a branch and goes through a
   PR. CI (`build:mcp` + `test:mcp` + `pack:guard`) is the gate.
3. **Keep CI green.** No PR that reds the build. If `main` is already red,
   fixing it is the run's top priority.
4. **Never touch real data or secrets.** No `.env`, no credentials, no
   `data/career/` or `data/pipeline/`. The only career data in the repo is the
   fictional `data/example/` (Alex Rivera). The `npm-pack-leak-guard` is sacred —
   never weaken it to make a change pass.
5. **Small, single-purpose PRs.** One concern per PR (deps, or a security fix, or
   a doc fix — not all three). Reviewable in a few minutes.
6. **When in doubt, don't guess.** Ambiguous or architecturally significant?
   Open an issue or a draft PR describing the options and leave it for Ben.
7. **Leave the tree clean.** Remove any throwaway harness files. `git status`
   clean at the end of every run except the intended change.

---

## The loop (one pass)

Run these in order. It's fine — expected, even — for a pass to find nothing to
do in a category and move on. Prefer depth on one worthwhile change over breadth
across many shallow ones.

1. **Health check.** `git fetch`, check out latest `main`, `npm ci`,
   `npm run build:mcp`, `npm run test:mcp`, `npm run pack:guard`. Everything
   green? Good. Red? That's the run — diagnose and fix it, nothing else.

2. **Security.** `npm audit`. Fixable, non-breaking advisories → one PR
   (`npm audit fix`, re-run the full check, confirm green). A fix that needs a
   major bump or breaks the build → open an issue with the advisory and the
   blast radius; don't force it.

3. **Freshness.** `npm outdated`. Patch/minor bumps for direct deps → one PR,
   verified green. **Major** bumps (e.g. `typescript` 6→7, `@types/node` 25→26)
   → an issue for human review, never an autonomous merge — majors change
   behavior.

4. **Quality.** Look for one concrete, well-scoped improvement: an untested code
   path, a fragile error case, a missing edge-case test. Ship it with tests.
   Coverage should trend up, not down.

5. **Docs truth.** Spot-check that `README.md` still matches reality — tool
   counts, resource counts, CLI commands, install steps. Fix drift in a docs-only
   PR.

6. **Triage.** Any open issues/PRs? Read, label, and either act or leave a
   focused comment. Don't let them rot unacknowledged.

7. **Log the pass.** Write `docs/pipeline/<YYYY-MM-DD>.md`: what you checked,
   what you found, what you changed (PR links), and what you deliberately left
   for a human. Include it in the pass's PR (or a standalone docs PR if the pass
   was otherwise a no-op worth recording). This is the pipeline's memory.

A healthy pass is often a *small* pass. "Checked everything, bumped two patch
deps, cleared one audit advisory, logged it" is a perfect week.

---

## How it runs

A **Routine** (scheduled trigger) fires on a cadence and starts a fresh session
in this repo's remote environment. Its prompt is short by design — it points
here:

> Run the dev-pipeline maintenance pass for `career-compass-mcp`. Follow
> `docs/dev-pipeline.md` exactly — honor every guardrail, work the loop in order,
> open small PRs for changes, and write the dated run log. Do not publish. Do not
> push to main.

- **Cadence:** weekly (see the live trigger for the exact schedule).
- **Change it:** re-point or re-time the Routine via `update_trigger`; kick an
  extra pass on demand with `fire_trigger`.
- **Pause / stop it:** `update_trigger` with `enabled: false`, or `delete_trigger`
  to remove it entirely. Pausing is reversible; the playbook stays in the repo
  either way.

The point isn't the cron. It's the commitment: this package gets tended on a
rhythm, not rescued in a panic.
