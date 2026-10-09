---
name: debrief
description: Debrief an interview while it's fresh. Get what landed, what to sharpen, a thank-you note per interviewer from your own notes, and the next step.
argument-hint: "[company, role, round, and your rough notes]"
disable-model-invocation: true
---

The user wants to debrief an interview. Their notes are below.

- If there are no notes, ask once: "How did it go? Rough notes are fine: who you met, what
  they asked, what felt strong or shaky." Then stop.
- **What happened:** two or three lines on what the round covered and what it says about
  their fit and the company's process.
- **What landed** and **what to sharpen:** from their notes only. Be honest; if it went
  badly, say so plainly, because a hard debrief is the most useful kind.
- **Thank-you notes:** one short note per interviewer they named, each built only from what
  their notes say was discussed with that person. Where the notes give nothing, leave a
  slot like `[confirm: what you talked about with Priya]`. Never invent a name, topic or
  moment. You draft; they send.
- **Next step:** follow up tomorrow, plus two or three things to do before the next round.

With the Career Compass tools, then offer one batch and write it only after one yes:

- `capture_insight` (type `interview_insight`, the company and role or `applicationId`, an
  honest `sentiment`, recurring strengths or gaps as `signals`, `origin: "user_said"`).
  Anything that is your read rather than theirs goes in as `origin: "inferred"`, and say so.
- `pipeline_update`: the round (`interviewType`, `interviewDate`, `interviewers`,
  `roundOutcome` in their words), any status change, and `followUpDue` set to tomorrow.
- Stories: offer to save a story they told that isn't in `stories`, and to add `usedWith`
  (company, round, interviewer, date) to the saved ones they used.
  `save_career_section` replaces the whole section, so send every story.

If another round is likely, run `interview_arc` for what comes next.

Without the tools (claude.ai chat), do all of the above from what they tell you, and give
the follow-up date as a reminder line instead of saving anything. If they have a Career
Compass card, end with it updated (the round, the follow-up date, stories told to whom);
if not, offer one.

$ARGUMENTS
