# Ben — what only you can do for the 2.4.1 release

**Written 2026-08-19. Everything below this line needs your hands. Everything else is done.**

Context: an outside user (issue #34) could not write a single Career KB section on
the published v2.4.0. `save_career_section` refused every call. It is the only tool
that populates the KB, so a fresh install could never leave the empty state and every
downstream tool had nothing to read. **npm still serves the broken 2.4.0 until you
publish.**

---

## 1. The publish (this is the real blocker — needs your 2FA)

```bash
cd ~/projects/career-compass-mcp
git checkout main && git pull --ff-only

# sanity: version should read 2.4.1
node -p "require('./package.json').version"

npm publish            # prompts for your 2FA / passkey
```

`prepublishOnly` automatically runs `build:mcp`, the full MCP test suite, and the
pack leak guard, so a broken tree cannot publish. If the passkey prompt misbehaves,
see the note in auto-memory: `reference_npm_publish_2fa_passkey_gotcha.md`.

**That whole gate was already run on this exact tree and passes** — `tsc` clean,
335 passed / 1 skipped, pack guard 7/7. `npm pack --dry-run` produces
`career-compass-mcp-2.4.1.tgz`, 131.2 kB, 103 files. Nothing should stand between
you and the publish except the 2FA prompt.

Verify it landed:

```bash
npm view career-compass-mcp version      # expect 2.4.1
```

## 2. Reply to the reporter (your account, your voice)

I deliberately did not post as you. A draft is ready at
`.github/ISSUE-34-REPLY.md` in this repo. To post it:

```bash
gh issue comment 34 --body-file .github/ISSUE-34-REPLY.md
gh issue close 34 --reason completed     # only after publishing
```

Edit the draft first if the voice is not yours. **Do not close #34 before the npm
publish** — the reporter's install is still broken until 2.4.1 is live.

## 3. Optional: the MCPB bundle

Only if you distribute the bundle for the directory listing:

```bash
npm run pack:mcpb
npm run pack:mcpb:guard
```

---

## What is already done (no action needed)

- **PR #35** — the fix, CI green. Merged to main.
- **PR #36** — the 2.4.1 version bump. Merged to main.
- Root cause: `data` was `z.unknown()`; zod emits `{}` for that, a required
  property with no `type`, so clients send it as a JSON string and the section
  schema refuses it. Fixed by declaring a real `object | array | string` union
  **and** parsing JSON strings in the handler.
- **Regression tests**: 8 of 9 fail with the fix reverted.
- **Class-wide guard**: `src/__tests__/tool-params-are-typed.test.ts` fails if any
  tool, present or future, ever advertises an untyped parameter again.
- **Swept for more of the same**: all 17 tools audited — `save_career_section.data`
  was the only untyped parameter; there are now zero.
- **Drove the whole product end-to-end** after the fix: populated all six KB
  sections, then called all 17 tools. 23 calls, 0 errors. `check_setup` now reports
  "All sections populated," and `tailor_resume` / `prepare_interview` genuinely read
  the saved data back.

## Known, not fixed, not urgent

- 7 dependabot PRs open on this repo, plus issue #17 (TypeScript 7 / @types/node 26
  major bumps needing human review). Untouched — separate lane.
- gstack has an upgrade available (1.60.1.0 → 1.67.2.0).
