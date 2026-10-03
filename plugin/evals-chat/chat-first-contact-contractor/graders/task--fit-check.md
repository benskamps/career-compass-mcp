---
type: llm
weight: 2
---

The user asked how well they fit a job posting. Expected verdict: strong or stretch. Their strongest evidence: React and TypeScript, WCAG 2.1 AA work, Jest, and the insurance quote form rebuild. The real gaps: the pattern of short contracts will draw questions about a full-time move; design systems are not shown.

PASS if the reply does all of these: gives a clear overall verdict near the top (for example strong fit, stretch, or long shot, or a score) that is at most one step from the expected verdict on the scale strong, stretch, long shot; ties at least two specific items from the user's background to specific requirements in the posting; names the most important gap above plainly; and ends with a concrete next step.
FAIL if the verdict is missing or is two steps away from the expected one (calling a long shot a strong fit, or the reverse), if the support is generic praise rather than specific evidence, or if the most important gap goes unmentioned.
