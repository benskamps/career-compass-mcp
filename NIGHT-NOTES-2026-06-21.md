# Night Notes — 2026-06-21

Tier-A hygiene + verification pass on `career-compass-mcp` (night-shift lane). No
runtime/feature changes; no publish; no secrets touched.

---

## 1. End-to-end MCP smoke — PASS

Two layers were exercised against the bundled **Alex Rivera** example data
(`data/example/`), with `CAREER_DATA_PATH` pointed at it.

### Layer A — existing unit/integration suite (`npm run test:mcp`)

```
Test Files  5 passed (5)
Tests       49 passed (49)
```

Covers: file-store (incl. fail-closed on corrupt data), pipeline handlers,
CLI version, and the npm-pack leak guard.

### Layer B — live stdio end-to-end harness

A throwaway MCP client was connected over stdio to the **built** server
(`build/src/index.js`) — the real handshake/transport path Claude uses — and the
three requested tool families were exercised against Alex Rivera:

```
23 passed, 0 failed (23 checks)
```

What each surface returned, high level:

| Surface | Result |
|---|---|
| Handshake / `initialize` | OK |
| `listTools` | 11 tools registered (incl. tailor_resume, manage_pipeline, prepare_interview, evaluate_offer, explore_opportunity) |
| `listResources` | 8 resources |
| `listPrompts` | 3 prompts |
| `read career://profile` | Returns Alex Rivera's profile (reads example YAML) |
| `read career://full` | 10,161-char consolidated KB |
| **Resume** — `tailor_resume` | Returns the tailoring scaffold with the **full KB inlined** (Alex Rivera) + the supplied posting (Veridian Health). 11,369 chars. |
| **Pipeline** — `manage_pipeline` stats | Renders "Pipeline Statistics", counts **8** example applications |
| **Pipeline** — list / get / next_actions | Table renders; known sample company present; `get demo-006` round-trips; next_actions renders |
| **Interview** — `prepare_interview` | Returns prep content referencing the company + role |
| **Interview/Offer** — `evaluate_offer` | Returns offer-evaluation content |

**Architecture note (not a defect):** the resume/interview/opportunity/offer
tools are *prompt-scaffold* tools by design — they load the real KB from disk and
return a structured prompt for Claude to act on; the LLM does the generation. The
pipeline tools (`manage_pipeline`, `classify_email`) are the deterministic
read/write layer over `applications.yaml`. The smoke verified the deterministic
layer's output **and** that the scaffold tools correctly hydrate from the example
KB.

**Data integrity:** the harness performed reads only (stats/list/get/next_actions
+ scaffold tools); `git status` confirmed `data/example/` was left byte-identical.
Harness files (`e2e-smoke.mjs`, `dump-list.mjs`) were temporary and were removed —
no residue in the working tree.

> One harness self-bug was caught and fixed mid-run: the first id-extraction regex
> assumed 8-hex application IDs, but the example data uses human-readable slugs
> (`demo-001`…`demo-008`). Fixed the harness, not the product. Final run is 23/23.

---

## 2. Branch pruning — 3 local branches deleted (all confirmed-merged)

Every branch was verified merged **before** deletion via two independent signals:
the merged-PR record (`gh pr list --state merged`) and patch-equivalence
(`git cherry main <branch>` → 0 unmerged).

### Local branches deleted (`git branch -d`, safe mode)

| Branch | Merge proof | Action |
|---|---|---|
| `codex/audit-fixes` | PR #6 merged 2026-06-14; ancestor of HEAD; 0 unmerged-by-patch | **Deleted** (was 9ed558b) |
| `polish/v2-rewrite` | PR #3 merged 2026-04-04; direct ancestor of main; 0 unmerged | **Deleted** (was dbd39f6) |
| `docs/readme-truth-and-trust` | PR #7 merged 2026-06-14 (also #5); 0 unmerged-by-patch | **Deleted** (was eee0131) |

Notes:
- `polish/v2-rewrite` was checked out in a worktree at `.worktrees/polish`. The
  worktree was **clean** (no uncommitted work) and its tip was a direct ancestor of
  main — the worktree was removed first, then the branch deleted.
- `docs/readme-truth-and-trust` deleted with a benign warning ("merged to
  `origin/docs/readme-truth-and-trust` but not yet merged to HEAD") — expected for a
  squash-merged branch; merge is confirmed by PR #7 + `git cherry` = 0 unmerged.

Remaining local branches: **`main` only.**

### Remote branches — VERIFIED merged, deletion RECOMMENDED (not performed)

Per lane rules, remote branches were not deleted. All four are confirmed fully
merged (0 unmerged-by-patch vs `origin/main`, each tied to a merged PR):

| Remote branch | Merged PR | Recommendation |
|---|---|---|
| `origin/codex/audit-fixes` | #6 | safe to delete |
| `origin/docs/readme-truth-and-trust` | #7 (and #5) | safe to delete |
| `origin/chore/npm-pack-exclude-tests-and-harden-guard` | #9 | safe to delete |
| `origin/test/npm-pack-leak-guard` | #8 | safe to delete |

Suggested cleanup (Ben's call): `git push origin --delete <branch>` for each, or
prune via the GitHub UI.

---

## 3. Out of scope (honored)

- **No `npm publish`** — Tier C, blocked on npm 2FA passkey. Not attempted.
- **No secrets / `.env`** touched.
- No source/runtime changes; this lane was verification + branch hygiene only.

---

*Lane: night-shift TOOLS / career-compass-mcp · Tier A · status: done.*
