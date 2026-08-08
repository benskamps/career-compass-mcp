import { z } from "zod";

// ─── Application Status ────────────────────────────────────────────────────────

export const ApplicationStatus = z.enum([
  "discovered",
  "applied",
  "screening",
  "interviewing",
  "offer",
  "negotiating",
  "accepted",
  "rejected",
  "withdrawn",
  "ghosted",
]);
export type ApplicationStatus = z.infer<typeof ApplicationStatus>;

// ─── Career Data ───────────────────────────────────────────────────────────────

export const Achievement = z.object({
  metric: z.string().describe("Quantifiable outcome, e.g. 'reduced latency 40%'"),
  context: z.string().describe("What the situation/task was"),
  impact: z.string().describe("Why it mattered to the org"),
  keywords: z.array(z.string()).default([]).describe("ATS-friendly keywords"),
});

export const Experience = z.object({
  role: z.string(),
  company: z.string(),
  industry: z.string().optional(),
  location: z.string().optional(),
  startDate: z.string().describe("YYYY-MM or 'present'"),
  endDate: z.string().describe("YYYY-MM or 'present'"),
  summary: z.string().optional(),
  achievements: z.array(Achievement).default([]),
  tags: z.array(z.string()).default([]).describe("Searchable tags"),
});

export const Skill = z.object({
  name: z.string(),
  category: z.string().describe("e.g. 'Leadership', 'Technical', 'Domain'"),
  proficiency: z.number().min(1).max(5).optional(),
  yearsUsed: z.number().optional(),
  lastUsed: z.string().optional().describe("YYYY or 'current'"),
});

export const Education = z.object({
  degree: z.string(),
  institution: z.string(),
  date: z.string().describe("YYYY or YYYY-MM"),
  honors: z.string().optional(),
  relevantCoursework: z.array(z.string()).default([]),
  certifications: z.array(z.string()).default([]),
});

export const Project = z.object({
  name: z.string(),
  role: z.string(),
  description: z.string(),
  technologies: z.array(z.string()).default([]),
  metrics: z.array(z.string()).default([]),
  outcomes: z.array(z.string()).default([]),
  url: z.string().optional(),
});

export const Testimonial = z.object({
  source: z.string().describe("Name and title of person"),
  relationship: z.string().describe("e.g. 'Direct Manager', 'Peer'"),
  quote: z.string(),
  date: z.string().optional(),
  context: z.string().optional().describe("What project/situation this is about"),
});

export const Profile = z.object({
  name: z.string(),
  email: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  linkedIn: z.string().optional(),
  portfolio: z.string().optional(),
  summary: z.string().describe("2-3 sentence professional summary"),
  targetRoles: z.array(z.string()).default([]),
  targetIndustries: z.array(z.string()).default([]),
  targetCompanySize: z.array(z.string()).default([]).describe("e.g. 'startup', 'enterprise'"),
  salaryMin: z.number().optional(),
  salaryMax: z.number().optional(),
  salaryCurrency: z.string().default("USD"),
  // `.optional()` rather than `.default(true)`/`.default(false)`.
  //
  // A zod default is applied at parse time, so once the profile is loaded a
  // stated answer and an unanswered field are indistinguishable. That is
  // harmless for a field nobody asserts anything about, and wrong for these two:
  // the fit analysis prints them under "the hard constraints this fit must be
  // checked against" and then treats a location mismatch as a blocker. A
  // first-run profile is name + summary only — exactly what the documented
  // resume-paste onboarding produces — so the defaults had the tool assert
  // "Open to relocation: no" on the user's behalf and rule roles out on a
  // preference they never expressed. Inventing a preference is the specific
  // dishonesty this product exists to prevent.
  //
  // It also stopped absence being recoverable: `save_career_section` validates
  // with this schema and writes `parsed.data`, so the baked default was
  // persisted into profile.yaml on the first save and became indistinguishable
  // from a real answer from then on.
  //
  // Consumers that need a plain boolean apply the old default at their own use
  // site (`?? true` / `?? false`), so behavior for the absent case is unchanged
  // everywhere except where the stated/unstated distinction is the point.
  openToRemote: z.boolean().optional(),
  openToRelocation: z.boolean().optional(),
  noticePeriod: z.string().optional().describe("e.g. '2 weeks', 'immediately'"),
});

// ─── Career Journal ─────────────────────────────────────────────────────────────

/**
 * An append-only career signal captured from a real interaction — an interview
 * that surfaced a recurring gap, an offer you weighed, a rejection and the
 * pattern behind it. The journal is what lets the KB *accrue*: individually a
 * line, collectively the shape of a career.
 *
 * Stored as its own section (`data/career/journal.yaml`) so it never disturbs
 * the load-bearing profile/experience files and can be loaded fail-closed on
 * the write path (see file-store `appendJournalEntry`).
 */
export const JournalEntry = z.object({
  id: z.string(),
  date: z.string().describe("ISO timestamp of when the signal was captured"),
  type: z.enum([
    "fit_signal",         // how well a role/company fit — what matched, what gapped
    "interview_insight",  // what a round surfaced: questions, what landed, what to sharpen
    "offer_reflection",   // what mattered when weighing an offer; the tradeoffs
    "rejection_pattern",  // stage reached, stated reason, the pattern behind it
    "skill_evidence",     // fresh proof of a skill (review, shipped project, praise)
    "win",                // something that went well and is worth remembering
    "note",               // freeform
  ]),
  applicationId: z.string().optional().describe("Links to a pipeline Application.id"),
  company: z.string().optional(),
  role: z.string().optional(),
  summary: z.string().describe("One-line durable takeaway — the thing worth keeping"),
  detail: z.string().optional().describe("Longer context, if useful"),
  signals: z.array(z.string()).default([]).describe("Recurring strengths, gaps, or keywords to track over time"),
  sentiment: z.enum(["positive", "neutral", "hard"]).optional().describe("Honest emotional read — 'hard' is a first-class, valid value"),
  source: z.enum([
    "explore_opportunity",
    "prepare_interview",
    "evaluate_offer",
    "rejection",
    "ingest_document",
    "manual",
  ]).default("manual").describe("Which surface produced this entry"),
});

/** The on-disk shape of `data/career/journal.yaml`: a flat, append-ordered list. */
export const JournalSection = z.array(JournalEntry);

// ─── Career Data (SSOT) ─────────────────────────────────────────────────────────

export const CareerData = z.object({
  profile: Profile,
  experience: z.array(Experience).default([]),
  skills: z.array(Skill).default([]),
  education: z.array(Education).default([]),
  projects: z.array(Project).default([]),
  testimonials: z.array(Testimonial).default([]),
  journal: z.array(JournalEntry).default([]),
});

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export const Contact = z.object({
  name: z.string(),
  title: z.string().optional(),
  email: z.string().optional(),
  linkedIn: z.string().optional(),
  notes: z.string().optional(),
});

export const InterviewRound = z.object({
  type: z.enum(["phone_screen", "behavioral", "technical", "panel", "final", "offer_call", "other"]),
  date: z.string().optional(),
  interviewers: z.array(z.string()).default([]),
  notes: z.string().optional(),
  outcome: z.string().optional(),
});

export const Offer = z.object({
  baseSalary: z.number().optional(),
  currency: z.string().default("USD"),
  bonus: z.number().optional(),
  equity: z.string().optional().describe("e.g. '0.1% over 4 years'"),
  benefits: z.array(z.string()).default([]),
  startDate: z.string().optional(),
  expiresDate: z.string().optional(),
  notes: z.string().optional(),
});

export const Application = z.object({
  id: z.string(),
  company: z.string(),
  role: z.string(),
  department: z.string().optional(),
  industry: z.string().optional(),
  location: z.string().optional(),
  remote: z.enum(["remote", "hybrid", "onsite", "unknown"]).default("unknown"),
  postingUrl: z.string().optional(),
  postingText: z.string().optional().describe("Full job posting text, cached"),
  status: ApplicationStatus,
  dateDiscovered: z.string().optional(),
  dateApplied: z.string().optional(),
  dateUpdated: z.string(),
  contacts: z.array(Contact).default([]),
  interviewRounds: z.array(InterviewRound).default([]),
  offer: Offer.optional(),
  salaryRange: z.object({ min: z.number().optional(), max: z.number().optional(), currency: z.string().default("USD") }).optional(),
  notes: z.array(z.string()).default([]),
  tailoredResumeVersion: z.string().optional(),
  coverLetterGenerated: z.boolean().default(false),
  followUpDue: z.string().optional().describe("ISO date when follow-up is needed"),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  source: z.string().optional().describe("e.g. 'LinkedIn', 'Referral', 'Company site'"),
  referral: z.string().optional(),
  excitement: z.number().min(1).max(10).optional().describe("Personal excitement score"),
});

export const Pipeline = z.object({
  applications: z.array(Application).default([]),
  lastUpdated: z.string(),
});

// ─── Type exports ──────────────────────────────────────────────────────────────

export type Profile = z.infer<typeof Profile>;
export type Experience = z.infer<typeof Experience>;
export type Skill = z.infer<typeof Skill>;
export type Education = z.infer<typeof Education>;
export type Project = z.infer<typeof Project>;
export type Testimonial = z.infer<typeof Testimonial>;
export type Achievement = z.infer<typeof Achievement>;
export type CareerData = z.infer<typeof CareerData>;
export type JournalEntry = z.infer<typeof JournalEntry>;
export type Application = z.infer<typeof Application>;
export type Pipeline = z.infer<typeof Pipeline>;
export type Contact = z.infer<typeof Contact>;
export type InterviewRound = z.infer<typeof InterviewRound>;
export type Offer = z.infer<typeof Offer>;
