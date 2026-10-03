---
name: today
description: See what needs attention in your job search today, such as follow-ups due, upcoming interviews, and stale applications, in priority order.
disable-model-invocation: true
---

The user wants to know what needs attention in their job search today.

- If the Career Compass tools are available, call `pipeline_view` and give a short priority
  list: what is due or overdue, upcoming interviews, and applications that have gone quiet,
  each with one concrete action. Offer to make any status change with `pipeline_update`.
- If the pipeline is empty, say so in one line and offer to add the roles they are pursuing
  with `pipeline_add`, one at a time.
- If the tools are not available, explain in one sentence that tracking needs Career
  Compass running in Claude Code or Cowork on their computer, then offer to help with a
  specific posting, interview, or offer instead.

$ARGUMENTS
