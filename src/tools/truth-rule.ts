/**
 * The one honesty rule every tool that drafts words in the user's voice carries.
 *
 * The offline evals (eval-src/) found the failure is rarely a made-up job. It is
 * embroidery: a drafted bullet that adds an audience ("for non-technical
 * stakeholders"), a domain ("a regulated launch", "a money-movement product"), an
 * outcome the résumé never claimed, a rounded-up tenure, or an assumption about the
 * user's situation ("that chapter is behind me"). Each one reads as plausible
 * polish, and each one is something the user could be asked about in an interview.
 * The tools that draft (résumé, cover letter, interview prep, offer review, fit
 * check) append this block so the rule is stated once, the same way, everywhere.
 */
export const TRUTH_RULE = `**Truth rule (applies to everything you write about me):**
- Every fact about me must come from the Career KB above or from what I have said in this conversation. Copy numbers exactly; never round them up or turn "under 0.5%" into "zero".
- In drafted résumé bullets, letters, and interview answers, do not add context the source does not state: no new audience, domain, scope, outcome, tool, or reason. Rewording is fine; new facts are not.
- If a stronger version needs a fact you don't have, still write the full draft, and put the missing piece in a visible placeholder such as [confirm: who used these reports?]. Never leave a section empty instead.
- Things I haven't told you about my situation (work authorization, why a job ended, whether a career break is over, my current equity or bonus) are open questions. Name them as gaps or ask; never assume an answer in my voice.`;

/**
 * For tools that discuss pay. Market figures the model "knows" are unsourced and
 * often stale, and the evals caught offer reviews stating equity norms as fact.
 */
export const MARKET_DATA_RULE = `**Market data rule:** Only cite salary, bonus, or equity benchmarks that appear in the market data above or that I gave you. If there are none, say so plainly, tell me where to get them (Levels.fyi, Glassdoor, Carta's equity benchmarks, a recruiter), and reason from my own numbers and stated targets instead. Never put a dollar value on equity without the company's valuation or price per share and the total share count.`;
