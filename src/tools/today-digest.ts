import type { Application, CareerData, Pipeline } from "../schemas/career-schema.js";
import { statusRank } from "../schemas/career-schema.js";
import { computeStats, countWord, endedAfterSamePattern } from "../pipeline-stats.js";
import type { ToolResponse } from "../types/tool-args.js";

/**
 * Today's job-search digest: what `pipeline_view action=next_actions` returns,
 * and what `/career-compass:today` is built on.
 *
 * The old version was a flat, unranked list. On the sample pipeline four months
 * on it printed nine lines, the same application twice ("Follow up" and
 * "Overdue follow-up"), "evaluate and respond" on an offer whose deadline had
 * passed, and "follow up" on applications silent for 110 days. It never named a
 * discovered role left unapplied or a follow-up due tomorrow. A list like that
 * gives nobody a reason to come back the next morning.
 *
 * Now each live application yields at most one item, its most pressing, and the
 * items are ranked. The top one is the "Start here" move; the rest of today's
 * list follows; anything due in the next few days goes under "Coming up". Every
 * item ends with one concrete action the user can take or ask for.
 */

const CLOSED = ["rejected", "withdrawn", "accepted", "ghosted"];

/** Scores at or above this are today's work; below it, "Coming up". */
const TODAY = 40;

interface Item {
  app: Application;
  score: number;
  line: string;
  action?: string;
  /** Silent for a month or more: grouped into one line when there are several. */
  quiet?: number;
}

/** Days from `now`'s calendar day to an ISO date, in the user's own timezone. */
export function calendarDays(now: Date) {
  // `new Date("2026-07-24")` is parsed as UTC midnight while `now` is local, so
  // west of UTC a follow-up due today came out negative and east of UTC
  // tomorrow's fired a day early. A date-only field has no time in it.
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return (iso?: string): number => {
    if (!iso) return NaN;
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    if (!y || !m || !d) return NaN;
    return Math.round((new Date(y, m - 1, d).getTime() - midnight) / 86400000);
  };
}

function when(d: number): string {
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
}

function label(app: Application): string {
  return `${app.company} / ${app.role}`;
}

/** The person to nudge: a recruiter if one is recorded, else the first contact. */
function contactFor(app: Application): string | undefined {
  const people = app.contacts ?? [];
  const recruiter = people.find((c) => /recruit|talent|people|\bhr\b/i.test(c.title ?? ""));
  return (recruiter ?? people[0])?.name;
}

function roundName(type: string): string {
  return type.replace(/_/g, " ");
}

/** Every reason this application might need the user, scored. */
function candidates(app: Application, now: Date): Item[] {
  const days = calendarDays(now);
  const out: Item[] = [];
  const who = contactFor(app);
  const nudge = who ? `Send ${who} a two-line check-in. I can draft it.` : "Send a two-line check-in to the recruiter or hiring manager. I can draft it.";

  // `dateUpdated` is a full timestamp, so it gets timestamp arithmetic: through
  // the calendar-day helper its UTC date lost a day every evening, US time.
  const updatedMs = Date.parse(app.dateUpdated);
  const quiet = Number.isNaN(updatedMs) ? 0 : Math.floor((now.getTime() - updatedMs) / 86400000);

  // Interviews. A future round on an application already at offer is a
  // leftover, not a plan, so only stages up to interviewing count.
  const upcoming = statusRank(app.status) > statusRank("interviewing") ? [] : (app.interviewRounds ?? [])
    .map((r) => ({ ...r, d: days(r.date) }))
    .filter((r) => !Number.isNaN(r.d) && r.d >= 0)
    .sort((a, b) => a.d - b.d);
  const next = upcoming[0];
  if (next) {
    const line = `🎯 **Upcoming interview** — ${label(app)}: ${roundName(next.type)} ${when(next.d)} (${next.date}, ID: ${app.id})`;
    const action = `Prep for it${next.d <= 1 ? " today" : ""}. Ask "prep me for my ${app.company} ${roundName(next.type)}" and I'll build it from your history and notes.`;
    out.push({ app, score: next.d <= 1 ? 100 : next.d <= 7 ? 70 : 15, line, action });
  }

  // The day or two after an interview. Before this, past rounds were dropped
  // and a quiet process got "Check status": a timeline chase on the one day a
  // thank-you note and a debrief are the moves. The debrief is also how the
  // Career KB learns what interviewers probe, through capture_insight.
  const past = (app.interviewRounds ?? [])
    .map((r) => ({ ...r, d: days(r.date) }))
    .filter((r) => !Number.isNaN(r.d) && r.d < 0)
    .sort((a, b) => b.d - a.d);
  const lastRound = past[0];
  const justInterviewed = Boolean(lastRound) && lastRound.d >= -2 &&
    ["screening", "interviewing"].includes(app.status) && !lastRound.outcome;
  if (justInterviewed) {
    out.push({
      app,
      score: 85,
      line: `🗒️ **Debrief** — ${label(app)}: ${roundName(lastRound.type)} ${when(lastRound.d)} (ID: ${app.id})`,
      action: "Send a short thank-you today; tell me one thing you talked about and I'll draft it. Then tell me how it went, and I'll keep what's useful for your next round.",
    });
  }
  // A round in the last week is the next step; chasing a timeline that soon reads as anxious.
  const recentRound = Boolean(lastRound) && lastRound.d >= -7;

  // Offers.
  if (app.status === "offer" || app.status === "negotiating") {
    const exp = days(app.offer?.expiresDate);
    const evaluate = `Ask "evaluate my ${app.company} offer" to weigh it against your targets.`;
    if (Number.isNaN(exp)) {
      out.push({ app, score: 75, line: `💰 **Pending offer** — ${label(app)}: no deadline recorded (ID: ${app.id})`, action: `Decide or counter, and ask for a decision date if you don't have one. ${evaluate}` });
    } else if (exp < 0) {
      out.push({ app, score: 92, line: `💰 **Offer deadline passed** — ${label(app)}: it expired ${when(exp)} (${app.offer!.expiresDate}, ID: ${app.id})`, action: "Tell me where it stands (accepted, still negotiating, or declined) and I'll update the board." });
    } else {
      out.push({ app, score: exp <= 3 ? 97 : 75, line: `💰 **Pending offer** — ${label(app)}: expires ${when(exp)} (${app.offer!.expiresDate}, ID: ${app.id})`, action: `Decide or counter before then. ${evaluate}` });
    }
  }

  // A month of silence with nothing booked is no longer a follow-up to send;
  // it is a process to close or chase one last time.
  const stale = quiet >= 30 && !next && ["applied", "screening", "interviewing"].includes(app.status);

  // Follow-ups the user set.
  const fu = days(app.followUpDue);
  if (!Number.isNaN(fu) && !stale) {
    if (fu <= 0) {
      out.push({ app, score: 80 + Math.min(-fu, 7), line: `⚠️ **Overdue follow-up** — ${label(app)}: due ${fu === 0 ? "today" : `${app.followUpDue}, ${-fu} day${fu === -1 ? "" : "s"} ago`} (ID: ${app.id})`, action: nudge });
    } else if (fu <= 3) {
      out.push({ app, score: 30, line: `📅 Follow-up due ${when(fu)} — ${label(app)} (${app.followUpDue}, ID: ${app.id})` });
    }
  }

  // Silence. A follow-up date set in the future means the user chose to wait,
  // so silence alone does not nag until it is a month long.
  const waiting = !Number.isNaN(fu) && fu > 0;
  if (app.status === "applied") {
    if (quiet >= 30) {
      out.push({ app, score: 45, quiet, line: `🕸️ **Gone quiet** — ${label(app)}: applied ${quiet}d ago, no reply recorded (ID: ${app.id})`, action: "Send one last nudge, or say so and I'll mark it ghosted so it stops counting as live." });
    } else if (quiet >= 7 && !waiting) {
      out.push({ app, score: 55, line: `📬 **Follow up** — ${label(app)}: applied ${quiet}d ago (ID: ${app.id})`, action: nudge });
    }
  }
  if ((app.status === "screening" || app.status === "interviewing") && !next) {
    const limit = app.status === "screening" ? 5 : 7;
    if (quiet >= 30) {
      out.push({ app, score: 50, quiet, line: `🕸️ **Gone quiet** — ${label(app)}: ${app.status} ${quiet}d with no next step (ID: ${app.id})`, action: "Send one last nudge for a timeline, or say so and I'll mark it ghosted." });
    } else if (quiet >= limit && !waiting && !recentRound) {
      out.push({ app, score: 60, line: `📞 **Check status** — ${label(app)}: in ${app.status} ${quiet}d with no next step booked (ID: ${app.id})`, action: who ? `Ask ${who} for a timeline. I can draft it.` : "Ask the recruiter for a timeline. I can draft it." });
    }
  }
  if (app.status === "discovered" && quiet >= 7) {
    out.push({ app, score: 25, line: `🗂️ Not applied yet — ${label(app)}: found ${quiet}d ago (ID: ${app.id}). Apply this week or drop it.` });
  }

  const bonus = app.priority === "high" ? 3 : app.priority === "low" ? -3 : 0;
  return out.map((c) => ({ ...c, score: c.score + bonus }));
}

function today(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** A timestamp's calendar day in the user's own timezone, as YYYY-MM-DD. */
function localDay(timestamp: string): string | undefined {
  const ms = Date.parse(timestamp);
  return Number.isNaN(ms) ? undefined : today(new Date(ms));
}

/** One line of the digest, as `pipeline_view` returns it in structuredContent. */
export interface DigestItem {
  applicationId?: string;
  line: string;
  action?: string;
}

/** The digest as data: the same sections the text renders, in the same order. */
export interface DigestData {
  date: string;
  /** Set when nothing is due: the one sentence that says so. */
  headline?: string;
  startHere: DigestItem | null;
  alsoToday: DigestItem[];
  comingUp: DigestItem[];
  /** A kindly worded pattern across closed applications, when there is one. */
  pattern?: string;
  /** On a quiet day: the next dated thing on the board, so the user knows when to come back. */
  nextUp?: string;
  footer: string[];
}

const toDigestItem = (i: Item): DigestItem => ({ applicationId: i.app.id, line: i.line, ...(i.action ? { action: i.action } : {}) });

/** Close-out runs this many days after an acceptance; landing mode runs to day 90. */
const CLOSE_OUT_DAYS = 14;
const LANDING_DAYS = 90;
/** At most this many reconnect nudges a day: the ledger is a garden, not an inbox. */
const MAX_RECONNECTS = 2;

/** The one feedback ask in the product. Shown only in the close-out after an accepted offer. */
export const FEEDBACK_LINE =
  "If Career Compass helped, a GitHub star or a two-line note in Discussions is the only way the author hears about it. Nothing is sent automatically.";

/**
 * People in the ledger it is time to get back in touch with.
 *
 * Two reasons, and nothing else: the user set a cadence (`reconnectEveryDays`)
 * and it has passed, or someone offered a referral on an application that is
 * still live and it has been three months. A person with no `lastContact` is
 * never nudged: "last contact N days ago" would be a number made up.
 */
function reconnects(career: CareerData | null | undefined, apps: Application[], now: Date): DigestItem[] {
  const days = calendarDays(now);
  const live = new Set(apps.filter((a) => !CLOSED.includes(a.status)).map((a) => a.id));
  const due: { item: DigestItem; over: number }[] = [];
  for (const p of career?.people ?? []) {
    const since = -days(p.lastContact);
    if (Number.isNaN(since) || since < 0) continue;
    const cadence = p.reconnectEveryDays !== undefined && since > p.reconnectEveryDays;
    const referralGoingCold = since > 90 && /referr/i.test(p.offered ?? "") && (p.applicationIds ?? []).some((id) => live.has(id));
    if (!cadence && !referralGoingCold) continue;
    due.push({
      over: cadence ? since - p.reconnectEveryDays! : since - 90,
      item: {
        line: `🤝 Reconnect — ${p.name}${p.company ? ` (${p.company})` : ""}: last contact ${since} days ago`,
        action: referralGoingCold && !cadence
          ? "They offered a referral on a role you're still in. A short update keeps it warm; I can draft it."
          : "A two-line hello with no ask is enough. I can draft it.",
      },
    });
  }
  return due.sort((a, b) => b.over - a.over).slice(0, MAX_RECONNECTS).map((d) => d.item);
}

/** First day of the search: the earliest date anything was found or sent. */
function searchStart(apps: Application[]): string | undefined {
  return apps
    .flatMap((a) => [a.dateApplied, a.dateDiscovered])
    .filter((d): d is string => Boolean(d) && /^\d{4}-\d{2}-\d{2}/.test(d!))
    .map((d) => d.slice(0, 10))
    .sort()[0];
}

/** The calendar week so far, Monday to today, as a day-offset test. */
function inThisWeek(now: Date) {
  const days = calendarDays(now);
  const sinceMonday = (now.getDay() + 6) % 7;
  return (iso?: string) => {
    const d = days(iso);
    return !Number.isNaN(d) && d <= 0 && d >= -sinceMonday;
  };
}

interface Pace { sent: number; pace: number; conversations: number }

function weekPace(apps: Application[], pace: number | undefined, now: Date): Pace | null {
  if (!pace) return null;
  const thisWeek = inThisWeek(now);
  return {
    pace,
    sent: apps.filter((a) => thisWeek(a.dateApplied)).length,
    conversations: apps.flatMap((a) => a.interviewRounds ?? []).filter((r) => thisWeek(r.date)).length,
  };
}

/**
 * The close-out, for the two weeks after the user accepts an offer.
 *
 * Before this the digest's answer to the best day of a search was "all N
 * tracked applications are closed". Each step is something only this product
 * can do from what is on file: the people to thank are the referrers and
 * contacts the user recorded, the processes to withdraw from are the live rows,
 * and the recap is the user's own numbers. Every step is an offer; nothing on
 * the board changes until the user says so.
 */
function closeOutItem(accepted: Application, apps: Application[], weeks: number | null): Item {
  const thanks = [...new Set([
    ...apps.map((a) => a.referral?.trim()).filter((n): n is string => Boolean(n)),
    ...(accepted.contacts ?? []).map((c) => c.name),
  ])].slice(0, 6);
  const live = apps.filter((a) => a.id !== accepted.id && !CLOSED.includes(a.status));
  const stats = computeStats(apps);

  const steps: string[] = [];
  if (thanks.length) steps.push(`Thank the people who helped: ${thanks.join(", ")}. I'll draft a short note to each.`);
  if (live.length) steps.push(`Withdraw from the processes still live: ${live.map((a) => `${label(a)} (${a.status}, ID: ${a.id})`).join(", ")}. I'll draft each note and mark them withdrawn when you say so.`);
  steps.push(`Keep what won: tell me which stories landed and I'll save them to \`stories\`, and add the new role to \`experience\`, so your next search starts warm.`);
  steps.push(`Recap: ${stats.total} tracked${weeks ? ` over ${weeks} week${weeks === 1 ? "" : "s"}` : ""} · ${stats.responseRate}% response rate · ${stats.offers} offer${stats.offers === 1 ? "" : "s"}.`);

  return {
    app: accepted,
    score: 1000,
    line: `🎉 **You accepted ${label(accepted)}.** Congratulations. Here's how to close the search well (ID: ${accepted.id})`,
    action: `Pick any of these and I'll do it with you; nothing changes on your board until you say so.\n` +
      steps.map((s, i) => `  ${i + 1}. ${s}`).join("\n") +
      `\n  ${FEEDBACK_LINE}`,
  };
}

/**
 * Landing mode: the first 90 days after an acceptance.
 *
 * The interview record is most valuable the week the user starts: it says what
 * the hiring manager probed and worried about. So the first week offers a
 * 30/60/90 plan built from those rounds and the journal's interview notes, and
 * every week asks for one win (`capture_insight` type `win`), which becomes
 * review material and the next search's résumé bullets.
 */
function landingItem(accepted: Application, apps: Application[], career: CareerData | null | undefined, sinceAccepted: number, now: Date): Item {
  const days = calendarDays(now);
  const toStart = days(accepted.offer?.startDate);
  const rounds = accepted.interviewRounds?.length ?? 0;
  const company = accepted.company.toLowerCase();
  const insightCount = (career?.journal ?? []).filter((e) =>
    e.type === "interview_insight" && (e.applicationId === accepted.id || (e.company ?? "").toLowerCase() === company)).length;
  const probed = rounds || insightCount
    ? `what your interviewers probed (${[rounds ? `${rounds} round${rounds === 1 ? "" : "s"}` : "", insightCount ? `${insightCount} interview note${insightCount === 1 ? "" : "s"}` : ""].filter(Boolean).join(" and ")} on file for ${accepted.company})`
    : "what you remember your interviewers probing";
  const plan = `Want a 30/60/90 plan? I'd build it from ${probed}, and only from that.`;
  const stillLive = apps.filter((a) => a.id !== accepted.id && !CLOSED.includes(a.status)).length;
  const tidy = stillLive ? ` ${stillLive === 1 ? "One other application still shows" : `${stillLive} other applications still show`} as live; say the word and I'll mark ${stillLive === 1 ? "it" : "them"} withdrawn.` : "";

  if (!Number.isNaN(toStart) && toStart > 0) {
    return {
      app: accepted, score: 900,
      line: `🏁 **Starting at ${accepted.company}** ${when(toStart)} (${accepted.offer!.startDate}, ID: ${accepted.id})`,
      action: plan + tidy,
    };
  }
  const sinceStart = Number.isNaN(toStart) ? sinceAccepted : -toStart;
  const week = Math.floor(sinceStart / 7) + 1;
  return {
    app: accepted, score: 900,
    line: `🏁 **Week ${week} in the new role: capture one win** — ${label(accepted)} (ID: ${accepted.id})`,
    action: "Tell me one thing that went well this week, however small, and I'll keep it as a win (capture_insight, type win). By review time they're your evidence, and your next résumé's bullets." +
      (week === 1 ? ` ${plan}` : "") + tidy,
  };
}

export function buildTodayDigest(pipeline: Pipeline, now: Date = new Date(), career?: CareerData | null): ToolResponse {
  const apps = pipeline.applications;
  const respond = (t: string, data: DigestData): ToolResponse => ({
    content: [{ type: "text", text: t }],
    structuredContent: { ...data },
  });

  if (apps.length === 0) {
    const headline = "Nothing tracked yet, so there is nothing to act on.";
    const start = "Paste a job posting you're considering and say \"track this\". I'll add it and check your fit. Or name a role you've already applied to (company, title, roughly when) and I'll add it with `pipeline_add`.";
    return respond([
      "# Today",
      "",
      headline,
      "",
      `**Start here:** ${start.charAt(0).toLowerCase()}${start.slice(1)}`,
      "",
      "Once something is tracked, this shows follow-ups due, interviews coming up, offer deadlines, and applications that have gone quiet, with one clear first move each day.",
    ].join("\n"), { date: today(now), headline, startHere: { line: start }, alsoToday: [], comingUp: [], footer: [] });
  }

  const days = calendarDays(now);
  const start = searchStart(apps);

  // An accepted offer changes what the digest is for. The most recent one wins;
  // `dateUpdated` is the closest thing on file to the day it was accepted.
  const accepted = apps
    .filter((a) => a.status === "accepted")
    .sort((a, b) => (b.dateUpdated ?? "").localeCompare(a.dateUpdated ?? ""))[0];
  const sinceAccepted = accepted ? -days(localDay(accepted.dateUpdated)) : NaN;
  const othersLive = apps.some((a) => a.id !== accepted?.id && !CLOSED.includes(a.status));
  const closingOut = !Number.isNaN(sinceAccepted) && sinceAccepted >= 0 && sinceAccepted <= CLOSE_OUT_DAYS;
  const landing = !Number.isNaN(sinceAccepted) && sinceAccepted >= 0 && sinceAccepted <= LANDING_DAYS &&
    (sinceAccepted > CLOSE_OUT_DAYS || !othersLive);
  const afterAccept = closingOut || landing;

  // One item per application: its most pressing reason. Once the user has taken
  // a job, the other live processes are one "withdraw" line in the close-out,
  // not a list of follow-ups to send to companies they are about to leave.
  let items = afterAccept ? [] : apps
    .filter((a) => !CLOSED.includes(a.status))
    .map((a) => candidates(a, now).sort((x, y) => y.score - x.score)[0])
    .filter((i): i is Item => Boolean(i));

  // Several silent processes are one decision, not several chores.
  const silent = items.filter((i) => i.quiet !== undefined);
  if (silent.length >= 2) {
    silent.sort((x, y) => y.quiet! - x.quiet!);
    items = items.filter((i) => i.quiet === undefined);
    items.push({
      app: silent[0].app,
      score: Math.max(...silent.map((i) => i.score)),
      line: `🕸️ **Gone quiet** — ${silent.length} applications with no reply in 30+ days: ${silent.map((i) => `${i.app.company} (${i.quiet}d, ID: ${i.app.id})`).join(", ")}`,
      action: "Pick any worth one last nudge and I'll draft it. Say so and I'll mark the rest ghosted, so your board shows what is really live.",
    });
  }
  const weeksToAccept = accepted && start ? Math.max(1, Math.round((days(localDay(accepted.dateUpdated)) - days(start)) / 7)) : null;
  if (closingOut) items.push(closeOutItem(accepted!, apps, weeksToAccept));
  if (landing) items.push(landingItem(accepted!, apps, career, sinceAccepted, now));
  items.sort((x, y) => y.score - x.score);

  const due = items.filter((i) => i.score >= TODAY);
  // Reconnects are the lowest-stakes item there is, so they always go last:
  // never above an interview, an offer or a debrief, and never more than two.
  const soon = [...items.filter((i) => i.score < TODAY).map(toDigestItem), ...(closingOut ? [] : reconnects(career, apps, now))];
  const stats = computeStats(apps);
  const board = `${stats.total} tracked · ${stats.active} active · ${stats.inConversation} in conversation · ${stats.offers} with an offer${stats.sent ? ` · ${stats.responseRate}% response rate` : ""}`;

  // Where the user is in the campaign, and against the pace they set. A search
  // with no visible progress feels endless; "week 6, 2 of 5 sent" does not.
  const pace = afterAccept ? null : weekPace(apps, career?.profile?.weeklyPace, now);
  const week = start && !afterAccept ? Math.floor(-days(start) / 7) + 1 : NaN;
  // Without a pace, the last seven days are still visible progress.
  const lastWeek = !pace && !afterAccept ? recentMomentum(apps, now) : "";
  const campaign = [
    !Number.isNaN(week) && week >= 1 ? `Week ${week} of your search` : "",
    pace ? `This week: ${pace.sent} of ${pace.pace} sent · ${pace.conversations} conversation${pace.conversations === 1 ? "" : "s"}` : lastWeek,
  ].filter(Boolean).join(" · ");
  const footer = [campaign, board].filter(Boolean);
  const pattern = afterAccept ? null : endedAfterSamePattern(apps);

  const data: DigestData = { date: today(now), startHere: null, alsoToday: [], comingUp: soon, footer };
  const out: string[] = [`# Today — ${today(now)}`, ""];

  if (due.length === 0) {
    const headline = stats.active === 0
      ? `Nothing needs you today: all ${stats.total} tracked applications are closed.`
      : `Nothing needs you today. Your ${stats.active} active application${stats.active === 1 ? " is" : "s are"} inside normal wait windows.`;
    const move = quietDayMove(apps, pace);
    data.headline = headline;
    data.startHere = { line: move };
    out.push(headline, "", `**Start here:** ${move}`);
    // "Nothing needs you" is a reason to close the tab; the date something
    // will is a reason to come back.
    const next = stats.active === 0 ? null : nextOnBoard(apps, now);
    if (next) {
      data.nextUp = nextOnBoardLine(next);
      out.push("", `📅 ${data.nextUp}`);
    }
  } else {
    const [first, ...rest] = due;
    data.startHere = toDigestItem(first);
    data.alsoToday = rest.map(toDigestItem);
    out.push("## Start here", first.line, `→ ${first.action}`);
    if (rest.length) {
      out.push("", `## Also today (${rest.length})`);
      for (const i of rest) out.push(`- ${i.line}`, `  → ${i.action}`);
    }
  }

  if (soon.length) {
    out.push("", "## Coming up");
    for (const i of soon) out.push(`- ${i.line}`, ...(i.action ? [`  → ${i.action}`] : []));
  }

  if (pattern) {
    data.pattern = pattern;
    out.push("", `💡 ${pattern}`);
  }

  out.push("", ...footer.map((f) => `_${f}_`));
  return respond(out.join("\n"), data);
}

/**
 * The forward move on a day nothing is due.
 *
 * With a weekly pace set this is where it earns its keep: "nothing needs you"
 * on its own is a reason to close the tab, while "two to go this week, start
 * with the Canopy role you found" is a reason to do something.
 */
function quietDayMove(apps: Application[], pace: Pace | null): string {
  const found = apps
    .filter((a) => a.status === "discovered")
    .sort((a, b) => (a.dateDiscovered ?? a.dateUpdated ?? "").localeCompare(b.dateDiscovered ?? b.dateUpdated ?? ""));
  const firstFound = found.length
    ? `You have ${found.length} role${found.length === 1 ? "" : "s"} found and not applied to; start with ${label(found[0])} (ID: ${found[0].id}).`
    : "Paste a posting and I'll check your fit and track it.";
  if (!pace) return `a good day to line up the next role. ${firstFound}`;
  const left = pace.pace - pace.sent;
  if (left > 0) {
    return `you've sent ${pace.sent} of ${pace.pace} this week, so ${countWord(left)} to go. ${firstFound}`;
  }
  return `you've hit your pace: ${pace.sent} of ${pace.pace} sent this week. Use today to deepen one live process instead: a referral ask, company research, or prep for what's next.`;
}

/** "Last 7 days: 3 sent · 1 interview", or "" when the week was empty. */
export function recentMomentum(apps: Application[], now: Date): string {
  const days = calendarDays(now);
  const inLastWeek = (iso?: string) => { const d = days(iso); return !Number.isNaN(d) && d <= 0 && d > -7; };
  const sent = apps.filter((a) => inLastWeek(a.dateApplied)).length;
  const interviews = apps.flatMap((a) => a.interviewRounds ?? []).filter((r) => inLastWeek(r.date)).length;
  const parts = [
    sent ? `${sent} sent` : "",
    interviews ? `${interviews} interview${interviews === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return parts.length ? `Last 7 days: ${parts.join(" · ")}` : "";
}

/** The next dated thing on the board, for "come back then". */
export interface NextOnBoard {
  date: string;
  /** Days from today; 1 or more. */
  inDays: number;
  /** "the Brightpath follow-up window opens", "your Canopy panel", ... */
  what: string;
}

/** A follow-up is worth sending this many days after applying; the digest's 📬 item fires then. */
const FOLLOW_UP_AFTER_DAYS = 7;

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return today(new Date(y, m - 1, d + n));
}

function weekday(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/**
 * The soonest future date anything on the board turns into work.
 *
 * A first session that ends on "added" gives no reason to come back; one that
 * ends on "next up: the Brightpath follow-up window opens Thu, Oct 15" does,
 * and names the day. Only dates the board already implies count: an interview,
 * a follow-up the user set, an offer deadline, or the week-after-applying
 * follow-up window the digest itself acts on. Nothing is invented and nothing
 * is written.
 */
export function nextOnBoard(apps: Application[], now: Date = new Date()): NextOnBoard | null {
  const days = calendarDays(now);
  const options: NextOnBoard[] = [];
  const push = (date: string | undefined, what: string) => {
    const d = days(date);
    if (!Number.isNaN(d) && d >= 1) options.push({ date: date!.slice(0, 10), inDays: d, what });
  };
  for (const app of apps) {
    if (CLOSED.includes(app.status)) continue;
    for (const r of app.interviewRounds ?? []) push(r.date, `your ${app.company} ${roundName(r.type)}`);
    if (app.status === "offer" || app.status === "negotiating") push(app.offer?.expiresDate, `the ${app.company} offer deadline`);
    if (app.followUpDue) push(app.followUpDue, `the ${app.company} follow-up you set`);
    else if (app.status === "applied" && app.dateApplied && /^\d{4}-\d{2}-\d{2}/.test(app.dateApplied)) {
      push(addDays(app.dateApplied, FOLLOW_UP_AFTER_DAYS), `the ${app.company} follow-up window`);
    }
  }
  options.sort((a, b) => a.inDays - b.inDays);
  return options[0] ?? null;
}

/** "Next up: your Canopy panel, Thu, Oct 15 (in 3 days)." */
export function nextOnBoardLine(next: NextOnBoard): string {
  return `Next up: ${next.what}, ${weekday(next.date)} (${next.inDays === 1 ? "tomorrow" : `in ${next.inDays} days`}).`;
}
