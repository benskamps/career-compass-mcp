// The day the eval mocks are recorded as.
//
// data/example (Alex Rivera) is written as of SAMPLE_TODAY: a panel tomorrow, a
// follow-up four days overdue, an offer deadline eleven days out. Recorded as
// is, every Alex mock showed a pipeline from June while the model's own clock
// said October, so the model rightly called it stale or sample data, and the
// memory and offer cases graded that instead of the behavior under test.
//
// So the recorder shifts every YYYY-MM-DD in a copy of the sample by the same
// number of days, keeping its shape, and pins the server's clock to EVAL_TODAY.
// The graders embed the same shifted copy. Move EVAL_TODAY to the day you
// re-record before a paid run, then run record-mocks and build-suite.
export const EVAL_TODAY = "2026-10-09";
export const SAMPLE_TODAY = "2026-06-16";

const DAY = 86400000;
const utc = (iso) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d); };
export const SHIFT_DAYS = Math.round((utc(EVAL_TODAY) - utc(SAMPLE_TODAY)) / DAY);

/** One sample date, moved to the eval calendar. */
export function evalDate(sampleIso) {
  return new Date(utc(sampleIso) + SHIFT_DAYS * DAY).toISOString().slice(0, 10);
}

/** "27 October" style, for grader prose. Add the year with `withYear`. */
export function longDate(sampleIso, withYear = false) {
  const d = new Date(utc(evalDate(sampleIso)));
  const month = d.toLocaleString("en-GB", { month: "long", timeZone: "UTC" });
  return `${d.getUTCDate()} ${month}${withYear ? ` ${d.getUTCFullYear()}` : ""}`;
}

/**
 * Every full date (YYYY-MM-DD, including the date part of a timestamp) shifted.
 * Month-only dates (an employment start of 2021-03) are history, not a moving
 * target, and are left alone.
 */
export function shiftDates(text) {
  return text.replace(/(?<!\d)(\d{4}-\d{2}-\d{2})(?!\d)/g, (iso) => evalDate(iso));
}
