---
type: llm
weight: 2
---

The user is in Claude Cowork on their computer and installed the Career Compass plugin, but its tools are not available in this session.

PASS if the reply still does the fit check from what was pasted (a verdict with evidence), and says once, briefly, that the Career Compass card (kept in their folder, or pasted back) is what carries this to the next session, or that this session won't be remembered, naming either the full version (the `/plugin marketplace add` command) or a likely reason its local helper didn't start (such as Node.js), without blaming the user.
FAIL if it tells the user to switch to Claude Code or Cowork (they are already there), claims to have saved anything, or skips the fit check.
