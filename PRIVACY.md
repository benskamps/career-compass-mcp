# Privacy Policy — Career Compass MCP

**Last updated:** 2026-10-07
**Applies to:** the `career-compass-mcp` MCP server, its bundled local dashboard, and the
Career Compass plugin's skills in every Claude app, all versions.

---

## The short version

Career Compass runs entirely on your own computer. It has no server and no account. Your
career history and job pipeline are plain YAML files in a directory you choose. Nothing is
uploaded, and there is nothing for us to collect, store, sell, or hand over — because your
data never reaches us in the first place.

The server makes one outbound network request of its own, and only when you ask for it:
the `check_setup` tool asks the public npm registry whether a newer version has been
released. It sends nothing about you. Details under [Update checks](#update-checks).
Commands you run yourself with `npx`, such as the dashboard command `check_setup` prints,
are separate requests: npm downloads the package, and nothing about you is sent.

In claude.ai chat (web, desktop and mobile) only the plugin's skills load, as instructions
to Claude. The server does not run there, so Career Compass stores nothing and sends
nothing. Details under [In claude.ai chat](#in-claudeai-chat).

---

## What data the software handles

Career Compass reads and writes the career information *you* give it:

- **Career knowledge base** — name, contact details, work history, skills, education,
  projects, testimonials, and a dated journal of your own notes.
- **Job pipeline** — the roles you're tracking, their status, salary ranges you record,
  recruiter and hiring-manager contact details you enter, interview dates, and your notes.
- **Text you paste in** — job postings, emails, offer letters, performance reviews, and
  similar documents you hand to a tool.
- **Git history of a project folder you name** — only when you ask `harvest_evidence` to
  look at one. It reads that folder's commit history locally (commit authors, dates, and
  which files each commit touched) to report what you measurably did there. It writes
  nothing, anywhere, and sends nothing.

## Where it is stored

In a single directory on your machine, set by the `CAREER_DATA_PATH` environment variable
(in the plugin, the **Career data folder** setting). The default is `~/.career-compass/`. Files are ordinary YAML you can open, edit, back up,
or delete with any text editor. While a write is in progress the folder also briefly holds a
`.write-claim` file naming the process doing the writing, so a second Career Compass process
(a dashboard, or a server registered in two clients) refuses rather than overwriting it. It is
deleted when the write finishes, contains no personal data, and is safe to remove by hand.
Each write also leaves a timestamped `.bak` copy of the
previous version in the same directory. Only the newest 5 `.bak` files per data file are
kept; older ones are deleted automatically on the next write. Backups you make by hand are
never touched.

**We never receive this data.** There is no Career Compass account, no cloud sync, no
backup service, and no telemetry or analytics of any kind. The only request the server
makes to the internet on its own is the version check described below, which carries none
of it.

## Update checks

The `check_setup` tool reports the health of your install, and part of that report is
whether you are running the current release. To answer that it makes a single HTTPS GET to
the public npm registry:

```
https://registry.npmjs.org/career-compass-mcp/latest
```

Precisely what that involves:

- **What is sent.** The package name, in the URL. That is all. No account, no identifier,
  no career data, no pipeline data, no request body, no cookies, and no authentication
  header. It is the same request `npm view career-compass-mcp` makes, and npm's registry
  sees it the same way it sees anyone browsing a public package page. Your IP address is
  visible to the registry, as it is to any website you open.
- **What comes back.** The published metadata for the latest version. Career Compass reads
  one field from it — the version number — and discards the rest.
- **When it happens.** Only while `check_setup` is running, and only if its
  `checkForUpdates` parameter is true. It is false by default, so a setup check Claude runs
  on its own stays offline; Claude turns it on when you ask about updates. No other tool
  makes it, nothing makes it on startup, on a schedule, or in the background.
- **How to keep it off.** Do nothing: without `checkForUpdates: true` the rest of the
  health check runs normally and no request is constructed.
- **When it fails.** If you are offline, behind a proxy, or the registry is slow, the
  check times out after a few seconds and the report says it could not check. It is never
  an error and it never blocks the rest of the report.

The npm registry is operated by npm, Inc. (GitHub/Microsoft) under its own privacy policy:
https://docs.npmjs.com/policies/privacy

Career Compass runs nothing on a schedule. Any schedule, such as a morning briefing, is
one you create yourself in your own Claude app; it runs locally on your computer and only
reads.

Separately, `check_setup` also checks whether your local dashboard is running by requesting
`http://127.0.0.1:<port>/`. That is a loopback request to your own machine; it never
reaches the network.

## Who else sees it

Career Compass is an MCP server, so it answers a client you connect it to — normally Claude
Code, or Cowork on your computer. When you ask Claude to tailor a resume or prep an interview, the
relevant parts of your career data are passed to that client, and from there to the model
provider under **their** privacy policy, not this one:

- Anthropic's privacy policy: https://www.anthropic.com/legal/privacy

That is the only path by which your data leaves your machine, it happens because you asked
for it, and it is governed by the terms of whichever client and model provider you chose.
Career Compass itself sends none of your data anywhere — its one outbound request asks the
npm registry about a version number and carries nothing else.

The bundled local dashboard (`career-compass-mcp dashboard`) serves pages from
`127.0.0.1` on your own machine, renders them with no external assets, and makes no
network calls. Starting it means running it, usually with `npx`, which downloads the
package from the npm registry as described above.

If you start the dashboard with `--ask-claude`, its buttons run Claude Code on your
computer. Claude Code sends the Career KB content it reads to Anthropic, under your own
Claude account and billing, like any other Claude Code session. It is off unless you pass
the flag, and read-only unless you start it with `--ask-claude-writes`.

## In claude.ai chat

The Career Compass plugin is also offered in claude.ai chat on the web, desktop and mobile.
There, only its skills load: plain-text instructions that tell Claude how to do a fit
check, tailor a résumé, or prep an interview from what you paste into the conversation. The
MCP server above does not run in chat, so:

- nothing is written to your computer or anywhere else by Career Compass, and nothing
  carries over between chats;
- Career Compass makes no network requests, not even the update check;
- what you paste, and Claude's replies, are part of your Claude conversation, handled by
  Anthropic under its privacy policy (https://www.anthropic.com/legal/privacy) exactly as
  any other chat is. We never see it.

## Untrusted text

Job postings, emails, and documents you paste in are third-party content. Career Compass
wraps them in a clearly-marked, nonce-delimited block before they reach the model, so text
inside them is presented as quoted evidence rather than as instructions. This reduces the
risk that a malicious posting can direct the model to act against you, but no such measure
is absolute. Treat pasted content from unknown sources with the same care you would apply
anywhere else.

## Data retention

Your files stay on your disk until you delete them. The one exception is backups: only the
newest 5 `.bak` files per data file are kept, and older ones are deleted automatically.
There is no retention period on our side because we hold nothing. To remove everything, delete your `CAREER_DATA_PATH`
directory (including the `.bak` files and any leftover `.write-claim`) and uninstall the package.

## Third-party sharing

None. We do not share, sell, rent, or disclose your data, because we never receive it.
There are no advertisers, analytics providers, data brokers, or subprocessors involved.

## Children

Career Compass is a job-search tool intended for adults in the workforce and is not
directed at children under 13.

## Changes to this policy

Changes are published in this file in the public repository, with the date at the top
updated. The version history is visible in git.

## Contact

- **Issues and questions:** https://github.com/benskamps/career-compass-mcp/issues
- **Maintainer:** Ben Schippers — https://github.com/benskamps
