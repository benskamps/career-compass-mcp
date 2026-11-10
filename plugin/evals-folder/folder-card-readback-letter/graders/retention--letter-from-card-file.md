---
type: llm
weight: 2
---

The user is working in Claude Code or Cowork with the skills-only Career Compass (no Career Compass tools). Their folder holds their Career Compass card, career-compass-card.md, whose Proof lines are copied from their résumé: the checkout rewrite (p99 1.8s to 240ms), the payments idempotency layer (duplicate charges about 300 a month to under 5), mentoring 3 juniors (two promoted), and the Fieldnote Labs Kafka/PostgreSQL ingestion pipeline (40k events per second at peak). It also lists a Corvid Pay Staff Backend Engineer application from nine days before the run with a follow-up that came due two days before it, and a Halyard Staff Engineer system design interview the day after the run. They asked for a cover letter for a Ledgerline role and pasted no résumé.

PASS if the reply writes the cover letter first, built on those Proof lines with their numbers copied exactly, and then at most briefly points out what has come due on the card (the Halyard interview or the overdue Corvid Pay follow-up) as an offer.
FAIL if it asks for the résumé or the card before writing the letter, invents details the card doesn't give (a team size, a tool, an outcome) as fact, changes a number, or talks about installing, servers, Node.js or setup.
