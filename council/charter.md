# Council charter

## Scope of every sitting

1. **The ten hillclimb axes** (from the satisfaction hillclimb plan):

| # | Axis | Question it answers |
|---|---|---|
| 1 | Discovery | Can the right person find it in the directory, and does the card make them install? |
| 2 | Activation | After install, does it actually fire and start on the first real ask? |
| 3 | First reply | Is the first answer valuable on its own, before any setup? |
| 4 | Core task quality | Are fit checks, résumés, letters, prep and offer reviews genuinely good? |
| 5 | Honesty | Does everything written about the user stay true? |
| 6 | Surface fit | Does it behave right on claude.ai chat (skills only), Cowork and Claude Code? |
| 7 | Memory | Does the Career KB make later answers sharper without false gaps? |
| 8 | Reliability | Does install, startup and every tool work without surprises? |
| 9 | Retention | Is there a reason to come back tomorrow and next week? |
| 10 | Voice of user | Do we hear from users at all, without telemetry? |

2. **Expansion**: features, use cases and delighters the product should add, cut or reshape.

## Scoring

Each member scores only the axes on their beat (and may score others if they have evidence),
1–5:

- 5: best in class; nothing on this axis is in the top 20 things to do
- 4: good; one or two clear gaps
- 3: works, but a user would notice the gap
- 2: a real user is probably lost here
- 1: broken or absent

Every score cites evidence: a `file:line`, an eval result, a metric, or a quoted string.
A score without evidence is dropped in synthesis.

## Output each member writes

```
## <Member role>
### Axis scores
| Axis | Score | Evidence |
### Top recommendations (max 6, ranked)
For each: title · axis · impact (H/M/L) · effort (S/M/L) · confidence (H/M/L) ·
owner (prompt thread | product/code | listing/docs | Ben) · what to do · why (evidence) ·
how we'd know it worked (an eval case, a metric, or a check)
### Features and use cases to add (max 4)
### Delighters (max 3) — small, surprising, cheap
### What I'd cut or stop doing (max 2)
### Disagreements I expect from other members
```

## Synthesis rules

1. Merge duplicates; a recommendation raised by 2+ members gets a consensus mark.
2. Rank by `impact × confidence ÷ effort`, then break ties toward axes with the lowest
   median score.
3. Anything that edits tool descriptions, skills, MCP prompts or server instructions is
   routed to the prompt-quality thread, not edited by the council session.
4. Constraints every recommendation must respect: no telemetry ever, bootstrapped (no paid
   acquisition or fundraising), user data stays on the user's disk, the truth rule.
5. Record dissent: if a member objects to a top-5 item, say so next to it.
6. Compare with the previous `runs/*.md`: which items landed, which axis scores moved.
