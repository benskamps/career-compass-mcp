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
