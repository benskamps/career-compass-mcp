// What each eval case asks, in one place. build-suite.mjs turns this into the
// prompt.md and graders/*.md files that `claude plugin eval` reads.
//
// Grader file names start with the axis they score, "<axis>--<check>.md", so the
// scoreboard can roll every verdict up to the axes in the satisfaction plan:
//   activation  does the skill fire when it should, and only then
//   first-reply is the first answer worth having, with no setup tax
//   task        is the fit check / résumé / letter / prep / offer review good
//   honesty     does it ever state something untrue about the user
//   surface     does it behave right for the surface it runs on
//   memory      does a saved Career KB make the answer better
//   trust       does it write only what the user agreed to

// Per-persona task for the chat suite (Claude.ai: no MCP tools). The fit check is
// covered by the first-contact cases, so these are the other jobs people bring.
export const CHAT_TASKS = [
  { persona: "new-grad", task: "tailor", posting: "junior-analyst",
    ask: "Can you tailor my résumé for this job? I want to apply this week." },
  { persona: "laid-off-engineer", task: "interview", posting: "staff-backend",
    ask: "I have the system design and leadership rounds for this role on Monday. Prep me." },
  { persona: "career-switcher", task: "cover", posting: "ux-researcher",
    ask: "Write my cover letter for this. I'm worried they'll see me as just a teacher.",
    special: "the move from teaching into UX research, framed as a strength rather than an apology" },
  { persona: "senior-pm", task: "tailor", posting: "payments-pm",
    ask: "Tailor my résumé for this director role." },
  { persona: "executive", task: "offer",
    ask: "I got this offer today. Is it good, and what should I push back on?\n\n" +
      "Northbeam Systems, SVP of Engineering (Austin, remote friendly)\n" +
      "Base salary: $310,000\nAnnual bonus target: 20% of base\n" +
      "Equity: 0.35% in stock options, 4-year vesting with a 1-year cliff\n" +
      "Start date: in 3 weeks\nOffer expires in 5 business days." },
  { persona: "return-to-work", task: "cover", posting: "marketing-director",
    ask: "Help me write a cover letter for this. I don't know how to handle the gap.",
    special: "the career break since July 2023 to care for a family member (the résumé states that reason), named plainly and briefly, with no apology and no invented activity during the gap" },
  { persona: "non-native", task: "interview", posting: "data-engineer",
    ask: "i have the interview with the hiring manager next week. please help me prepare, my english is not perfect." },
  { persona: "contractor", task: "recruiter",
    ask: "Got this from a recruiter. Is it worth it, and how should I reply?\n\n" +
      "\"Hi Alexis, I came across your profile and think you'd be a great fit for a Senior Front-End " +
      "Engineer role with Harborline Insurance. It's a 6-month contract-to-hire at $70/hr W2, fully remote. " +
      "They need someone who knows React, TypeScript and accessibility. Are you free for a quick call Thursday? " +
      "Thanks, Megan (Talent Partner, Brightpath Staffing)\"" },
];

// Cases in the tools suite where the Career KB already holds Alex Rivera's history
// (data/example). Nothing about Alex is pasted; the answer has to come from the KB.
export const MEMORY_CASES = [
  {
    id: "memory-fit-check",
    ask: "How well do I fit this one?\n\nDirector of Clinical Operations, Harborview Digital Health (remote, US). " +
      "8+ years in operations, healthcare technology experience, process improvement at scale, vendor management, " +
      "comfortable reporting to the COO. $165,000 to $185,000.",
    uses: "MedFlow|Apex|Brightline|47 days|11 days|6 weeks|94%|97\\.3",
    expect: "a fit verdict built on Alex's healthcare work at MedFlow (onboarding time cut from 47 to 11 days, the vendor framework) and a compensation check against Alex's saved $140,000 to $180,000 band",
  },
  {
    id: "memory-interview-prep",
    mocks: "kb-veridian",
    ask: "My final round with Veridian Health is Thursday. Prep me.",
    uses: "regulat|compliance",
    expect: "prep for the Veridian Health Director of Operations final round that uses Alex's saved history, and specifically prepares for regulatory and compliance questions, since Alex's journal records stumbling on one in an earlier Veridian round",
  },
  {
    id: "memory-today",
    mocks: "kb-today",
    ask: "What needs my attention in my job search right now?",
    uses: "Brightpath|Veridian|Stratos|Lumen|Meridian",
    expect: "a short, prioritized list drawn from Alex's saved pipeline that opens with one clear first move (prep for the Veridian Health panel, which is tomorrow), then covers the overdue Meridian Logistics Group follow-up and the Brightpath Health offer before its 27 June deadline, each with a concrete action, and offers to do the first step",
  },
  {
    id: "memory-cover-letter",
    mocks: "kb-meridian",
    ask: "Write a cover letter for the Head of Customer Success role at Meridian Logistics Group.",
    uses: "118%|1\\.2M|97\\.3|on-time|Brightline|Apex",
    expect: "a cover letter that pairs Alex's customer success record at Brightline (118% net revenue retention, $1.2M expansion) with the logistics operations work at Apex Logistics Partners",
  },
];

// Daily-digest cases beyond memory-today. The pipeline is empty, so the job is a
// one-line answer and a nudge to track the first role, not a wall of advice.
export const TODAY_CASES = [
  {
    id: "today-empty-pipeline",
    mocks: "empty-today",
    ask: "What should I work on in my job search today?",
    expect: `
The user asked what to work on in their job search today. Their tracked pipeline is empty, which the assistant can see from its tools.

PASS if the reply says plainly, near the top, that nothing is tracked yet; its main ask is for one concrete thing to start tracking (a job posting they are considering, or a role they have already applied to); and it stays short (no more than about 12 lines).
FAIL if the reply invents applications, follow-ups or interviews; gives a long list of generic job-search tips in place of that ask; asks three or more separate questions; or adds anything to the pipeline the user did not provide.`,
  },
];

// Personas whose posting-only first contact runs in the tools suite.
export const FIRST_CONTACT_POSTING_ONLY = ["new-grad", "laid-off-engineer", "career-switcher", "contractor"];
