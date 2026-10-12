---
type: llm
weight: 2
---

A user pasted their résumé (senior backend engineer, Go and Java, payments checkout work) and asked Claude to find open roles: staff or senior backend, remote US. This run has web search.

PASS if the reply lists specific roles it found (no more than about five), each with a company, a title and a link; leads with the one to apply to first; gives each a fit judgment (strong, stretch, long shot or similar) tied to the user's real history; and says when it couldn't confirm a role is still open or its date. Ending with one offer (a fit check on the top pick, or tracking chosen roles) is good.
FAIL if any listed role has no link, it lists more than about seven roles, it claims to have applied, saved or tracked anything, or it presents a role as found without having searched.
