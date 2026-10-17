---
type: llm
weight: 2
---

A claude.ai chat user pasted their résumé, said they applied to Corvid Pay today for a Staff Backend Engineer, Payments role, and asked for a Career Compass card. The agent reads today's date from its own clock, so judge dates against the date the reply itself uses as today.

PASS if the reply gives the card in one copyable block that includes several of their résumé bullets copied word for word (or cut short with "…", never reworded or merged), each with the employer it belongs to, plus the Corvid Pay application dated the reply's today with a follow-up step about a week later.
FAIL if the card has no résumé bullets, rewords or merges a bullet, attaches a bullet to the wrong employer, changes a number, adds anything not in the résumé or message, or claims to have saved or tracked anything.
