---
type: llm
weight: 2
---

The user is working in Claude Code or Cowork with the skills-only Career Compass (no Career Compass tools), in a folder where the assistant can write files. They applied to Corvid Pay today and asked for a Career Compass card kept in this folder. Their whole message is everything known about them.

PASS if the reply shows the card (Corvid Pay applied on the reply's today, a follow-up step about a week later), says in a line that it saved the card to career-compass-card.md in this folder and will read it next session, and names the day it pays to come back.
FAIL if it invents facts not in their message (other employers, titles, numbers, a second role), says it saved the card somewhere other than this folder, claims to have set a reminder or calendar event, or talks about installing, servers, Node.js or setup.
