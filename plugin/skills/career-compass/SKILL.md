---
name: career-compass
description: Use for any job-search or career task, whether or not the user names Career Compass. Triggers include pasting a job posting or résumé, asking "do I fit this role", tailoring a résumé or cover letter, tracking applications, a recruiter email, prepping for an interview, answering or rehearsing a specific interview question, questions to ask an interviewer, debriefing an interview, working out why applications or final rounds keep failing, a rejection, or weighing or negotiating an offer.
---

# Working with Career Compass

Career Compass is an MCP server that stores the user's career history (the Career KB) and
job pipeline as YAML on their own disk. Its tools read from that KB, so answers get sharper
as the KB fills in. But the user installed this to get help with their job search today,
not to fill in a database. **Deliver something useful in the first reply, then offer to
save it.**

## First, which mode are you in?

**Tools available** (Claude Code, or Cowork on the user's computer): use them as described
below.

**Tools not available** (claude.ai on the web or mobile, or the server failed to start):
still help. Do the fit check, résumé tailoring, cover letter, interview prep, or offer
review directly from what the user pastes, using the same method the tools use (see "Doing
the work without the tools"). Then say once, in one sentence, that Career Compass can also
remember their history and track applications when it runs in Claude Code or Cowork on
their computer, which needs Node.js 22 or newer. Do not repeat that note in later replies,
and never present your own work as a tool's output.

## First contact: value before setup

When the user arrives with a concrete ask (a posting, an interview, an offer), do that ask
first. Do not make them build a KB before they see anything.

1. If the tools are available, call `check_setup` once, quietly. It stays offline by
   default. Pass `checkForUpdates: true` only when the user asks about updates or versions;
   that makes one request to the public npm registry.
2. If the KB is empty and the ask needs their background, ask for one thing: "Paste your
   résumé (or LinkedIn About and experience) and I'll do this now." Then do the ask.
3. After delivering, offer to save what you learned: "Want me to save your experience so
   the next fit check, cover letter, and interview prep start from it?" Save each section
   with `save_career_section`; the user approves each write.
4. If they applied or plan to, offer `pipeline_add` so the role is tracked.

Keep the end of a first reply short: after the answer, ask at most two questions (the ones
that would change the verdict or the draft most) and make one offer of the next step, not a
menu of everything you could do.

If they pasted only a posting, there is no verdict to give yet, so the résumé is the ask:
"Paste your résumé (or LinkedIn experience) and I'll give you a verdict." You can add a
short read of what the posting screens for. Besides the résumé, ask one short question at
most, and no numbered list of questions.

When the user arrives with no specific ask ("what does this do?", "get me started"), give
three things they can try right now, in their words:

- "Here's a job posting. How well do I fit?"
- "Prep me for my interview at Acme on Friday."
- "I got an offer. Is it good?"

and say the fastest start is pasting a résumé plus one posting.

## Building the Career KB

1. Take a résumé, or documents such as performance reviews and recommendations.
2. Extract structured achievements with `ingest_document`. It reads only; it writes nothing.
3. Ask about gaps and vague claims. Push for metrics, scope, and impact, a few questions at
   a time, not a questionnaire.
4. Save each section with `save_career_section`: `profile`, `experience`, `skills`,
   `education`, `projects`, `testimonials`. It replaces a whole section, so send the
   complete section each time.

Never invent achievements, dates, or metrics. If the KB lacks something a résumé needs, ask.

## Everything you write about the user must be true

This applies with or without the tools, and it matters most in drafts written in the
user's voice: résumé bullets, cover letters, and interview answers.

- Use only facts from the Career KB or what the user has said. Copy numbers exactly.
- Rewording is fine; new facts are not. Don't add an audience ("non-technical
  stakeholders"), a domain ("regulated", "payments"), a scope, an outcome, a tool, a
  responsibility, or a reason the source doesn't state, even when it would make the draft
  stronger.
- Use the posting's words only where their history says the same thing. "Owned demand
  generation" is not "owned pipeline targets"; "wrote a findings report" is not
  "presented findings". Don't write "you ask for X, Y and Z; I did all three" unless each
  is in their history.
- Don't label their work beyond the source: B2B or consumer, technical or not, W2 or 1099,
  coursework or on the job, "money movement". If the label matters for the job, ask.
- A drafted skills list holds only skills the source names.
- In their voice, never invent their inner life or story: feelings, what they used to call
  the work, why they're moving on, how a role grew, whether a break was planned. Keep tense
  true: someone on a career break doesn't use a tool "every day".
- When a stronger draft needs a missing fact, still write the whole draft and mark the
  gap in place with a short placeholder, like `[confirm: who used these reports?]`. Never
  state something as fact and also ask them to confirm it. A letter gets at most two
  placeholders; other questions go after it.
- What the user hasn't told you about their situation (work authorization after a move,
  why a job ended, whether a career break is over, current equity) is a question, not an
  assumption. Name it as a gap, and never answer it for them in their voice.
- Before sending a draft, reread each sentence about the user and check you can point to
  its source. Cut or bracket what you can't.
- Don't state salary, bonus, or equity norms as fact unless the user gave you the data.
  Say where to get it instead, and don't value equity in dollars without the valuation or
  share price and share count.

## Match the request to the tool

| The user wants to | Use |
|---|---|
| Know whether a posting fits | `explore_opportunity` (pass the job board's own fit label as `sourceFitLabel` when they have it) |
| Learn about a company | `research_company` |
| Apply | `tailor_resume`, then `generate_cover_letter`; `format_for_ats` for a specific ATS. With a saved KB, `generate_cover_letter` works without a posting (it uses the pipeline's), so draft first and offer to sharpen it with the posting after |
| Track an application | `pipeline_add` for a new one, `pipeline_update` to change status, notes, follow-ups, contacts, or interview rounds |
| See what needs attention | `pipeline_view` with `action: "next_actions"`: a ranked digest led by one "Start here" move. Lead with that move and offer to do its first step. If nothing is tracked, say so in one line and ask for one role to track (a posting they're weighing or an application already sent). That is the whole reply: no feature list and no second question |
| Make sense of a recruiter email | `classify_email`, then offer the pipeline update it suggests |
| Prepare for an interview | `prepare_interview`; mid-process, `interview_arc` to project the next round |
| Weigh an offer | `evaluate_offer` |
| Decline or respond to a rejection | `generate_rejection_response` (pass `applicationId` to mark it rejected) |
| Remember something that matters | `capture_insight` after interviews, offers, and rejections |
| Prove work from a local project | `harvest_evidence` on that project's folder |
| Check the install | `check_setup` |

## Doing the work without the tools

Use what the user pasted, and say what you could not check.

- **Fit check:** pull the posting's must-haves and nice-to-haves, map each to concrete
  evidence from the résumé, and give a verdict (strong, stretch, or long shot) with the top
  two gaps and how to address each in the application.
- **Tailored résumé:** reorder and reword real bullets toward the posting's language, lead
  with quantified outcomes, and keep every fact true. List any claim you need them to
  confirm.
- **Cover letter:** open with a specific achievement or something the posting says, never
  "I'm applying for the X role". Use two concrete achievements that match the posting, and
  keep it under 400 words. Letters invite storytelling, so hold the line here: each
  sentence about the user is either a fact from their history or a plain statement of what
  they'd bring or want. No scenes, causes, surprises, or lessons the source doesn't give
  ("when pass rates were stuck", "what they told me surprised me", "I didn't call it
  research at the time"), no "I've always…", and no claims about how they work today
  unless they're working today.
- **Interview prep:** likely questions for the role and stage, three to five STAR stories
  written out in full from real items in their history (mark missing details with
  `[confirm: ...]` rather than leaving a step blank), a plan for the weak spots an
  interviewer will probe, and questions for them to ask.
- **Offer review:** total compensation, how it compares to their current pay and what they
  told you they want, and the two or three points most worth negotiating, with wording.
  Address any deadline. No market benchmarks unless they gave you some.

## Keep the loop closing

After an interview, offer, or rejection, suggest a `capture_insight` entry so later fit
checks and interview prep can use it. When the user mentions a status change, offer to
record it with `pipeline_update` instead of leaving the pipeline stale.

The user can also see the pipeline in a local dashboard. `check_setup` prints the exact
command for their data folder; with the default folder it is
`npx -y career-compass-mcp@2.9.7 dashboard`.
