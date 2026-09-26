---
name: career-compass
description: Use when the user is job hunting or managing their career with Career Compass, for example setting up their Career KB from a résumé, checking fit for a job posting, tailoring a résumé or cover letter, tracking applications, prepping an interview, or weighing an offer.
---

# Working with Career Compass

Career Compass is an MCP server that stores the user's career history (the Career KB) and
job pipeline as YAML on their own disk. Every tool reads from that KB, so the quality of
every answer depends on the KB being filled in.

## First, check the install

If the Career Compass tools are not available, the server is not running on this surface.
It runs locally, in Claude Code and in Cowork sessions on the user's computer, and needs
Node.js 22 or newer. Say so plainly rather than improvising the tools' output.

When the user is new, or something seems off, call `check_setup` first. It reports the data
folder, which KB sections are filled in, and whether the pipeline parses. It stays offline
by default. Pass `checkForUpdates: true` only when the user asks about updates or versions;
that makes one request to the public npm registry.

## Build the Career KB before using it

If `check_setup` shows empty sections, set up the KB before tailoring anything:

1. Ask for a résumé, or for documents such as performance reviews and recommendations.
2. Extract structured achievements with `ingest_document`. It reads only; it writes nothing.
3. Ask about gaps and vague claims. Push for metrics, scope, and impact.
4. Save each section with `save_career_section`: `profile`, `experience`, `skills`,
   `education`, `projects`, `testimonials`. It replaces a whole section, so send the
   complete section each time. The user approves each write.

Never invent achievements, dates, or metrics. If the KB lacks something a résumé needs, ask.

## Match the request to the tool

| The user wants to | Use |
|---|---|
| Know whether a posting fits | `explore_opportunity` (pass the job board's own fit label as `sourceFitLabel` when they have it) |
| Learn about a company | `research_company` |
| Apply | `tailor_resume`, then `generate_cover_letter`; `format_for_ats` for a specific ATS |
| Track an application | `pipeline_add` for a new one, `pipeline_update` to change status, notes, follow-ups, contacts, or interview rounds |
| See what needs attention | `pipeline_view` |
| Make sense of a recruiter email | `classify_email`, then offer the pipeline update it suggests |
| Prepare for an interview | `prepare_interview`; mid-process, `interview_arc` to project the next round |
| Weigh an offer | `evaluate_offer` |
| Decline or respond to a rejection | `generate_rejection_response` (pass `applicationId` to mark it rejected) |
| Remember something that matters | `capture_insight` after interviews, offers, and rejections |
| Prove work from a local project | `harvest_evidence` on that project's folder |

## Keep the loop closing

After an interview, offer, or rejection, suggest a `capture_insight` entry so later fit
checks and interview prep can use it. When the user mentions a status change, offer to
record it with `pipeline_update` instead of leaving the pipeline stale.

The user can also see the pipeline in a local dashboard. `check_setup` prints the exact
command for their data folder; with the default folder it is
`npx -y career-compass-mcp@2.9.3 dashboard`.
