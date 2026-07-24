---
title: Privacy Policy — Career Compass MCP
permalink: /privacy
---

# Privacy Policy — Career Compass MCP

**Last updated:** 2026-07-24
**Applies to:** the `career-compass-mcp` MCP server and its bundled local dashboard, all versions.

---

## The short version

Career Compass runs entirely on your own computer. It has no server, no account, and no
network calls of its own. Your career history and job pipeline are plain YAML files in a
directory you choose. Nothing is uploaded, and there is nothing for us to collect, store,
sell, or hand over — because your data never reaches us in the first place.

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
backup service, and no telemetry or analytics of any kind. The software makes no outbound
network requests.

## Who else sees it

Career Compass is an MCP server, so it answers a client you connect it to — normally Claude
Desktop or Claude Code. When you ask Claude to tailor a resume or prep an interview, the
relevant parts of your career data are passed to that client, and from there to the model
provider under **their** privacy policy, not this one:

- Anthropic's privacy policy: https://www.anthropic.com/legal/privacy

That is the only path by which your data leaves your machine, it happens because you asked
for it, and it is governed by the terms of whichever client and model provider you chose.
Career Compass itself sends nothing anywhere.

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
