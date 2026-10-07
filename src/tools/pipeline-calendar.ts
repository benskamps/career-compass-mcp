import type { Application, Pipeline } from "../schemas/career-schema.js";
import { statusRank } from "../schemas/career-schema.js";
import { calendarDays } from "./today-digest.js";

/**
 * `pipeline_view action=calendar`: the pipeline's dates as an RFC 5545 file.
 *
 * Interview dates, follow-up dates and offer deadlines are typed in once and
 * then live only in the YAML, where nothing reminds anyone of them. A `.ics`
 * hands them to the calendar the user already trusts with reminders, with no
 * server, no account, and nothing sent anywhere: the text comes back in the tool
 * result and the user saves it.
 *
 * UIDs are derived from the application id and the event's role in it, so
 * importing a fresh export updates the same events instead of duplicating them.
 * DTSTAMP is the application's last update, so the same pipeline always exports
 * byte-identical text.
 */

export const CALENDAR_FILENAME = "career-compass.ics";

interface CalendarEvent {
  uid: string;
  date: string;
  summary: string;
  description: string;
  stamp: string;
}

/** RFC 5545 §3.3.11 TEXT escaping. */
export function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** RFC 5545 §3.1: lines longer than 75 octets fold with CRLF + one space, never inside a character. */
export function foldLine(line: string): string {
  const out: string[] = [];
  let current = "";
  let octets = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch, "utf-8");
    // Continuation lines start with a space, which counts toward their 75.
    const limit = out.length === 0 ? 75 : 74;
    if (octets + size > limit) {
      out.push(current);
      current = "";
      octets = 0;
    }
    current += ch;
    octets += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

const basicDate = (iso: string) => iso.slice(0, 10).replace(/-/g, "");

function nextDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10).replace(/-/g, "");
}

function stampOf(app: Application): string {
  const ms = Date.parse(app.dateUpdated);
  const iso = new Date(Number.isNaN(ms) ? 0 : ms).toISOString();
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

const label = (app: Application) => `${app.company} / ${app.role}`;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

/** Every dated thing still ahead of the user, oldest first. */
export function calendarEvents(pipeline: Pipeline, now: Date): CalendarEvent[] {
  const days = calendarDays(now);
  const ahead = (iso?: string): iso is string => Boolean(iso) && ISO_DATE.test(iso!) && days(iso) >= 0;
  const events: CalendarEvent[] = [];

  for (const app of pipeline.applications) {
    const stamp = stampOf(app);
    const ref = `Career Compass application ${app.id}.`;
    // As in the digest: a future round on an application past interviewing is a leftover.
    if (statusRank(app.status) <= statusRank("interviewing")) {
      (app.interviewRounds ?? []).forEach((r, i) => {
        if (!ahead(r.date)) return;
        const who = r.interviewers?.length ? `Interviewers: ${r.interviewers.join(", ")}. ` : "";
        events.push({
          uid: `${app.id}-round-${i}@career-compass`,
          date: r.date,
          summary: `Interview: ${r.type.replace(/_/g, " ")} — ${label(app)}`,
          description: `${who}${ref}`,
          stamp,
        });
      });
    }
    const live = statusRank(app.status) < statusRank("accepted");
    if (live && ahead(app.followUpDue)) {
      events.push({
        uid: `${app.id}-follow-up@career-compass`,
        date: app.followUpDue,
        summary: `Follow up — ${label(app)}`,
        description: `A follow-up you set. ${ref}`,
        stamp,
      });
    }
    if ((app.status === "offer" || app.status === "negotiating") && ahead(app.offer?.expiresDate)) {
      events.push({
        uid: `${app.id}-offer-deadline@career-compass`,
        date: app.offer!.expiresDate!,
        summary: `Offer answer due — ${label(app)}`,
        description: `The date ${app.company} needs an answer by. ${ref}`,
        stamp,
      });
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.uid.localeCompare(b.uid));
}

/** The whole VCALENDAR, CRLF line endings throughout. */
export function buildCalendar(pipeline: Pipeline, now: Date): { ics: string; events: number } {
  const events = calendarEvents(pipeline, now);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Career Compass//Job search pipeline//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Career Compass",
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${e.stamp}`,
      `DTSTART;VALUE=DATE:${basicDate(e.date)}`,
      `DTEND;VALUE=DATE:${nextDay(e.date)}`,
      `SUMMARY:${escapeText(e.summary)}`,
      `DESCRIPTION:${escapeText(e.description)}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return { ics: lines.map(foldLine).join("\r\n") + "\r\n", events: events.length };
}
