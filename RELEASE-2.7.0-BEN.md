# Ben — shipping 2.7.0 (everything below needs your hands; everything else is done)

**Written 2026-09-05.** Tree state at hand-off: tsc clean · 53 files / 473 passed / 1 skipped ·
pack guard 7/7 · `npm pack --dry-run` = career-compass-mcp-2.7.0.tgz, 191.4 kB, 144 files · stranger pass on the
packed tarball: 8 seams fixed + replay-verified (`~/.gstack/qa-reports/qa-report-career-compass-mcp-2026-09-05.md`) ·
`career-compass-2.7.0.mcpb` built (3.68 MB, mcpb-guard PASS). Supersedes RELEASE-2.4.1-BEN.md.

## 1. Commit + push (one commit, on main)
```bash
cd ~/projects/career-compass-mcp
git add -A -- . ':!*.mcpb'          # mcpb files are gitignored anyway
git commit -m "release: v2.7.0 — productization pass (onboarding, drawer + filter, stranger-pass seams, 31 tests)"
git push
```
Wait for CI green (both jobs): `gh run watch` or https://github.com/benskamps/career-compass-mcp/actions

## 2. npm publish (2FA = passkey; must be a REAL terminal, not Claude's shell)
```bash
npm whoami            # E401 = token expired (expected — it has every release). Then:
npm login             # browser + passkey
npm publish --ignore-scripts
```
`--ignore-scripts` is safe ONLY because prepublishOnly's gate (build + tests + pack guard) already
ran green on this identical tree. If you touch anything first, drop the flag.
A `E404 Not Found - PUT` means NOT LOGGED IN, not "package missing". Do NOT pass `--otp`
(passkeys aren't TOTP); npm prints an auth URL → press ENTER → confirm in browser.

Verify: `npm view career-compass-mcp version` → 2.7.0

## 3. Tag + GitHub release with the .mcpb attached (mirrors v2.6.1)
```bash
git tag v2.7.0 && git push origin v2.7.0
gh release create v2.7.0 career-compass-2.7.0.mcpb \
  --title "v2.7.0 — onboarding, detail drawer + filter, and the tests that prove it" \
  --notes-file <(sed -n '/^## 2.7.0/,/^## 2.6.1/p' CHANGELOG.md | sed '$d')
```
(If the process substitution misbehaves in your shell, paste the 2.7.0 CHANGELOG section into
`--notes` by hand.)

## 4. Smoke the published artifact as a stranger
```bash
cd /tmp && npx -y career-compass-mcp@2.7.0 dashboard --sample
```
Click a card → drawer opens · type in the filter → column counts follow · press `/`.

## Housekeeping you can do any time
- `rm career-compass-2.3.0.mcpb career-compass-2.4.0.mcpb` — stale, gitignored bundles.
- `git rm RELEASE-2.4.1-BEN.md` — superseded by this file (delete this one after shipping too).
- `coderabbit auth login` — the canon review pass couldn't run; the CLI isn't installed.
- Issue #17 (major dep bumps) is still open; not touched by this release.
