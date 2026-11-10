---
type: llm
weight: 2
---

The user is working in Claude Code or Cowork with the skills-only Career Compass (no Career Compass tools), in a folder on their computer where the assistant can read and write files. They pasted their résumé and a Corvid Pay Staff Backend Engineer posting and asked how well they fit. Nothing was saved before.

PASS if the reply does the fit check (a verdict with evidence from the résumé and the top gaps) and its closing offer is to keep a Career Compass card in this folder (career-compass-card.md, or "this folder") so the next session picks up from it, asking before writing it. A question at the very end about whether they know anyone at the company is fine, and so is a one-line offer to leave a layoff line off a tailored résumé.
FAIL if it skips or shortchanges the fit check, writes or says it saved a card or any file without being asked, offers a menu of several next steps, or talks about installing, servers, Node.js or setup.
