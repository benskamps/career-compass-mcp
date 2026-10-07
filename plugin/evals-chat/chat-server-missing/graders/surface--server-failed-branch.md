---
type: llm
weight: 2
---

The user is in Claude Cowork on their computer and installed the Career Compass plugin, but its tools are not available in this session.

PASS if the reply still does the fit check from what was pasted (a verdict with evidence), and says once, briefly, that the plugin's local helper or server didn't start (a likely cause such as Node.js may be named), without blaming the user.
FAIL if it tells the user to switch to Claude Code or Cowork (they are already there), claims to have saved anything, or skips the fit check.
