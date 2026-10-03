---
type: llm
weight: 2
---

The user asked how well they fit a job posting. Expected verdict: strong or stretch. Their strongest evidence: the payments idempotency layer, Go and Java, Kafka, and 9 years of backend work. The real gaps: Kubernetes is not on the résumé; staff-level cross-team technical leadership is only partly evidenced (mentoring, a service rewrite); PCI DSS is not shown.

PASS if the reply does all of these: gives a clear overall verdict near the top (for example strong fit, stretch, or long shot, or a score) that is consistent with the expected verdict; ties at least two specific items from the user's background to specific requirements in the posting; names the most important gap above plainly; and ends with a concrete next step.
FAIL if the verdict is missing or is two steps away from the expected one (calling a long shot a strong fit, or the reverse), if the support is generic praise rather than specific evidence, or if the most important gap goes unmentioned.
