---
name: feedback
description: Tell Career Compass's maker what it got wrong. Turns what happened into a short report with your personal details taken out, shows you every word, and gives you a link to send it. Nothing is sent unless you send it.
argument-hint: "[what went wrong, in your words]"
disable-model-invocation: true
---

The user wants to report something Career Compass got wrong or could do better. Career
Compass has no telemetry, so this report is the only way its maker hears about it. What
they said is below.

1. **Know what happened.** Use what they said and, when it happened in this conversation,
   what you can see of it. If you can't tell what went wrong, ask one thing: "What did it
   say, and what should it have said?" That is the whole reply.
2. **Draft the report in general terms.** It will be a public GitHub issue, so it carries
   no one's identity:
   - No names, emails, phone numbers, addresses, links to their profiles, or salary
     figures.
   - No employer, school, client or product names, theirs or the posting's. Describe them
     instead: "a mid-size insurer", "a senior data role at a fintech", "a state
     university".
   - No pasted résumé, posting, email or card text. Paraphrase the part that matters
     ("it said I had no SQL; my résumé lists SQL under Skills").
   The draft has four parts:
   - **Where:** claude.ai chat (web, desktop or mobile), Cowork, Claude Code, another MCP
     app, or "Not sure". Only what they said; never guess it.
   - **What went wrong:** the one closest option from this list, word for word:
     "The verdict was wrong (strong fit / stretch / long shot)", "It missed something I
     have, or said I lack something I have", "It said something about me that isn't true",
     "The gaps or advice weren't useful", "It asked too many questions, or the wrong one",
     "A draft (résumé, cover letter, reply) was off", "A role search listed bad, dead or
     made-up postings", "It forgot something, or the Career Compass card was wrong",
     "It talked about setup or tools I don't have", "Something else".
   - **Details:** what they asked for, what it said, and what it should have said, in
     three to six plain lines. Only what they told you or what you can see: no theories
     about why it went wrong, no numbers you worked out, and no metrics from their
     résumé (say "a high-volume event pipeline", not its throughput).
   - **Version:** with the Career Compass tools, the version `check_setup` reports; else
     leave it out.
3. **Show it, then the link.** Show the whole draft in one code block, then one line:
   "This is everything the report says. Change anything you like, then open
   https://github.com/benskamps/career-compass-mcp/issues/new?template=fit-check-wrong.yml,
   pick the matching options, paste the details into the box and press Submit (you'll
   need a free GitHub account). Nothing is sent unless you send it." Give the link
   exactly as written, with nothing added to it. They can also say it in
   [Discussions](https://github.com/benskamps/career-compass-mcp/discussions) instead.
4. **Fix it now if you can.** If what went wrong happened in this conversation and you can
   see the right answer, give the corrected version after the link, in a line or two, or
   offer to redo it.

Don't open the link, submit, or post anything for them, and never add a detail they
didn't give. If they'd rather not use GitHub, give the draft alone and stop.

$ARGUMENTS
