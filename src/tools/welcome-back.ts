import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Application, CareerData } from "../schemas/career-schema.js";
import { loadCareerData, loadPipeline } from "../storage/file-store.js";
import { loadVisitState, recordActivity, saveVisitState, type VisitActivity, type VisitState } from "../storage/visit-state.js";
import { buildTodayDigest, calendarDays, type DigestData, type DigestItem } from "./today-digest.js";
import { normalizeName } from "./pipeline.js";
import { clockNow } from "../clock.js";

/**
 * "Since you were last here": the return visit, made worth something.
 *
 * Week one: people try Career Compass once and stop (1.66 uses per active
 * account). The digest knows what needs them, but only answers when asked, and
 * someone who comes back to tailor one résumé never asks. So the first tool
 * call after a gap carries a short block of what changed while they were away:
 * digest items they have not been shown yet, and loose ends from last time (a
 * fit check on a role that never made it onto the board). Nothing is written to
 * their pipeline, and the block appears once per return.
 */

/** A gap at least this long is a return, not a pause in the same sitting. */
export const RETURN_GAP_HOURS = 8;
/** Loose ends older than this are history, not "last time". */
const LOOSE_END_DAYS = 21;
const MAX_NEW_ITEMS = 3;
const MAX_LOOSE_ENDS = 2;
/** A break this long gets the offer to tidy the board. */
const LONG_BREAK_DAYS = 14;

/** Tools whose company argument is a task the user was working on. */
const ACTIVITY_VERBS: Record<string, string> = {
  explore_opportunity: "checked your fit for",
  tailor_resume: "tailored your résumé for",
  generate_cover_letter: "drafted a cover letter for",
  answer_application: "answered application questions for",
  research_company: "researched",
};

/** Diagnostics get no welcome: a broken install is not the moment. */
const NO_WELCOME = new Set(["check_setup"]);

/**
 * A stable key for a digest item: the application and the kind of item.
 *
 * The line text changes daily ("applied 8d ago", "9d ago"), so it can't be the
 * key. The leading emoji is the kind (📅 due soon, ⚠️ overdue, 🎯 interview), so
 * a follow-up that turns overdue counts as new.
 */
export function digestKey(item: DigestItem): string {
  const kind = item.line.split(" ")[0];
  if (item.applicationId) return `${item.applicationId}|${kind}`;
  return item.line.split(":")[0];
}

function itemsOf(data: DigestData): { today: DigestItem[]; all: DigestItem[] } {
  const today = [...(data.startHere?.applicationId ? [data.startHere] : []), ...data.alsoToday];
  return { today, all: [...today, ...data.comingUp] };
}

/** Calendar days, not 24-hour blocks: Monday evening to Thursday morning is "3 days ago". */
function ago(lastSeen: string, now: Date): string {
  const d = -calendarDays(now)(localDate(lastSeen));
  if (d < 1) return "earlier today";
  if (d === 1) return "yesterday";
  if (d < 14) return `${d} days ago`;
  return `${Math.round(d / 7)} weeks ago`;
}

function localDate(iso: string): string {
  const t = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

function onBoard(apps: Application[], company: string): boolean {
  const c = normalizeName(company, "company");
  return apps.some((a) => normalizeName(a.company, "company") === c);
}

/** The loose ends from last time: company work that never reached the board. */
export function looseEnds(prior: VisitState, apps: Application[], now: Date): string[] {
  const since = prior.lastSeen ? Date.parse(prior.lastSeen) : NaN;
  if (Number.isNaN(since)) return [];
  return (prior.recent ?? [])
    .filter((r) => {
      const at = Date.parse(r.at);
      // "Last time" is the last sitting: work within half a day of when they left.
      return !Number.isNaN(at) && since - at <= 12 * 3600_000 && now.getTime() - at <= LOOSE_END_DAYS * 86400_000;
    })
    .filter((r) => ACTIVITY_VERBS[r.tool] && !onBoard(apps, r.company))
    .reverse()
    .slice(0, MAX_LOOSE_ENDS)
    .map((r) => `- Last time you ${ACTIVITY_VERBS[r.tool]} ${r.company}${r.role ? ` (${r.role})` : ""}; it isn't on your board. If you applied, or want to, I can track it.`);
}

export interface WelcomeInput {
  prior: VisitState;
  apps: Application[];
  digest: DigestData | null;
  now: Date;
  tool: string;
  action?: string;
}

/**
 * The block to add to this result, or null when this is not a return or nothing
 * changed. On the digest itself the new items are already on screen, so it only
 * names them; everywhere else it lists them with their next move.
 */
export function buildWelcomeBack(input: WelcomeInput): string | null {
  const { prior, apps, digest, now, tool, action } = input;
  if (NO_WELCOME.has(tool) || !prior.lastSeen) return null;
  const hours = (now.getTime() - Date.parse(prior.lastSeen)) / 3600_000;
  if (!(hours >= RETURN_GAP_HOURS)) return null;

  const seen = new Set(prior.seenDigest ?? []);
  const fresh = digest ? itemsOf(digest).today.filter((i) => !seen.has(digestKey(i))) : [];
  const ends = looseEnds(prior, apps, now);
  // After a long break the board itself is the stale thing: silent processes
  // still counted as live. One line offers the reset rather than listing it.
  const live = apps.filter((a) => ["applied", "screening", "interviewing"].includes(a.status)).length;
  const reset = hours >= LONG_BREAK_DAYS * 24 && live >= 2 && !(tool === "pipeline_view" && action === "next_actions")
    ? `- It's been a while, so your board may be out of date: "what's on today?" sorts it, and anything that went silent can be marked ghosted in one go.`
    : "";
  if (fresh.length === 0 && ends.length === 0 && !reset) return null;

  const header = `↩️ **Since you were last here** (${ago(prior.lastSeen, now)}):`;
  const lines: string[] = [];
  if (tool === "pipeline_view" && action === "next_actions") {
    if (fresh.length) {
      const names = fresh.slice(0, MAX_NEW_ITEMS).map((i) => i.line.replace(/\s*\(ID: [^)]*\)\s*$/, ""));
      lines.push(`- New on today's list: ${names.join("; ")}`);
    }
  } else {
    for (const i of fresh.slice(0, MAX_NEW_ITEMS)) lines.push(`- ${i.line}${i.action ? ` → ${i.action}` : ""}`);
  }
  lines.push(...ends);
  if (reset) lines.push(reset);
  return ["", "---", header, ...lines].join("\n");
}

/** What a call was about, for the loose-ends list next time. */
function activityOf(tool: string, args: Record<string, unknown> | undefined, now: Date): VisitActivity | null {
  if (!ACTIVITY_VERBS[tool] || !args) return null;
  if (typeof args.applicationId === "string" && args.applicationId) return null;
  const company = typeof args.company === "string" ? args.company.trim() : "";
  if (!company) return null;
  const role = typeof args.role === "string" && args.role.trim() ? args.role.trim() : undefined;
  return { tool, company, ...(role ? { role } : {}), at: now.toISOString() };
}

// State reads and writes in this process run one at a time, so two tool calls
// in parallel can't both see the old lastSeen and both welcome the user back.
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

async function currentDigest(now: Date): Promise<{ apps: Application[]; digest: DigestData | null }> {
  try {
    const pipeline = await loadPipeline();
    let career: CareerData | null = null;
    try { career = await loadCareerData(); } catch { /* the digest works without the KB */ }
    const data = pipeline.applications.length
      ? (buildTodayDigest(pipeline, now, career).structuredContent as unknown as DigestData)
      : null;
    return { apps: pipeline.applications, digest: data };
  } catch {
    return { apps: [], digest: null };
  }
}

/**
 * Wrap every tool so a return visit opens with what changed.
 *
 * Installed once in createServer, before any tool registers. The original result
 * is returned untouched except for the block appended at the end; any failure in
 * here leaves the result exactly as the tool produced it.
 */
export function installWelcomeBack(server: McpServer): void {
  const register = server.registerTool.bind(server) as (...a: unknown[]) => unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).registerTool = (name: string, config: unknown, cb: (...a: any[]) => any) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    register(name, config, async (...args: any[]) => {
      const now = clockNow();
      const prior = await serial(async () => {
        const state = await loadVisitState();
        await saveVisitState({ ...state, lastSeen: now.toISOString() });
        return state;
      }).catch((): VisitState => ({ version: 1 }));

      const result = await cb(...args);
      if (result?.isError || !Array.isArray(result?.content)) return result;

      try {
        const toolArgs = (args[0] ?? {}) as Record<string, unknown>;
        const { apps, digest } = await currentDigest(now);
        const block = buildWelcomeBack({
          prior, apps, digest, now, tool: name,
          action: typeof toolArgs.action === "string" ? toolArgs.action : undefined,
        });
        await serial(async () => {
          let state = await loadVisitState();
          state = { ...state, lastSeen: now.toISOString(), seenDigest: digest ? itemsOf(digest).all.map(digestKey) : [] };
          const activity = activityOf(name, toolArgs, now);
          if (activity) state = recordActivity(state, activity);
          await saveVisitState(state);
        });
        if (!block) return result;
        return { ...result, content: [...result.content, { type: "text", text: block }] };
      } catch {
        return result;
      }
    });
}
