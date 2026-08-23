import { STATUS_ORDER, statusRank } from "../schemas/career-schema.js";
import type { Pipeline, Application, ApplicationStatus } from "../schemas/career-schema.js";
import { ACTIVE_STATUSES, computeStats } from "../pipeline-stats.js";

/**
 * Zero-build "lite" dashboard.
 *
 * Renders the pipeline into a single self-contained HTML document — all CSS and
 * JS inlined, no external assets, no build step. This is what ships in the npm
 * package so `career-compass-mcp dashboard` works without the Next.js standalone
 * (which is source-build only). The lite server (server.ts) re-reads the YAML on
 * every request and calls this, so the page is always live, never prerendered.
 *
 * Design note: in a plain browser there is no Claude chat bridge, so the
 * "Ask Claude" affordances copy a ready-to-paste prompt to the clipboard rather
 * than dispatching it. In Cowork, the artifact variant wires the same prompts to
 * sendPrompt() instead.
 */

// The board's column order is the funnel order declared on the schema, shared
// with `pipeline_view sortBy=status` so the two surfaces cannot disagree about
// which stage comes first.
const STAGE_ORDER: readonly ApplicationStatus[] = STATUS_ORDER;
// The same live-stage list the stats use, so the chart cannot show a stage the
// "Active" KPI is not counting.
const ACTIVE = ACTIVE_STATUSES;
/**
 * Stage colours as a temperature ramp, not a rainbow.
 *
 * These were the stock Tailwind hues — slate, sky, violet, amber, emerald, red.
 * Six fully-saturated colours from three different families, dropped into a page
 * built on warm neutrals and one clay accent: the board and the chart read as a
 * different product than the frame around them, and in dark mode the violet and
 * sky went neon.
 *
 * The replacement encodes the funnel instead of decorating it. Cool ash at the
 * top where nothing has happened yet, warming through brass and clay as a
 * conversation heats up, resolving to green when it lands. Everything is
 * desaturated enough to sit inside a warm neutral system and to hold contrast
 * on both the cream and the bark background. Terminal states are muted on
 * purpose — a rejection should not be the brightest thing on the page.
 */
const STAGE_COLOR: Record<ApplicationStatus, string> = {
  discovered: "#8e887d",   // ash — noticed, not acted on
  applied: "#7c8fa1",      // cool steel — sent, waiting
  screening: "#a2894f",    // brass — someone replied
  interviewing: "#c2603c", // clay — the product's accent, the hottest live stage
  offer: "#4f8a6d",        // sage — it landed
  negotiating: "#3f7f74",  // deep teal — landed, still moving
  accepted: "#3d7a52",     // forest — done, good
  rejected: "#a85a4a",     // muted brick — done, not good. Deliberately not red.
  withdrawn: "#8a8278",    // faded ash — done, your call
  ghosted: "#6f6a63",      // dim — done, no answer
};

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/**
 * Serialize a value for interpolation into a `<script>` body.
 *
 * HTML-escaping is wrong inside a script element — the parser does not decode
 * entities there, so `&quot;` would arrive as six literal characters and break
 * the JSON. What actually has to be neutralised is any byte sequence that ends
 * the script element early or opens an HTML comment, because the HTML parser
 * scans for those without understanding JavaScript at all.
 *
 * Today the only caller passes enum-derived labels and colours from a fixed map,
 * so nothing user-controlled reaches it. That is precisely why this exists: the
 * page renders a user's whole job search from an unauthenticated local origin,
 * and the distance between "safe by coincidence" and "stored XSS" was one line
 * — someone putting company names into the chart. `esc()` covers every other
 * interpolation on this page; this covers the last one.
 */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

interface NextAction { app: Application; label: string; urgency: "overdue" | "soon" | "info"; }

/** Derive next actions from follow-up dates, upcoming interviews, and expiring offers. */
export function deriveNextActions(apps: Application[], today = new Date()): NextAction[] {
  const out: NextAction[] = [];
  // Compare CALENDAR DAYS in the user's own timezone, not timestamps.
  // `new Date("2026-07-24")` is parsed as UTC midnight, while `Date.now()` is
  // local — so west of UTC a follow-up due today came out negative and rendered
  // as "overdue by 1d", and east of UTC tomorrow's reminder fired a day early.
  // A date-only field has no time in it; treating it as one is the bug.
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const days = (iso?: string) => {
    if (!iso) return NaN;
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    if (!y || !m || !d) return NaN;
    return Math.round((new Date(y, m - 1, d).getTime() - midnight) / 86400000);
  };
  for (const app of apps) {
    if (["accepted", "rejected", "withdrawn", "ghosted"].includes(app.status)) continue;
    const fu = days(app.followUpDue);
    if (!Number.isNaN(fu)) {
      if (fu < 0) out.push({ app, label: `Follow-up overdue by ${Math.abs(fu)}d — ${app.company}`, urgency: "overdue" });
      else if (fu <= 2) out.push({ app, label: `Follow-up due ${fu === 0 ? "today" : `in ${fu}d`} — ${app.company}`, urgency: "soon" });
    }
    // A future-dated round on an application that has already reached offer or
    // negotiating is a leftover, not a plan — the process moved past it.
    // Filtering rounds by date alone put "Interview in 2d" beside an offer
    // under review, in the demo, on the panel that is supposed to say what to
    // do next.
    const stillInterviewing = statusRank(app.status) <= statusRank("interviewing");
    const nextInterview = !stillInterviewing ? undefined : (app.interviewRounds ?? [])
      .map((r) => days(r.date)).filter((d) => !Number.isNaN(d) && d >= 0).sort((a, b) => a - b)[0];
    if (nextInterview != null && nextInterview <= 7) {
      out.push({ app, label: `Interview ${nextInterview === 0 ? "today" : `in ${nextInterview}d`} — ${app.company}`, urgency: nextInterview <= 2 ? "soon" : "info" });
    }
    if (app.offer?.expiresDate) {
      const exp = days(app.offer.expiresDate);
      if (!Number.isNaN(exp) && exp >= 0 && exp <= 14)
        out.push({ app, label: `Offer expires ${exp === 0 ? "today" : `in ${exp}d`} — ${app.company}`, urgency: exp <= 4 ? "overdue" : "soon" });
    }
  }
  const rank = { overdue: 0, soon: 1, info: 2 } as const;
  return out.sort((a, b) => rank[a.urgency] - rank[b.urgency]);
}


/**
 * One KPI card. A `null` value renders as an em dash, not a zero.
 *
 * "Prefer a blank to a zero" is not a style preference here, it is accuracy. A
 * rate over an empty denominator is undefined, and printing `0%` for it states
 * something false in the most discouraging possible place: a brand-new user's
 * very first screen said `0% response rate` before they had applied to
 * anything, which reads as *you are failing* rather than *you have not started*.
 */
function kpi(n: string | number | null, label: string, foot = ""): string {
  const value = n === null ? "—" : String(n);
  const undefinedClass = n === null ? " is-undefined" : "";
  return `<div class="kpi${undefinedClass}"><div class="n">${esc(value)}</div><div class="l">${esc(label)}</div>${foot ? `<div class="foot">${esc(foot)}</div>` : ""}</div>`;
}

function jobCard(a: Application): string {
  const color = STAGE_COLOR[a.status];
  const pr = a.priority ? `<span class="pill p-${esc(a.priority)}">${esc(a.priority)}</span>` : "";
  const exc = a.excitement != null ? `<span class="exc">🔥 ${esc(a.excitement)}/10</span>` : "";
  const prompt = `Give me a full status on my ${a.company} application (${a.role}) — where it stands, what's next, and anything I'm at risk of dropping.`;
  return `<div class="jc" style="--stage:${color}" data-prompt="${esc(prompt)}">
    <div class="co">${esc(a.company)}</div>
    <div class="ro">${esc(a.role)}</div>
    <div class="meta">${pr}${exc}</div>
  </div>`;
}

/**
 * Render the full self-contained HTML document.
 *
 * `dataDir` is passed in rather than read here so this module stays free of the
 * store (and of node-only APIs — the Next dashboard imports from this tree).
 * When it is absent the footer simply does not name a folder, which is the one
 * honest thing to say without knowing it: the footer used to print
 * `~/.career-compass` unconditionally, so anyone running with CAREER_DATA_PATH
 * set was told their data was somewhere it wasn't.
 */
export function renderLiteDashboard(pipeline: Pipeline, dataDir?: string): string {
  const apps = [...(pipeline.applications ?? [])].sort((a, b) => (b.dateUpdated ?? "").localeCompare(a.dateUpdated ?? ""));
  const s = computeStats(apps);
  const actions = deriveNextActions(apps);
  const lastUpdated = pipeline.lastUpdated ? new Date(pipeline.lastUpdated).toLocaleString() : "—";

  // With nothing in the pipeline every one of these is either zero or undefined,
  // and six cards saying so is a worse first impression than no cards at all —
  // it tells a new user six times that they have nothing. The empty state below
  // says it once, warmly, with the action attached.
  const kpis = apps.length === 0
    ? ""
    : [
        kpi(s.total, "Total applications"),
        kpi(s.active, "Active", "in play right now"),
        kpi(s.inConversation, "In conversation", "screening + interviewing"),
        kpi(s.offers, "Offers", s.offers > 0 ? "🎉 decision time" : ""),
        // A rate needs a denominator. Until something has been sent and had time
        // to come back, these are unknown rather than zero.
        kpi(s.sent > 0 ? `${s.responseRate}%` : null, "Response rate", s.sent > 0 ? "" : "no replies due yet"),
        kpi(s.sent > 0 ? `${s.ghostRate}%` : null, "Ghost rate", s.sent > 0 ? "" : "no replies due yet"),
      ].join("");

  // Only show a stage that has something in it, plus the handful of early
  // stages that read as "nothing here yet" rather than as clutter. Rendering
  // every active stage regardless meant a small pipeline still produced six
  // columns, several of them just "0 —".
  // The live funnel is the thing you scan every day; closed applications are
  // reference. Giving them equal column weight pushed the board onto a second
  // ragged row and made "Rejected" as loud as "Interviewing". Terminal stages
  // now collapse behind one disclosure.
  const CLOSED: ApplicationStatus[] = ["accepted", "rejected", "withdrawn", "ghosted"];
  const ALWAYS_SHOW: ApplicationStatus[] = ["applied", "screening", "interviewing"];

  const stageCol = (st: ApplicationStatus) => {
    const items = apps.filter((a) => a.status === st);
    return `<div class="col">
      <div class="h"><span class="sw" style="background:${STAGE_COLOR[st]}"></span> ${st} <span class="count">${items.length}</span></div>
      <div class="stack">${items.map(jobCard).join("") || '<div class="none">Nothing here yet</div>'}</div>
    </div>`;
  };

  const liveStages = STAGE_ORDER.filter(
    (st) => !CLOSED.includes(st) && (apps.some((a) => a.status === st) || ALWAYS_SHOW.includes(st)),
  );
  const closedStages = STAGE_ORDER.filter((st) => CLOSED.includes(st) && apps.some((a) => a.status === st));
  const closedCount = apps.filter((a) => CLOSED.includes(a.status)).length;

  const board = liveStages.map(stageCol).join("");
  const closedBoard = closedCount
    ? `<details class="closed">
        <summary>Closed <span class="count">${closedCount}</span>
          <span class="dots">${closedStages
            .map((st) => `<span class="sw" style="background:${STAGE_COLOR[st]}" title="${st}"></span>`)
            .join("")}</span>
        </summary>
        <div class="board">${closedStages.map(stageCol).join("")}</div>
      </details>`
    : "";

  const actionsHtml = actions.length
    ? actions.map((x) => `<div class="action ${x.urgency}"><span class="dot"></span><div class="t"><b>${esc(x.label)}</b><span>${esc(x.app.role)}</span></div></div>`).join("")
    : `<div class="none-lg">✅ Nothing overdue. Follow-ups, upcoming interviews, and expiring offers surface here.</div>`;

  const emptyState = `<div class="panel"><div class="state">
    <h3>Your pipeline is empty — let's fix that</h3>
    <div>Career Compass builds everything off your pipeline. Add your first opportunity and this dashboard lights up.</div>
    <div class="btns">
      <button class="btn primary" data-prompt="I found a job posting I want to track. Here it is: [paste posting]. Add it to my pipeline and give me a fit analysis.">Copy: track a job posting</button>
      <button class="btn" data-prompt="Add an application to my pipeline — I'll give you the company and role.">Copy: add manually</button>
    </div>
  </div></div>`;

  const chartData = jsonForScript(
    ACTIVE.filter((st) => apps.some((a) => a.status === st))
      .map((st) => ({ label: st[0].toUpperCase() + st.slice(1), value: apps.filter((a) => a.status === st).length, color: STAGE_COLOR[st] })),
  );

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Career Compass — Pipeline</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%231f1e1d'/%3E%3Ccircle cx='16' cy='16' r='10' fill='%23c2603c'/%3E%3Cpath d='M20.5 10.5 L14.5 17.5 L11.5 21.5 L17.5 14.5 Z' fill='%231f1e1d'/%3E%3C/svg%3E">
<style>
/* Warm neutrals + clay accent, so the page sits inside Claude rather than
   next to it, and follows the host's light/dark preference instead of
   blinding anyone running Claude Desktop in dark mode. */
:root{color-scheme:light dark;--bg:#faf9f5;--card:#fff;--ink:#1f1e1d;--muted:#6b675f;--line:#e8e5dd;--accent:#c2603c;--accent-soft:#f6ece7;--sunk:#f5f3ed;--shadow:0 1px 2px rgba(31,30,29,.05),0 4px 14px rgba(31,30,29,.04)}
@media(prefers-color-scheme:dark){:root{--bg:#1f1e1d;--card:#262624;--ink:#f2efe8;--muted:#a5a096;--line:#37352f;--accent:#e08560;--accent-soft:#33241d;--sunk:#221f1d;--shadow:0 1px 2px rgba(0,0,0,.3),0 4px 14px rgba(0,0,0,.22)}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:1180px;margin:0 auto;padding:20px 20px 64px}
header.top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px}
h1{font-size:20px;margin:0 0 2px;letter-spacing:-.01em}.sub{color:var(--muted);font-size:12.5px}
.chip{display:inline-flex;align-items:center;gap:6px;background:var(--accent-soft);color:var(--accent);border-radius:999px;padding:4px 10px;font-size:12px;font-weight:600}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;box-shadow:var(--shadow)}
.kpi .n{font-size:26px;font-weight:700;letter-spacing:-.02em}
.kpi.is-undefined .n{color:var(--muted);font-weight:500}.kpi .l{color:var(--muted);font-size:12px;margin-top:2px}.kpi .foot{font-size:11.5px;margin-top:6px;color:var(--muted)}
/* minmax(0,…) is load-bearing, not decoration. A grid item's default
   min-width is auto — its min-content — so a bare 1fr track is a *floor*,
   not a cap: one long unbreakable token in a company name or a follow-up
   label grows its own rail past its share, and the sibling rail is squeezed
   to whatever is left. Measured on the sample pipeline at 1512px, the rails
   went 1263px / 175px, the chart track collapsed to 3px, and the page ran
   135px off the right edge. minmax(0,1fr) lets the item shrink; the
   overflow-wrap below is what keeps the token itself inside the card once
   the box stops growing to fit it. */
.grid2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:start}@media(max-width:900px){.grid2{grid-template-columns:minmax(0,1fr)}}
.grid2>*,.board>*{min-width:0}
.action .t b,.jc .co,.jc .ro{overflow-wrap:anywhere}
.panel{background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow)}
.panel h2{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:0;padding:14px 16px;border-bottom:1px solid var(--line)}
.panel .body{padding:14px 16px}.chart-box{position:relative;display:flex;gap:10px}
.bar-row{display:flex;flex-direction:column;gap:9px;width:100%}
.bar{display:flex;align-items:center;gap:10px}.bar .lab{width:96px;font-size:12px;color:var(--muted);text-align:right;flex:0 0 auto}
.bar .track{flex:1;background:var(--sunk);border-radius:6px;height:22px;overflow:hidden}
/* display:block is load-bearing. These are <span>s, and width has no effect on
   an inline box — so every bar in this chart rendered as an empty track. */
.bar .fill{display:block;height:100%;border-radius:6px;min-width:3px;transition:width .3s ease}
.bar .val{font-size:12px;font-weight:600;width:22px}
.action{display:flex;gap:10px;padding:11px 0;border-bottom:1px dashed var(--line)}.action:last-child{border-bottom:0}
.action .dot{width:8px;height:8px;border-radius:50%;margin-top:6px;flex:0 0 auto;background:var(--accent)}
.action.overdue .dot{background:#ef4444}.action.soon .dot{background:#f59e0b}
.action .t{flex:1}.action .t b{display:block;font-size:13.5px}.action .t span{color:var(--muted);font-size:12px}
.board{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;align-items:start}
.col{background:var(--sunk);border:1px solid var(--line);border-radius:12px;min-height:80px}
.col .h{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line);font-weight:600;font-size:12.5px;text-transform:capitalize}
.col .h .sw{width:9px;height:9px;border-radius:50%}.col .h .count{margin-left:auto;background:var(--sunk);color:var(--muted);border:1px solid var(--line);border-radius:999px;font-size:11px;padding:1px 8px}
.col .stack{padding:10px;display:flex;flex-direction:column;gap:9px}.none{color:var(--muted);font-size:11.5px;padding:4px 2px}.none-lg{color:var(--muted);font-size:13px}
.jc{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--stage,#ccc);border-radius:10px;padding:10px 11px;cursor:pointer;transition:.12s}
.jc:hover{box-shadow:var(--shadow);transform:translateY(-1px)}.jc .co{font-weight:650;font-size:13px}.jc .ro{color:var(--muted);font-size:12px;margin-top:1px}
.jc .meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;align-items:center}
.pill{font-size:10.5px;padding:2px 7px;border-radius:999px;font-weight:600}.p-high{background:color-mix(in srgb,#ef4444 16%,transparent);color:#c04a3a}.p-medium{background:color-mix(in srgb,#f59e0b 18%,transparent);color:#a06a1b}.p-low{background:color-mix(in srgb,var(--muted) 16%,transparent);color:var(--muted)}
.exc{font-size:11px;color:var(--muted);margin-left:auto}
.btn{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:9px;padding:7px 12px;font-size:12.5px;font-weight:600;cursor:pointer;transition:.12s}
.btn:hover{border-color:var(--accent);color:var(--accent)}.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}.btn.primary:hover{filter:brightness(.93)}
.toolbar{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}
.state{text-align:center;padding:48px 20px;color:var(--muted)}.state h3{color:var(--ink);font-size:16px;margin:0 0 6px}.state .btns{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:16px}
.foot-note{color:var(--muted);font-size:11.5px;margin-top:22px;text-align:center}
#toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%) translateY(20px);background:var(--ink);color:var(--card);padding:10px 16px;border-radius:10px;font-size:13px;opacity:0;transition:.2s;pointer-events:none}
#toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
.closed{margin-top:12px;border-top:1px solid var(--line);padding-top:10px}
.closed summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;color:var(--muted);padding:4px 2px;border-radius:8px}
.closed summary::-webkit-details-marker{display:none}
.closed summary::before{content:"▸";display:inline-block;transition:transform .15s;color:var(--muted);font-size:11px}
.closed[open] summary::before{transform:rotate(90deg)}
.closed summary:hover{color:var(--ink)}
.closed .dots{display:inline-flex;gap:4px;margin-left:2px}
.closed .dots .sw{width:8px;height:8px;border-radius:50%}
.closed .board{margin-top:10px}
.hidden{display:none!important}
</style></head>
<body><div class="wrap">
<header class="top">
  <div><h1>🧭 Career Compass — Pipeline</h1>
  <div class="sub">Live view of your job search · re-read from disk on every load · last write ${esc(lastUpdated)}</div></div>
  <div class="chip">● local</div>
</header>
<div class="toolbar">
  <button class="btn primary" data-prompt="What should I focus on in my job search today? Look at my pipeline and give me the 3 highest-leverage moves.">🎯 Copy: what should I do today?</button>
  <button class="btn" data-prompt="Review my whole pipeline and flag anything stale, single-threaded, or at risk of going cold.">🔍 Copy: health check</button>
</div>
${kpis ? `<div class="kpis">${kpis}</div>` : ""}
${apps.length === 0 ? emptyState : `
<div class="panel" style="margin-bottom:16px">
  <h2>Pipeline by stage</h2>
  <div class="body"><div class="board">${board}</div>${closedBoard}</div>
</div>
<div class="grid2">
  <div class="panel"><h2>Next actions</h2><div class="body">${actionsHtml}</div></div>
  <div class="panel"><h2>Stage distribution</h2><div class="body"><div id="chart" class="chart-box"></div></div></div>
</div>`}
<div class="foot-note">${dataDir ? `Data stays local (<code>${esc(dataDir)}</code>).` : "Data stays local on this machine."} Click any card to copy a prompt for Claude — that's where the work happens. Refresh the page to re-read from disk.</div>
</div>
<div id="toast"></div>
<script>
const CHART=${chartData};
(function(){
  const box=document.getElementById("chart");
  if(box&&CHART.length){
    const max=Math.max(...CHART.map(d=>d.value),1);
    // Escaped on the way into innerHTML for the same reason jsonForScript exists:
    // these values are enum-derived today and this is the only place on the page
    // that builds markup from data at runtime.
    const h=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
    box.innerHTML='<div class="bar-row">'+CHART.map(d=>
      '<div class="bar"><span class="lab">'+h(d.label)+'</span><span class="track"><span class="fill" style="width:'+(Number(d.value)/max*100)+'%;background:'+h(d.color)+'"></span></span><span class="val">'+h(d.value)+'</span></div>'
    ).join("")+'</div>';
  } else if(box){ box.innerHTML='<div class="none-lg">No active applications yet.</div>'; }
  const toast=document.getElementById("toast"); let tmr;
  function flash(m){ toast.textContent=m; toast.classList.add("show"); clearTimeout(tmr); tmr=setTimeout(()=>toast.classList.remove("show"),1900); }
  document.querySelectorAll("[data-prompt]").forEach(el=>{
    el.addEventListener("click",()=>{
      const p=el.getAttribute("data-prompt");
      if(navigator.clipboard&&navigator.clipboard.writeText){
        navigator.clipboard.writeText(p).then(()=>flash("Prompt copied — paste it to Claude 🧭")).catch(()=>flash(p));
      } else { flash("Copy this: "+p); }
    });
  });
})();
</script>
</body></html>`;
}
