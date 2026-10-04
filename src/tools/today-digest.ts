import type { Application, Pipeline } from "../schemas/career-schema.js";
import { statusRank } from "../schemas/career-schema.js";
import { computeStats } from "../pipeline-stats.js";
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
      out.push({ app, score: 80 + Math.min(-fu, 7), line: `⚠️ **Overdue follow-up** — ${label(app)}: due ${fu === 0 ? "today" : `${app.followUpDue}, ${-fu} days ago`} (ID: ${app.id})`, action: nudge });
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
    } else if (quiet >= limit && !waiting) {
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

export function buildTodayDigest(pipeline: Pipeline, now: Date = new Date()): ToolResponse {
  const apps = pipeline.applications;
  const text = (t: string): ToolResponse => ({ content: [{ type: "text", text: t }] });

  if (apps.length === 0) {
    return text([
      "# Today",
      "",
      "Nothing tracked yet, so there is nothing to act on.",
      "",
      "**Start here:** paste a job posting you're considering and say \"track this\". I'll add it and check your fit. Or name a role you've already applied to (company, title, roughly when) and I'll add it with `pipeline_add`.",
      "",
      "Once something is tracked, this shows follow-ups due, interviews coming up, offer deadlines, and applications that have gone quiet, with one clear first move each day.",
    ].join("\n"));
  }

  // One item per application: its most pressing reason.
  let items = apps
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
  items.sort((x, y) => y.score - x.score);

  const due = items.filter((i) => i.score >= TODAY);
  const soon = items.filter((i) => i.score < TODAY);
  const stats = computeStats(apps);
  const board = `${stats.total} tracked · ${stats.active} active · ${stats.inConversation} in conversation · ${stats.offers} with an offer${stats.sent ? ` · ${stats.responseRate}% response rate` : ""}`;

  const out: string[] = [`# Today — ${today(now)}`, ""];

  if (due.length === 0) {
    out.push(
      stats.active === 0
        ? `Nothing needs you today: all ${stats.total} tracked applications are closed.`
        : `Nothing needs you today. Your ${stats.active} active application${stats.active === 1 ? " is" : "s are"} inside normal wait windows.`,
      "",
      "**Start here:** a good day to line up the next role. Paste a posting and I'll check your fit and track it.",
    );
  } else {
    const [first, ...rest] = due;
    out.push("## Start here", first.line, `→ ${first.action}`);
    if (rest.length) {
      out.push("", `## Also today (${rest.length})`);
      for (const i of rest) out.push(`- ${i.line}`, `  → ${i.action}`);
    }
  }

  if (soon.length) {
    out.push("", "## Coming up");
    for (const i of soon) out.push(`- ${i.line}`);
  }

  out.push("", `_${board}_`);
  return text(out.join("\n"));
}
