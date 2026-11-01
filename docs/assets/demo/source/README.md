Every word on screen is real. The demo shows the claude.ai chat path: the Career Compass skills and no MCP tools.

- The user's message is `material/prompt.md`: the skill's own sample résumé (fictional Alex Rivera, from `plugin/skills/career-compass/sample-profile.md`), the Ledgerline posting (`material/posting.txt`) and "Do I fit this?". The résumé is shown collapsed to its first lines.
- The skill panel is an excerpt of the "Doing the work without the tools" fit-check rule in `plugin/skills/career-compass/SKILL.md`.
- The reply is an excerpt of `material/reply.md`, Claude's whole reply from one run of `material/capture.sh` on career-compass 2.15.1. `material/tools.txt` lists that run's tool calls: one Skill call and nothing else.

Cuts are marked "…" and nothing is reworded.

To re-capture the reply: `bash docs/assets/demo/source/material/capture.sh` from the repo root. It runs `claude -p` with the plugin loaded, only the Skill tool allowed and no MCP servers, the same setup as the `plugin/evals-chat` suite. Use the first run; re-running until a reply looks better would make the demo a pick. If the reply changes, update the excerpts in `index.html` to match.

`index.html` is a deterministic timeline (`window.seek(t)`, no wall-clock). Open `index.html?play` to preview it in a browser.

To re-render: `node docs/assets/demo/source/render.mjs` from the repo root. It needs playwright, a Chromium (`CHROMIUM=/path/to/chrome` if it isn't at /opt/pw-browsers) and ffmpeg, and makes no network calls. It writes demo.mp4, demo.gif and poster.png. Optional env vars: `GIF_FPS`, `DITHER`, `CRF`.
