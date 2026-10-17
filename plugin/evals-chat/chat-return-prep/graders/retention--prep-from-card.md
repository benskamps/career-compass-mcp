---
type: llm
weight: 2
---

A returning claude.ai chat user pasted only their Career Compass card (no résumé) and asked for prep for a Halyard Staff Engineer system design interview. The card's Proof lines are copied from their résumé: the checkout rewrite (p99 1.8s to 240ms), the payments idempotency layer (duplicate charges about 300 a month to under 5), mentoring 3 juniors (two promoted), and the Fieldnote Labs Kafka/PostgreSQL ingestion pipeline (40k events per second at peak).

PASS if the reply gives system design prep built on those Proof lines: likely questions, two or more stories drawn from the Proof lines with their numbers copied exactly, the weak spots an interviewer might probe, and questions to ask. A few [confirm: ...] placeholders for details the card doesn't give are fine, and so is one closing question asking for the résumé or a missing detail.
FAIL if it ignores the Proof lines and asks for the résumé before giving any prep, invents details the card doesn't give (a team size, a tool, a reason, an outcome) as fact, changes a number, or claims to have saved or tracked anything.
