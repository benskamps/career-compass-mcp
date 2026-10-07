import type { Application, ApplicationStatus } from "./schemas/career-schema.js";

/**
 * The one place a pipeline turns into numbers.
 *
 * `pipeline_view action=stats` and the dashboard both answer "what is my
 * response rate?", and they answered it differently: the tool computed
 * (total − applied) / total, which counts a role you have only *discovered* —
 * and never sent anything to — as an employer response, and divides by a
 * denominator that includes it. On the bundled sample that reported 75% while
 * the dashboard, doing responded / sent, reported 71%. Two surfaces of one
 * product disagreeing about the user's own number is worse than either being
 * wrong: there is no way for them to tell which to believe.
 *
 * So the arithmetic lives here and both call it. Adding a stage to the funnel
 * is now one edit rather than a hunt for every place a status list was inlined.
 */

/**
 * Stages a search is still live in — nothing has closed the door yet.
 *
 * `discovered` belongs here: a role you have found and not yet applied to is
 * live work, and the board shows it as a column.
 */
export const ACTIVE_STATUSES: readonly ApplicationStatus[] = [
  "discovered", "applied", "screening", "interviewing", "offer", "negotiating",
];

/**
 * Did this application actually get sent?
 *
 * Everything past `discovered` did. This is the denominator for both rates
 * below, because a role you never applied to cannot answer you and cannot
 * ghost you — including it only dilutes the number you were asking about.
 */
export function wasSent(app: Application): boolean {
  return app.status !== "discovered";
}

/**
 * Did the employer come back?
 *
 * Anything past `applied` means someone on the other side acted, except
 * `ghosted`, which is the recorded absence of exactly that.
 *
 * `withdrawn` counts as a response, which is right in the ordinary case — you
 * withdraw from a process you are in — and generous in the rarer one where
 * someone withdraws an application nobody ever answered. The stored data does
 * not distinguish those, and the alternative (silently dropping withdrawals
 * from the numerator) understates real conversations.
 */
export function gotResponse(app: Application): boolean {
  return !["discovered", "applied", "ghosted"].includes(app.status);
}

export interface PipelineStats {
  total: number;
  /** Applications actually submitted — the denominator for both rates. */
  sent: number;
  active: number;
  inConversation: number;
  offers: number;
  ghosted: number;
  /** Percent of sent applications the employer answered, 0 when none sent. */
  responseRate: number;
  /** Percent of sent applications that went silent, 0 when none sent. */
  ghostRate: number;
}

export function computeStats(apps: Application[]): PipelineStats {
  const sent = apps.filter(wasSent).length;
  const responded = apps.filter(gotResponse).length;
  const ghosted = apps.filter((a) => a.status === "ghosted").length;
  const pct = (n: number) => (sent ? Math.round((n / sent) * 100) : 0);

  return {
    total: apps.length,
    sent,
    active: apps.filter((a) => ACTIVE_STATUSES.includes(a.status)).length,
    inConversation: apps.filter((a) => ["screening", "interviewing"].includes(a.status)).length,
    offers: apps.filter((a) => ["offer", "negotiating", "accepted"].includes(a.status)).length,
    ghosted,
    responseRate: pct(responded),
    ghostRate: pct(ghosted),
  };
}

// ─── Patterns worth one honest line ──────────────────────────────────────────

/** Small counts read better as words in a sentence: "Three of your last four". */
export function countWord(n: number): string {
  const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  return n >= 0 && n < words.length ? words[n] : String(n);
}
const capitalized = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Ended without an offer: the employer said no, or stopped answering. */
function endedWithoutOffer(app: Application): boolean {
  return app.status === "rejected" || app.status === "ghosted";
}

const STAGE_NAME: Record<string, string> = {
  phone_screen: "phone screen", behavioral: "behavioral round", technical: "technical round",
  panel: "panel round", final: "final round", offer_call: "offer call", other: "same round",
};
const STAGE_PREP: Record<string, string> = {
  phone_screen: "your screening pitch", behavioral: "your stories for behavioral questions",
  technical: "technical prep", panel: "panel prep", final: "final-round prep",
  offer_call: "how you handle the offer call", other: "prep for that stage",
};

/**
 * "Three of your last four ended after the panel round", or null.
 *
 * The stage an application ended after is its last recorded interview round.
 * One that closed with no rounds ended at the application itself, which is the
 * ordinary fate of most cold applications and not a pattern worth a line. Three
 * is the floor: two could be chance, and a line about the user's own record has
 * to be something the numbers actually show.
 *
 * Worded as a fact about the process plus an offer, never as a verdict: the user
 * reads this in the weeks they are being turned down.
 */
export function endedAfterSamePattern(apps: Application[]): string | null {
  const ended = apps
    .filter(endedWithoutOffer)
    .sort((a, b) => (b.dateUpdated ?? "").localeCompare(a.dateUpdated ?? ""));
  const stageOf = (a: Application) => a.interviewRounds?.length ? a.interviewRounds[a.interviewRounds.length - 1].type : null;

  const counts = new Map<string, number>();
  for (const a of ended) {
    const s = stageOf(a);
    if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const top = [...counts.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1])[0];
  if (!top) return null;
  const [stage, n] = top;
  // The window is the most recent run that holds every one of them, so the
  // sentence says "three of your last four", not "three of your eleven".
  let seen = 0;
  let window = 0;
  for (const a of ended) {
    window++;
    if (stageOf(a) === stage && ++seen === n) break;
  }
  const lead = window === n
    ? `Your last ${countWord(n)} applications that closed without an offer all ended after the ${STAGE_NAME[stage]}`
    : `${capitalized(countWord(n))} of your last ${countWord(window)} applications that closed without an offer ended after the ${STAGE_NAME[stage]}`;
  return `${lead}. Getting that far means the earlier stages are working; want to look at ${STAGE_PREP[stage]} together?`;
}

/** Reached a real interview: a recorded round, or a stage that implies one. */
function reachedInterview(app: Application): boolean {
  return (app.interviewRounds?.length ?? 0) > 0 || ["interviewing", "offer", "negotiating", "accepted"].includes(app.status);
}

/** Below this, a group is too small to compare and the line is skipped. */
const MIN_GROUP = 3;
/** Applications needing a score or a source before either comparison is drawn. */
const MIN_RECORDED = 8;

const hint = (smallest: number) => (smallest < 10 ? " Small numbers, so read it as a hint, not a rule." : "");

/**
 * Excitement against outcome: the comparison the `excitement` field promises.
 *
 * Only sent applications count (a role you never applied to cannot reach an
 * interview), and only once eight of them carry a score. Each side needs three
 * before it is compared, and both counts are always printed, so the user sees
 * how small the sample is rather than a bare percentage.
 */
export function excitementLine(apps: Application[]): string | null {
  const scored = apps.filter((a) => wasSent(a) && typeof a.excitement === "number");
  if (scored.length < MIN_RECORDED) return null;
  const high = scored.filter((a) => a.excitement! >= 8);
  const low = scored.filter((a) => a.excitement! <= 5);
  if (high.length < MIN_GROUP || low.length < MIN_GROUP) return null;
  const hit = (g: Application[]) => g.filter(reachedInterview).length;
  return `Roles you rated 8+ reached an interview ${hit(high)} of ${high.length} times; roles rated 5 or lower, ${hit(low)} of ${low.length}.` +
    hint(Math.min(high.length, low.length));
}

/** "Referral", "referred by Dana", or a named referrer all count as a referral. */
function sourceOf(app: Application): string | null {
  if (app.referral?.trim() || /referr/i.test(app.source ?? "")) return "Referral";
  const s = app.source?.trim();
  return s ? capitalized(s) : null;
}

/**
 * Reply rate by source, for sources with enough applications to say anything.
 *
 * Needs eight sent applications with a source recorded, and at least two
 * sources with three or more each; otherwise there is nothing honest to compare.
 */
export function sourceLine(apps: Application[]): string | null {
  const sourced = apps.filter((a) => wasSent(a) && sourceOf(a));
  if (sourced.length < MIN_RECORDED) return null;
  const groups = new Map<string, Application[]>();
  for (const a of sourced) {
    const name = sourceOf(a)!;
    const key = [...groups.keys()].find((g) => g.toLowerCase() === name.toLowerCase()) ?? name;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  const big = [...groups.entries()].filter(([, g]) => g.length >= MIN_GROUP).sort((a, b) => b[1].length - a[1].length);
  if (big.length < 2) return null;
  const parts = big.map(([name, g]) => `${name} ${g.filter(gotResponse).length} of ${g.length}`);
  return `Replies by source: ${parts.join(", ")}.` + hint(Math.min(...big.map(([, g]) => g.length)));
}

/** Every pattern line the data supports today, in a stable order. */
export function patternLines(apps: Application[]): string[] {
  return [endedAfterSamePattern(apps), excitementLine(apps), sourceLine(apps)].filter((l): l is string => Boolean(l));
}
