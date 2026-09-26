# Career Compass

**A local-first career co-pilot for Claude.**

Career Compass keeps your whole career history as plain YAML files on your own computer,
then uses it to tailor résumés to a posting, score how well you fit a role, write cover
letters, track every application from first look to offer, prep you for each interview
with STAR stories drawn from your real work, and weigh offers against your own targets.

There is no account, no cloud sync, and no telemetry.

## What this plugin installs

- **The Career Compass MCP server** (`.mcp.json`). Claude starts it on your computer with
  `npx -y career-compass-mcp@2.9.2`, which downloads that exact published version of the
  [`career-compass-mcp`](https://www.npmjs.com/package/career-compass-mcp) package from the
  public npm registry the first time it runs. It needs **Node.js 22 or newer**.
- **One skill** (`skills/career-compass`) that teaches Claude the working order: set up
  your Career KB first, save each section, then use it for fit checks, applications,
  interviews, and offers.

## Where it works

The MCP server is a local program, so it runs in **Claude Code** and in **Cowork sessions
that run on your computer**. In claude.ai chat on the web and mobile, the skill loads but
the server does not, so the tools are unavailable there.

## Getting started

1. Install the plugin.
2. Ask Claude: **"Run the Career Compass setup check."** This reports your data folder,
   which Career KB sections are filled in, and anything to fix.
3. Say: **"Set up my Career KB. Here's my résumé:"** and paste your résumé. Claude
   extracts your history and asks you to approve each section as it is written to disk.

Then try "How well do I fit this posting?", "Prep me for my panel interview at Acme on
Friday", or "What needs attention in my pipeline today?".

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
pipeline as YAML in `~/.career-compass/`, or in the folder named by the
`CAREER_DATA_PATH` environment variable. It sends that data nowhere on its own: it is
passed only to the Claude client you use, and only for the requests you make.

The plugin makes two kinds of network request, and neither carries your data:

- **Installing the server:** `npx` downloads `career-compass-mcp@2.9.2` and its
  dependencies from the public npm registry.
- **Update check:** the `check_setup` tool asks the public npm registry for the latest
  published version. Calling it with `checkForUpdates: false` skips the request.

Files stay until you delete them; removing the data folder removes everything. The full
policy, covering collection, storage, sharing, retention, and contact details, is at
<https://benskamps.github.io/career-compass-mcp/privacy>. Questions or concerns:
<https://github.com/benskamps/career-compass-mcp/issues>.

## License

MIT. See [LICENSE](LICENSE).
