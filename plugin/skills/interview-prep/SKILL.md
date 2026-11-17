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

Interviewers increasingly score answers against set questions, so every story needs a
clear situation, what they did, and a result from their history. Close by offering a
practice round, and run it by the career-compass skill's "Practice interview" method: one
question at a time, then after each answer the three checks (situation, their own action,
a result), the follow-up a real interviewer would ask, and a tighter version from their
own words, until a short wrap-up after four or five questions.

Never invent stories. Use their saved `stories` first, word for word, skipping any that
`usedWith` shows this interviewer has already heard; draw new STAR stories only from their
real history, ask when you need a detail, and offer to save the new ones. After the
interview, offer a debrief (the debrief skill; in chat, they just ask).

$ARGUMENTS
