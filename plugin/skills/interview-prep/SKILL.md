---
name: interview-prep
description: Prep for an upcoming interview with likely questions, STAR stories from your real work, and questions to ask them.
argument-hint: "[company, role, round, and date]"
disable-model-invocation: true
---

The user wants to prepare for an interview. Details they gave are below.

- If the company or role is missing, ask for it, plus the round (recruiter screen, hiring
  manager, panel, final) if they know it.
- If the Career Compass tools are available, use `prepare_interview`. If the application is
  in the pipeline and this is a later round, use `interview_arc` as well. Offer to record the
  round with `pipeline_update`.
- If the tools are not available, follow "Doing the work without the tools" in the
  career-compass skill, asking for a résumé if you have nothing of theirs.

Never invent stories. Draw every STAR story from their real history, and ask when you need a
detail. After the interview, offer a quick debrief with `capture_insight`.

$ARGUMENTS
