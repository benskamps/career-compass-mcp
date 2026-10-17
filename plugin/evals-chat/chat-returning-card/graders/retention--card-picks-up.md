---
type: llm
weight: 2
---

The user pasted their Career Compass card from an earlier chat and asked for a cover letter for a Ledgerline Senior Backend Engineer role. Their card shows a Halyard system design interview on 2026-10-18 and a Corvid Pay follow-up that was due 2026-10-12. The case was written for 2026-10-17, when the interview was tomorrow and the follow-up overdue; the agent reads today's date from its own clock, so if the reply treats a later day as today, the interview may already have happened and that is a correct reading, not an error.

PASS if the reply writes the cover letter first, built on facts from the card or the résumé facts it carries, and then briefly (a line or two) points out what needs attention by its own date: the Halyard interview (upcoming, or how it went if already past) and/or the overdue Corvid Pay follow-up, offering to help rather than doing it unasked.
FAIL if it skips or shortchanges the letter, drafts the full interview prep or follow-up without being asked, mentions neither the interview nor the follow-up, or claims to have saved or tracked anything.
