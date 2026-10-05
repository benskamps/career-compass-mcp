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

- **Tailor your résumé** to one posting, plus an ATS-friendly version.
- **Write the cover letter** for a specific role, from your real experience.
- **Prep the interview:** likely questions for that round, STAR stories written out in
  full from your own work, and sharp questions to ask them.
- **Weigh an offer** against your own targets, and get the two or three points worth
  negotiating, with wording.
- **Handle the rest:** recruiter emails, rejections, interview debriefs, and working out
  why final rounds keep slipping away.

In Claude Code and Cowork it also remembers you. Your career history and every
application live as plain YAML files on your own computer. Each fit check reads your whole
record, "prep me for my Veridian final" finds that application with its rounds and
interviewers, and `/career-compass:today` gives you one "start here" move. There is no
cloud sync and no telemetry.

## What this plugin installs

- **The Career Compass MCP server** (`.mcp.json`). Claude starts it on your computer with
  `npx -y career-compass-mcp@2.9.7`, which downloads that exact published version of the
  [`career-compass-mcp`](https://www.npmjs.com/package/career-compass-mcp) package from the
  public npm registry the first time it runs. It needs **Node.js 22 or newer**.
- **Skills** in `skills/`. `career-compass` teaches Claude how to help with any job-search
  task, delivering an answer first and offering to save it after. Four more are commands
  you can type: `/career-compass:start`, `/career-compass:fit-check`,
  `/career-compass:interview-prep`, and `/career-compass:today`.

## Where it works

The MCP server is a local program, so it runs in **Claude Code** and in **Cowork sessions
that run on your computer**. There, Career Compass remembers your history and tracks your
applications.

In **claude.ai chat** on the web and mobile, the server does not run, but the skill still
helps: paste a résumé and a posting, and Claude does the fit check, tailoring, interview
prep, or offer review in the conversation. Nothing is saved between chats there.

## Getting started

Paste a job posting and your résumé, and ask **"Do I fit this?"** You get a verdict,
your evidence for each must-have, and the top gaps to address. Claude then offers to save your
résumé so the next fit check, cover letter, and interview prep start from it.

Or type a command:

| Command | What it does |
|---|---|
| `/career-compass:start` | Checks the install and sets up your career history from a pasted résumé |
| `/career-compass:fit-check` | Scores your fit for a pasted posting |
| `/career-compass:interview-prep` | Likely questions, STAR stories from your real work, and questions to ask |
| `/career-compass:today` | One "start here" move, then the rest of today's list |

You can also just ask: "Prep me for my panel interview at Acme on Friday", "I got an offer,
is it good?", or "Run the Career Compass setup check."

## Tools

Eighteen tools. Read tools only read your files; write tools ask before changing them.

| Area | Tools |
|------|-------|
| Find and assess a role | `explore_opportunity`, `research_company` |
| Apply | `tailor_resume`, `generate_cover_letter`, `format_for_ats` |
| Track the pipeline | `pipeline_view`, `pipeline_add` (write), `pipeline_update` (write), `classify_email` |
| Interview and decide | `prepare_interview`, `interview_arc`, `evaluate_offer`, `generate_rejection_response` (write) |
| Feed the knowledge base | `save_career_section` (write), `ingest_document`, `capture_insight` (write), `harvest_evidence` |
| Keep the install healthy | `check_setup` |

Full documentation: <https://github.com/benskamps/career-compass-mcp#readme>

## Privacy Policy

Your data stays on your machine. Career Compass stores your career knowledge base and job
pipeline as YAML in `~/.career-compass/`, or in the folder you choose in the plugin's
**Career data folder** setting. It sends that data nowhere on its own: it is passed only to
the Claude client you use, and only for the requests you make. When you ask
`harvest_evidence` to look at a project folder, it reads that folder's git history locally
and writes nothing.

The plugin makes two kinds of network request, and neither carries your data:

- **Installing the server:** `npx` downloads `career-compass-mcp@2.9.7` and its
  dependencies from the public npm registry.
- **Update check, only when you ask:** the `check_setup` tool can ask the public npm
  registry for the latest published version. It is off by default; Claude turns it on when
  you ask whether there is an update.

Files stay until you delete them; removing the data folder removes everything. The full
policy, covering collection, storage, sharing, retention, and contact details, is at
<https://benskamps.github.io/career-compass-mcp/privacy>. Questions or concerns:
<https://github.com/benskamps/career-compass-mcp/issues>.

## License

MIT. See [LICENSE](LICENSE).
