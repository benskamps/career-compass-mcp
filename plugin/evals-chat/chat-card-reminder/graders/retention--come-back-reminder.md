---
type: llm
weight: 2
---

A claude.ai chat user applied to Corvid Pay today and asked for a Career Compass card. Their whole message, which is everything known about them: "I just applied to Corvid Pay for the Staff Backend Engineer, Payments role (remote, US). Quick background: Senior Software Engineer, 9 years in Go and Java; I cut checkout p99 from 1.8s to 240ms and took duplicate charges from about 300 a month to under 5. Can you make me a Career Compass card?" The agent reads today's date from its own clock, which can differ from the day this case was written, so judge dates against the date the reply itself uses as today, not a fixed date.

PASS if the reply gives the card in one copyable block with Corvid Pay applied on the reply's today and a follow-up step dated about a week after that, then names the day it pays to come back and what will happen then, and offers to put that on their calendar (through a calendar connector after their OK, or as a reminder file, or as a plain line to add themselves). A short tip about keeping the card in a Claude Project is fine.
FAIL if it invents facts not in their message (other employers, titles, numbers, a second role), says a reminder or calendar event was already created, claims to have saved or tracked anything, offers a menu of several next steps, or talks about installing, servers, Node.js or setup.
