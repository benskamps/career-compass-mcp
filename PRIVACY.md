# Privacy Policy — Career Compass MCP

**Last updated:** 2026-08-08
**Applies to:** the `career-compass-mcp` MCP server and its bundled local dashboard, all versions.

---

## The short version

Career Compass runs entirely on your own computer. It has no server and no account. Your
career history and job pipeline are plain YAML files in a directory you choose. Nothing is
uploaded, and there is nothing for us to collect, store, sell, or hand over — because your
data never reaches us in the first place.

There is exactly one outbound network request in the whole package, and only when you ask
for it: the `check_setup` tool asks the public npm registry whether a newer version has
been released. It sends nothing about you. Details under [Update checks](#update-checks).

---

## What data the software handles

Career Compass reads and writes the career information *you* give it:

- **Career knowledge base** — name, contact details, work history, skills, education,
  projects, testimonials, and a dated journal of your own notes.
- **Job pipeline** — the roles you're tracking, their status, salary ranges you record,
  recruiter and hiring-manager contact details you enter, interview dates, and your notes.
- **Text you paste in** — job postings, emails, offer letters, performance reviews, and
  similar documents you hand to a tool.

## Where it is stored

In a single directory on your machine, set by the `CAREER_DATA_PATH` environment variable.
The default is `~/.career-compass/`. Files are ordinary YAML you can open, edit, back up,
or delete with any text editor. Each write also leaves a timestamped `.bak` copy of the
previous version in the same directory.

**We never receive this data.** There is no Career Compass account, no cloud sync, no
backup service, and no telemetry or analytics of any kind. The only request the software
ever makes to the internet is the version check described below, which carries none of it.

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
  `checkForUpdates` parameter is true. No other tool makes it, nothing makes it on
  startup, on a schedule, or in the background.
- **How to turn it off.** Call `check_setup` with `checkForUpdates: false`. The rest of
  the health check runs normally and no request is constructed.
- **When it fails.** If you are offline, behind a proxy, or the registry is slow, the
  check times out after a few seconds and the report says it could not check. It is never
  an error and it never blocks the rest of the report.

The npm registry is operated by npm, Inc. (GitHub/Microsoft) under its own privacy policy:
https://docs.npmjs.com/policies/privacy

Separately, `check_setup` also checks whether your local dashboard is running by requesting
`http://127.0.0.1:<port>/`. That is a loopback request to your own machine; it never
reaches the network.

## Who else sees it

Career Compass is an MCP server, so it answers a client you connect it to — normally Claude
Desktop or Claude Code. When you ask Claude to tailor a resume or prep an interview, the
relevant parts of your career data are passed to that client, and from there to the model
provider under **their** privacy policy, not this one:

- Anthropic's privacy policy: https://www.anthropic.com/legal/privacy

That is the only path by which your data leaves your machine, it happens because you asked
for it, and it is governed by the terms of whichever client and model provider you chose.
Career Compass itself sends none of your data anywhere — its one outbound request asks the
npm registry about a version number and carries nothing else.

The bundled local dashboard (`career-compass-mcp dashboard`) serves pages from
`127.0.0.1` on your own machine, renders them with no external assets, and makes no
network calls.

## Untrusted text

Job postings, emails, and documents you paste in are third-party content. Career Compass
wraps them in a clearly-marked, nonce-delimited block before they reach the model, so text
inside them is presented as quoted evidence rather than as instructions. This reduces the
risk that a malicious posting can direct the model to act against you, but no such measure
is absolute. Treat pasted content from unknown sources with the same care you would apply
anywhere else.

## Data retention

Your files stay on your disk until you delete them. There is no retention period on our
side because we hold nothing. To remove everything, delete your `CAREER_DATA_PATH`
directory (including the `.bak` files) and uninstall the package.

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
