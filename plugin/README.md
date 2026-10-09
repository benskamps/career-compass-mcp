# Career Compass

![Career Compass icon](.claude-plugin/icon.png)

**Honest fit checks for any job posting, and drafts built on your real work.**

Paste a job posting and your résumé, and ask **"Do I fit this?"** You get a straight
verdict (strong, stretch, or long shot), each of the posting's must-haves matched to real
evidence from your background, and the top two gaps with how to address them in your
application. You'll know whether to apply and what to fix first. No setup, no account.

**It won't make things up.** Résumés, cover letters, and interview answers are written
from what you've actually done. When a detail is missing, like a number or a team size,
the draft shows a `[confirm: …]` placeholder for you to fill in instead of inventing one.
Offer reviews use only market data you provide, and say where to find more.

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
| **claude.ai chat** (web, desktop, mobile) | The skills only. Paste a résumé and a posting, and Claude does the fit check, tailoring, interview prep, or offer review in the conversation. Nothing is saved between chats. |
| **Claude Code**, and **Cowork sessions on your computer** | The skills plus a local server that remembers your history and tracks your applications. Needs **Node.js 22 or newer**. |

## Getting started

Paste a job posting and your résumé, and ask **"Do I fit this?"** You get a verdict,
your evidence for each must-have, and the top gaps to address. Claude then offers to save your
résumé so the next fit check, cover letter, and interview prep start from it.

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

The plugin makes two kinds of network request, and neither carries your data:

- **Installing the server:** `npx` downloads `career-compass-mcp@2.11.0` and its
  dependencies from the public npm registry.
- **Update check, only when you ask:** the `check_setup` tool can ask the public npm
  registry for the latest published version. It is off by default; Claude turns it on when
  you ask whether there is an update.

Files stay until you delete them, apart from older backups: only the newest 5 `.bak` files
per data file are kept. Removing the data folder removes everything. The full policy,
covering collection, storage, sharing, retention, and contact details, is at
<https://benskamps.github.io/career-compass-mcp/privacy>. Questions or concerns:
<https://github.com/benskamps/career-compass-mcp/issues>.

## What this plugin installs

- **The Career Compass MCP server** (`.mcp.json`). Claude starts it on your computer with
  `npx -y career-compass-mcp@2.11.0`, which downloads that exact published version of the
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
