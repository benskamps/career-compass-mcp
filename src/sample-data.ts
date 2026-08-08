import { existsSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

/**
 * The bundled Alex Rivera sample, kept current.
 *
 * `data/example/` is the one populated Career KB anybody can look at without
 * typing their own history in: the README points at it, the screenshots are
 * taken from it, and `CAREER_DATA_PATH=data/example` is the documented way to
 * see the dashboard with something in it. Every date in it was written by hand
 * in June 2026 — a panel "coming up" on the 17th, a follow-up "due" on the
 * 26th. Nothing ages those, so the demo curdles: within weeks the interviews
 * have already happened, the follow-ups are months overdue, and the first
 * impression of a job-search tool is a search that was abandoned.
 *
 * Rather than re-date the YAML on a schedule (which only moves the expiry), the
 * dates are shifted at read time by the distance between {@link SAMPLE_ANCHOR}
 * — the sample's own notion of "today" — and the real today. The relative shape
 * the sample was authored with is exactly preserved: the panel is still three
 * days out, the rejection still landed a week ago. The files on disk are never
 * touched, and only the copy inside this package is affected: a user's own data
 * goes through untouched, whatever dates it has.
 */

/**
 * The day the sample was written to represent. Its newest `dateUpdated`.
 *
 * Shifting by (today − anchor) puts the most recently touched application at
 * today, upcoming interviews and follow-ups in the future, and closed
 * applications in the recent past — which is what the author drew.
 */
export const SAMPLE_ANCHOR = "2026-06-14";

/** A whole-string date: `YYYY-MM-DD`, optionally followed by a time. */
const DATE_STRING = /^(\d{4})-(\d{2})-(\d{2})(.*)$/;
/** A date used as a note prefix: `[2026-06-01] Tailored resume…`. */
const NOTE_DATE = /\[(\d{4})-(\d{2})-(\d{2})\]/g;

function toUtcDay(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d);
}

function daysBetween(fromIso: string, to: Date): number {
  const [y, m, d] = fromIso.split("-").map(Number);
  // The target is read as a calendar day in the user's own timezone: "today"
  // means the date on their wall, not a UTC instant.
  const toDay = toUtcDay(to.getFullYear(), to.getMonth() + 1, to.getDate());
  return Math.round((toDay - toUtcDay(y, m, d)) / 86400000);
}

function shiftDay(y: number, m: number, d: number, days: number): string {
  const shifted = new Date(toUtcDay(y, m, d) + days * 86400000);
  return shifted.toISOString().slice(0, 10);
}

function shiftString(value: string, days: number): string {
  const whole = DATE_STRING.exec(value);
  if (whole) {
    const [, y, m, d, rest] = whole;
    return shiftDay(Number(y), Number(m), Number(d), days) + rest;
  }
  // `YYYY-MM` (employment history) has no day and is not a moving target — a
  // job that started in 2021-03 started in 2021-03 — so it is left alone by
  // both patterns on purpose.
  return value.replace(NOTE_DATE, (_all, y: string, m: string, d: string) =>
    `[${shiftDay(Number(y), Number(m), Number(d), days)}]`,
  );
}

/**
 * Return a copy of `value` with every date shifted forward to sit around
 * `today`. Pure: the input is never mutated, so a caller can hand it a parsed
 * document and keep the original.
 *
 * `today` is injectable so tests are not a function of the day they run on.
 */
export function freshenSampleDates<T>(value: T, today: Date = new Date()): T {
  const days = daysBetween(SAMPLE_ANCHOR, today);
  if (days === 0) return value;
  const walk = (node: unknown): unknown => {
    if (typeof node === "string") return shiftString(node, days);
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      return Object.fromEntries(
        Object.entries(node as Record<string, unknown>).map(([k, v]) => [k, walk(v)]),
      );
    }
    return node;
  };
  return walk(value) as T;
}

/**
 * This module's own directory, or null where that question has no answer.
 *
 * `import.meta.url` is not always a `file:` URL — under the dashboard's browser
 * -like test environment it is an `http:` one, and fileURLToPath throws on it.
 * That threw out of a *load*, so an unrelated Career-KB read failed with
 * "The URL must be of scheme file". Locating the demo is best-effort by nature;
 * failing to locate it must never fail the caller.
 */
function moduleDir(): string | null {
  try {
    return resolve(fileURLToPath(new URL(".", import.meta.url)));
  } catch {
    return null;
  }
}

/**
 * Absolute path of the sample that ships inside this package.
 *
 * Resolved by walking up to our own package.json rather than a fixed number of
 * `..` hops, because this module runs from `src/` under vitest and from
 * `build/src/` when installed — the same reason version.ts walks. Falls back to
 * the working directory when the module's own path is unavailable, which walks
 * up to the same package.json from anywhere inside the project.
 */
function findBundledSampleDir(): string | null {
  let dir = moduleDir() ?? process.cwd();
  for (;;) {
    const pkg = join(dir, "package.json");
    if (existsSync(pkg)) {
      try {
        const parsed = JSON.parse(readFileSync(pkg, "utf-8")) as { name?: unknown };
        if (parsed.name === "career-compass-mcp") {
          const sample = join(dir, "data", "example");
          return existsSync(sample) ? sample : null;
        }
      } catch {
        // Unreadable package.json — keep walking rather than give up here.
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

let cached: string | null | undefined;

export function bundledSampleDir(): string | null {
  if (cached === undefined) cached = findBundledSampleDir();
  return cached;
}

/** Is this data directory the demo that ships with the package? */
export function isBundledSampleDir(dir: string): boolean {
  const sample = bundledSampleDir();
  return sample !== null && resolve(dir) === resolve(sample);
}
