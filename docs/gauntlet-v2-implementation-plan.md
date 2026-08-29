# Gauntlet v2 — Implementation Plan (every action)

> Source: `docs/architecture-audit.md` @ `c23793b`. This is the executable form of §13.
> Every task names its file, its fix shape, and its **negative control** (the test that
> fails if the fix regresses). Nothing here is a product ruling — Gate 7 items are flagged
> `[BEN]` and excluded from the implementation team's scope.

## Work packages (file-disjoint, so they parallelize without merge conflict)

Legend: **NC** = negative control (the test that must go red if the fix is removed).

---

### WP-1 · Storage core `[src/storage/*]` — owns P1-1 backend, P1-2, P2-2, two P3s

1. **`mutateCareerSection(section, mutator)`** — a mirror of `mutatePipeline` (`file-store.ts:411`): load → mutate → save, the whole cycle **inside** `withDataLock` + `withWriteClaim`. Export it; keep `saveCareerSection` for whole-section replaces but route read-modify-write callers through the mutator. *(This is the door WP-5 needs.)*
   **NC:** a probe test firing two `mutateCareerSection("profile", …)` concurrently must keep both fields (port probe 1 from scratchpad). Reintroduce the outside-lock read → red.
2. **Rename-sidecar break** (`write-claim.ts:230-235`): replace the unconditional `rm` + `wx` with — rename the stale claim to `.write-claim.breaking.<uuid>` (one renamer wins, losers get ENOENT), the winner `rm`s its sidecar and races the `wx` create.
   **NC:** port probe 2 (two-process stale-break) — must yield exactly one winner. Old algorithm → `{aWon:true,bWon:true}`.
3. **Liveness before TTL** (`write-claim.ts:109-114`): check `pidAlive` before the TTL-staleness verdict, so a live-but-stalled holder is not broken; keep TTL as the dead-pid / cross-machine backstop.
   **NC:** a test where a live holder older than TTL is NOT broken; a dead holder older than TTL IS broken.
4. **P3** — `pipeline.ts:150` `handleUpdate` stamps `dateUpdated` unconditionally, defeating `mutatePipeline`'s no-op skip. Stamp only when a field actually changed. *(pipeline.ts is a tool file — coordinate boundary with WP-4; assign the `handleUpdate` diff to WP-1 since it's about the storage skip.)*
5. **P3** — `serialize.ts:24` `chains` map never pruned: delete a key's entry when its chain settles to empty.
   **NC:** a test asserting the map is empty after N serialized ops complete.

### WP-2 · Prompt fence `[src/prompts/*, src/untrusted.ts, boundary test]` — owns P1-3

6. **Fence the prompts**: wrap `posting`, `notes`, `offerDetails`, `marketData` at `prompts/index.ts:26,30,74,118,120` in `embedUntrusted` (same nonce fence the tools use), contract-before-payload.
7. **Extend the structural test**: `untrusted-boundary.test.ts:145` must scan `src/prompts/` as well as `src/tools/*.ts`, using the same `UNTRUSTED_ARGS` list.
   **NC (the whole point):** add a bare `${posting}` to any prompt → the suite goes red. Today it stays green.
8. **P3** — `untrusted.ts:66-70` claims the clamp guards on-disk growth "at the tool boundary" but clamping is render-time only; either clamp `postingText` before persist (`pipeline.ts:106`) or correct the comment to match reality (render-time clamp, disk holds raw). Pick the honest one.

### WP-3 · Resources `[src/resources/*]` — owns P2-1, P2-3, P3s

9. **Watcher survives directory death** (`live.ts:151-158`): detect the self-referential rename (filename resolves to the watched dir) or an ENOENT on the dir → close that watcher, and re-arm lazily on the next event/subscribe.
   **NC:** port probe 4b — after `rm` + recreate, a write must produce exactly one notification, and the event-storm must not occur.
10. **Journal gets a URI** (`live.ts:39-47`): add the `journal.yaml → career://journal` entry to `FILE_TO_URI` so `capture_insight` dirties `career://full`.
11. **Register `career://journal`** in `resources/career-kb.ts` (the read handler, mirroring the other section resources).
    **NC:** subscribe to `career://full`, call `capture_insight`, assert a notification fires. Remove the `FILE_TO_URI` entry → red.
12. **P3** — `completions.ts:1-2` dead imports (`completable`, `z`); `completions.ts:38-42` false id-shape premise comment; four comments naming `career://application/{id}` (the real template is `career://pipeline/{id}`) at `completions.ts:104-122`, `resources/career-kb.ts:182-200`, `pipeline.ts:404-406`, `career-kb.ts:234-235`. Fix comments + remove dead imports. *(pipeline.ts/career-kb.ts comment-only edits — one-line, coordinate with WP-1/WP-4 by keeping to the exact comment lines.)*

### WP-4 · Tool error parity `[src/tools/*, tool-annotations test]` — owns P2-4 backend, P2-5, P2-6, P3

13. **`generate_rejection_response` handler** (`career-kb.ts:256`): wrap the `mutatePipeline` call in the same `isCorruptDataError`/`isWriteClaimUnavailable` handling every `pipeline.ts` site has, so a refusal is a sentence, not a transport error.
14. **Shared read-wrapper** for the bare `loadPipeline()` calls at `interview.ts:38,159,296` and the resource handlers (`resources/career-kb.ts:19-227`) — one helper that turns corrupt/unavailable into the named message. *(Resource-handler edits overlap WP-3's file — assign the resource-handler read-wrapper to WP-3, the interview.ts calls to WP-4, to keep files disjoint.)*
15. **Sample-store refusal gets a typed error** (`atomicWriteYaml:179-184`): throw a typed `ReadOnlyStoreError` instead of a plain `Error`, and catch it in `pipeline_add` (`pipeline.ts:378`) so the read-only-demo refusal is a sentence.
16. **P2-6** — add `save_career_section` to `KNOWN_WRITERS` and the `ARGS` map in `tool-annotations.test.ts:52-83`, so the biggest writer is inside the truth-net.
    **NC:** flip `save_career_section`'s `readOnlyHint` to true → the annotation truth test goes red.

### WP-5 · Dashboard `[dashboard/*]` — owns P1-1 frontend, P2-4 copy, P2-7 copy, P2-9 charts — **DEPENDS ON WP-1**

17. **Route the onboarding actions through `mutateCareerSection`** (`actions.ts:21-43`): the load-merge-save becomes one mutator call inside the lock. This is the P1-1 fix.
    **NC:** port probe 1 as a dashboard-suite test — two concurrent actions must both survive.
18. **Refusal copy** (`step-salary.tsx:24-26` and siblings `step-targets`, `step-skills`): surface the claim's who-holds-it message instead of the blanket "Failed to save. Please try again."
19. **Kanban empty-state copy** (`kanban-board.tsx:65`): `manage_pipeline` → the real tool names (`pipeline_add` / `pipeline_update`).
20. **Analytics charts** (`components/analytics/`): `excitement-vs-outcome.tsx:17` — add `type="number"` to the `XAxis` (and label the `YAxis` stages), fix the silent-vanish on `data.length<2`; adopt the app's warm palette over stock Tailwind (`theme.ts:14-25`) so charts stop going neon in dark mode; reconcile the "7 stages active" vs "5 stages" taxonomy (`analytics/page.tsx:40`); label the two mystery kanban badges.
21. **P3** — `dashboard/lib/data.ts:8-10` re-implements `getDataDir`; import from the shared source instead. `theme.ts:59-65` hand-written second funnel order — derive from the shared `STATUS_ORDER` or document why it diverges.

### WP-6 · Build / CI / copy / P3 sweep `[ci.yml, README, bin/cli.ts, package.json, dashboard-lite/render.ts, docs]`

22. **CI builds what users run** (`ci.yml:74`): the dashboard job runs `npm run build:dashboard` (which chains `stage-standalone.mjs`), not bare `npx next build`; add a staging-completeness assertion.
    **NC:** delete the staging step from `build:dashboard` → CI goes red. Today it stays green.
23. **README truth** (`README.md:194,206`): remove "Drag to advance stages" / "kanban drag" (no drag exists) or gate it behind a `[BEN]` decision to build drag; fix "Exploring" → "Discovered"; `bin/cli.ts:115` repeats the drag claim — fix there too.
24. **`docs-truth` covers dashboard copy**: extend `docs-truth.test.ts` to scan dashboard user-facing strings against the live tool list (would have caught `manage_pipeline`).
25. **Aged-store honesty** (`dashboard-lite/render.ts`): a store untouched for N days must not say "in play right now" with fresh-looking KPIs; surface staleness (last-write age banner, or dim the "active" framing past a threshold). *(This is P2-10; it's dashboard-lite, file-disjoint from WP-5's `dashboard/`.)*
26. **P3 sweep** — `render.ts:15-17` Cowork/`sendPrompt` comment describes code that doesn't exist (delete); `loopback-guard.ts:87-88` trailing-dot `localhost.` false-403 (add `localhost.` to `ALLOWED_HOSTNAMES` or strip a single trailing dot before compare — fail-closed, availability fix); `stage-standalone.mjs:49-50` no freshness check (write a `.staged` marker with the build hash, compare in `cli.ts:103-104`); add `PRIVACY.md` to the `files` allowlist (`package.json:10-17`); `prompts/index.ts:13` format `"creative"` vs tool `functional` (reconcile); visual harness gains Next empty/aged shots (`scripts/visual-harness.mjs`).

### WP-7 · Executable-spec consolidation `[lifecycle-spec.test.ts]` — **DEPENDS ON WP-1, WP-3, WP-4, WP-5** (runs LAST)

27. Port the §11 v2 deltas into the spec as **behavioural** tests (not greps): `LostUpdate` unreachable for *all* writers (not just pipeline); `Breaking → Writing` single-winner; `Breaking → Unavailable` lost-break-race; `RefusedReadOnly` state; `Unavailable → Rendered: told plainly` asserted by behaviour on every surface incl. the dashboard. Replace the two grep-shaped tests (`:126-133`, `:138-147`) with behavioural equivalents.
28. Fix the soft-skip at `lifecycle-spec.test.ts:107` (hard-assert a live foreign pid, like `write-claim.test.ts:83`).

---

## Gate 7 — `[BEN]` rulings, OUT of the implementation team's scope

- **Next dashboard: freeze-as-spec-quarry or keep investing.** The team fixes its bugs regardless; it does not delete or freeze it.
- **MCP Apps spike** (does a local stdio server render a `ui://` App in Claude Desktop?) — a half-day investigation that gates the whole App enrichment lane. Run before any board build.
- **Frontier enrichments** (daily-ritual prompts, elicitation guards, the `ui://` pipeline board) — net-new features from the "enrich every surface" agenda. **Unblocked only after WP-2 lands** (prompts must be fenced before they multiply). Sequenced after remediation.
- **Analytics: fix in place vs. rebuild inside the App** — the team fixes in place (WP-5 #20); a rebuild is Ben's call.

## Sequencing

- **Wave 1 (parallel, worktrees, MCP-side, root node_modules only):** WP-1, WP-2, WP-3, WP-4.
- **Wave 2 (after WP-1 lands `mutateCareerSection`):** WP-5 (dashboard), WP-6 (CI/copy/P3).
- **Wave 3 (after 1+2 integrate):** WP-7 (executable spec), then full `npm test`, then one PR.
- Integrator: lead session. Each package = one worktree branch → merged to `gauntlet-v2/remediation` → single PR for Ben's nod.
