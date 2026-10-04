/**
 * The server's idea of "now", for anything that reads relative dates.
 *
 * `CAREER_COMPASS_TODAY=YYYY-MM-DD` pins it to 9am local on that day. It exists
 * for the eval mocks: the bundled sample pipeline is written as of 2026-06-16,
 * and a digest recorded against the real clock would say "follow-up 110 days
 * overdue" and change every day, so the committed mocks could never match a
 * fresh recording. Unset, or not a date, it is just the real clock.
 */
export function clockNow(): Date {
  const pinned = process.env.CAREER_COMPASS_TODAY?.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!pinned) return new Date();
  return new Date(Number(pinned[1]), Number(pinned[2]) - 1, Number(pinned[3]), 9);
}
