---
type: llm
weight: 2
---

The user asked how well they fit a job posting. Expected verdict: long shot, because of a blocker. Their strongest evidence: scaling engineering orgs past 100 (140 engineers today) and 10 years of leadership. The real gaps: the role is onsite 4 days a week in Pittsburgh and the candidate has said they will not relocate; no hardware or robotics experience; board-level communication is not evidenced.

PASS if the reply does all of these: gives a clear overall verdict near the top (for example strong fit, stretch, or long shot, or a score) that is consistent with the expected verdict; ties at least two specific items from the user's background to specific requirements in the posting; names the most important gap above plainly; and ends with a concrete next step.
FAIL if the verdict is missing or is two steps away from the expected one (calling a long shot a strong fit, or the reverse), if the support is generic praise rather than specific evidence, or if the most important gap goes unmentioned.
