# Career Compass

![Career Compass icon](.claude-plugin/icon.png)

**Honest fit checks for any job posting, and drafts built on your real work.**

Paste a job posting and your résumé, and ask **"Do I fit this?"** You get a straight
verdict (strong, stretch, or long shot), each of the posting's must-haves matched to real
evidence from your background, and the top two gaps with how to address them in your
application. You'll know whether to apply and what to fix first. No setup, no account.

## Try it now

Just installed it and not sure what to type? Open a new chat and send whichever of these
fits where you are. Each one works on its own in claude.ai chat, Cowork and Claude Code.

**You have a job in mind.** Send this, with your résumé and the posting pasted or attached
underneath (a PDF is fine):

```
Here's my résumé and a job I'm considering. Do I fit this?
```

**You only have your résumé.**

```
Here's my résumé. What roles does it support today, and what would a screener skip?
```

**You have neither at hand.** See a full fit check on a made-up profile first, with nothing
of yours shared. [Open it in Claude](https://claude.ai/new?q=Show%20me%20a%20sample%20Career%20Compass%20fit%20check.),
or send:

```
Show me a sample Career Compass fit check.
```

## It won't make things up

Résumés, cover letters, and interview answers are written
from what you've actually done. When a detail is missing, like a number or a team size,
the draft shows a `[confirm: …]` placeholder for you to fill in instead of inventing one.
Offer reviews use only market data you provide, and say where to find more.

**Measured, not claimed.** We gave Claude 13 chat tasks for 8 fictional job seekers: fit
checks, résumé tailoring, cover letters, interview prep, an offer, a recruiter email, a
rejection, company research, and "what do I do today". Each task ran three times with
Career Compass and three times with plain Claude, and a strict AI judge checked every reply
against that person's résumé.

| | With Career Compass | Plain Claude |
|---|---|---|
| Nothing untrue said about you | **33 of 39** | 23 of 39 |
| Did the job that was asked | **33 of 39** | 16 of 39 |

The judge fails a reply for any claim the résumé doesn't support, including a stronger
verb in a draft ("adopted" becoming "shipped"), a motive you never stated, or a skill
borrowed from the posting. The six misses with Career Compass were of that kind; none
added an employer, a title, a credential or a number. So read the drafts before you send them, and fill in the `[confirm: …]` spots.
(Career Compass 2.11.2, October 2026. The cases and judge rubrics are in
[eval-src](https://github.com/benskamps/career-compass-mcp/tree/main/eval-src).)

Then it carries the whole search:

- **Tailor your résumé** to one posting, plus a version laid out for applicant tracking
  systems.
- **Write the cover letter** for a specific role, from your real experience.
- **Prep the interview:** likely questions for that round, three to five STAR stories
  written out in full from your own work, and sharp questions to ask them.
- **Weigh an offer** against your own targets, and get the two or three points worth
  negotiating, with wording.
- **Turn your git history into résumé evidence:** in Claude Code or Cowork, ask "Look at
  my project in ~/code/my-app and tell me what I can honestly claim on my résumé." It reads
  that project's git history on your computer, reports what you measurably did there with
  the command behind each number, and asks what the log can't know before drafting a bullet.
- **Handle the rest:** recruiter emails, rejections, interview debriefs, application form
  questions, and working out why final rounds keep slipping away.

In Claude Code and Cowork it also remembers you. Your career history and every
application live as plain YAML files on your own computer. Each fit check reads your whole
record, "prep me for my Veridian final" finds that application with its rounds and
interviewers, and `/career-compass:today` gives you one "start here" move. There is no
cloud sync and no telemetry.

## Where it works

| Where | What you get |
|---|---|
| **claude.ai chat** (web, desktop, mobile) | The skills only. Paste a résumé and a posting, and Claude does the fit check, tailoring, interview prep, or offer review in the conversation. A short Career Compass card carries your roles and dates into your next chat (keep it in a "Job search" Project and every chat there starts from it), and Claude can put your next follow-up on your calendar. |
| **Claude Code**, and **Cowork sessions on your computer** | The skills plus a local server that remembers your history and tracks your applications. Needs **Node.js 22 or newer**. |

## Getting started

Paste a job posting and your résumé, and ask **"Do I fit this?"** You get a verdict,
your evidence for each must-have, and the top gaps to address. In Claude Code and Cowork,
Claude then offers to save your résumé so the next fit check, cover letter, and interview prep
start from it. In claude.ai chat it offers a short Career Compass card instead, to paste into
your next chat. No posting yet? Ask for **"a sample Career Compass fit check"** first.

**Commands, in Claude Code and Cowork.** In claude.ai chat, just ask in plain words
("prep me for my interview on Friday"); the same skills apply.

| Command | What it does |
|---|---|
| `/career-compass:start` | Checks the install and sets up your career history from a pasted résumé, or shows what to try first |
| `/career-compass:fit-check` | A fit verdict for a pasted posting |
| `/career-compass:interview-prep` | Likely questions, STAR stories from your real work, and questions to ask |
| `/career-compass:today` | One "start here" move, then the rest of today's list |
| `/career-compass:debrief` | Right after an interview: what landed, what to sharpen, and a thank-you note per interviewer from your own notes |
| `/career-compass:week` | Your week: what moved, stalled or closed, your pace, and one focus for next week |
| `/career-compass:sweep` | Checks your inbox and calendar (through connectors you already use) for job-search mail and invites, then updates applications in one batch you approve. Never sends email |
| `/career-compass:find` | Finds open roles that match you, ranks the best few against your real history with a link to each, and skips what you already track. Never applies for you |
| `/career-compass:feedback` | Turns something it got wrong into a short report with your personal details taken out, shows you every word, and gives you a link to send it to the maker. Nothing is sent unless you send it |
| `/career-compass:answer` | Answers an application form's questions from your real history, within each character limit |

You can also just ask: "Prep me for my panel interview at Acme on Friday", "I got an offer,
is it good?", or "Run the Career Compass setup check."

## Where your files live

In Claude Code and Cowork your history and pipeline are kept in `~/.career-compass/`. To
keep them somewhere else, such as inside a folder you already back up, change the plugin's
**Career data folder** setting (`data_path`). Leave it at the default unless you have a
reason to move it.

## Tell me what it got wrong

There is no telemetry, so I only hear about a bad fit check if you say so.
[What did your first fit check get wrong?](https://github.com/benskamps/career-compass-mcp/issues/new?template=fit-check-wrong.yml)
is a short form; leave out anything personal. What you used it for, or what was missing,
is welcome in [Discussions](https://github.com/benskamps/career-compass-mcp/discussions).

## Privacy Policy

Your data stays on your machine. Career Compass stores your career knowledge base and job
pipeline as YAML in `~/.career-compass/`, or in the folder you choose in the plugin's
**Career data folder** setting. It sends that data nowhere on its own: it is passed only to
the Claude client you use, and only for the requests you make. When you ask
`harvest_evidence` to look at a project folder, it reads that folder's git history locally
and writes nothing.

The plugin makes one kind of network request, and it carries none of your data:

- **Installing the server:** `npx` downloads `career-compass-mcp@2.14.0` and its
  dependencies from the public npm registry.

The server itself makes no network requests.

Files stay until you delete them, apart from older backups: only the newest 5 `.bak` files
per data file are kept. Removing the data folder removes everything. The full policy,
covering collection, storage, sharing, retention, and contact details, is at
<https://benskamps.github.io/career-compass-mcp/privacy>. Questions or concerns:
<https://github.com/benskamps/career-compass-mcp/issues>.

## What this plugin installs

- **The Career Compass MCP server** (`.mcp.json`). Claude starts it on your computer with
  `npx -y career-compass-mcp@2.14.0`, which downloads that exact published version of the
  [`career-compass-mcp`](https://www.npmjs.com/package/career-compass-mcp) package from the
  public npm registry the first time it runs. It needs **Node.js 22 or newer**.
- **Skills** in `skills/`. `career-compass` teaches Claude how to help with any job-search
  task, delivering an answer first and offering to save it after. The others are the
  commands above.

<details>
<summary><b>The nineteen tools</b></summary>

Read tools only read your files; write tools ask before changing them.

| Area | Tools |
|------|-------|
| Find and assess a role | `explore_opportunity`, `research_company` |
| Apply | `tailor_resume`, `generate_cover_letter`, `format_for_ats`, `answer_application` |
| Track the pipeline | `pipeline_view`, `pipeline_add` (write), `pipeline_update` (write), `classify_email` |
| Interview and decide | `prepare_interview`, `interview_arc`, `evaluate_offer`, `generate_rejection_response` (write) |
| Feed the knowledge base | `save_career_section` (write), `ingest_document`, `capture_insight` (write), `harvest_evidence` |
| Keep the install healthy | `check_setup` |

Full documentation: <https://github.com/benskamps/career-compass-mcp#readme> ·
how it works: <https://benskamps.github.io/career-compass-mcp/how-it-works/>

</details>

## License

MIT. See [LICENSE](LICENSE).
