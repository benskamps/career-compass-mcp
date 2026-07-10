import type { Pipeline, Application, ApplicationStatus } from "../schemas/career-schema.js";

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

const STAGE_ORDER: ApplicationStatus[] = [
  "discovered", "applied", "screening", "interviewing",
  "offer", "negotiating", "accepted", "rejected", "withdrawn", "ghosted",
];
const ACTIVE: ApplicationStatus[] = [
  "discovered", "applied", "screening", "interviewing", "offer", "negotiating",
];
const STAGE_COLOR: Record<ApplicationStatus, string> = {
  discovered: "#64748b", applied: "#0ea5e9", screening: "#8b5cf6",
  interviewing: "#f59e0b", offer: "#10b981", negotiating: "#14b8a6",
  accepted: "#059669", rejected: "#ef4444", withdrawn: "#9ca3af", ghosted: "#a1a1aa",
};

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

interface NextAction { app: Application; label: string; urgency: "overdue" | "soon" | "info"; }

/** Derive next actions from follow-up dates, upcoming interviews, and expiring offers. */
export function deriveNextActions(apps: Application[], today = new Date()): NextAction[] {
  const out: NextAction[] = [];
  const t0 = today.getTime();
  const days = (iso?: string) => (iso ? Math.round((new Date(iso).getTime() - t0) / 86400000) : NaN);
  for (const app of apps) {
    if (["accepted", "rejected", "withdrawn", "ghosted"].includes(app.status)) continue;
    const fu = days(app.followUpDue);
    if (!Number.isNaN(fu)) {
      if (fu < 0) out.push({ app, label: `Follow-up overdue by ${Math.abs(fu)}d — ${app.company}`, urgency: "overdue" });
      else if (fu <= 2) out.push({ app, label: `Follow-up due ${fu === 0 ? "today" : `in ${fu}d`} — ${app.company}`, urgency: "soon" });
    }
    const nextInterview = (app.interviewRounds ?? [])
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

export interface PipelineStats {
  total: number; active: number; inConversation: number; offers: number;
  responseRate: number; ghostRate: number;
}
export function computeStats(apps: Application[]): PipelineStats {
  const total = apps.length;
  const active = apps.filter((a) => ACTIVE.includes(a.status)).length;
  const inConversation = apps.filter((a) => ["screening", "interviewing"].includes(a.status)).length;
  const offers = apps.filter((a) => ["offer", "negotiating", "accepted"].includes(a.status)).length;
  const applied = apps.filter((a) => a.status !== "discovered").length;
  const responded = apps.filter((a) => !["discovered", "applied", "ghosted"].includes(a.status)).length;
  const ghosted = apps.filter((a) => a.status === "ghosted").length;
  return {
    total, active, inConversation, offers,
    responseRate: applied ? Math.round((responded / applied) * 100) : 0,
    ghostRate: applied ? Math.round((ghosted / applied) * 100) : 0,
  };
}

function kpi(n: string | number, label: string, foot = ""): string {
  return `<div class="kpi"><div class="n">${esc(n)}</div><div class="l">${esc(label)}</div>${foot ? `<div class="foot">${esc(foot)}</div>` : ""}</div>`;
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

/** Render the full self-contained HTML document. */
export function renderLiteDashboard(pipeline: Pipeline): string {
  const apps = [...(pipeline.applications ?? [])].sort((a, b) => (b.dateUpdated ?? "").localeCompare(a.dateUpdated ?? ""));
  const s = computeStats(apps);
  const actions = deriveNextActions(apps);
  const lastUpdated = pipeline.lastUpdated ? new Date(pipeline.lastUpdated).toLocaleString() : "—";

  const kpis = [
    kpi(s.total, "Total applications"),
    kpi(s.active, "Active", "in play right now"),
    kpi(s.inConversation, "In conversation", "screening + interviewing"),
    kpi(s.offers, "Offers", s.offers > 0 ? "🎉 decision time" : ""),
    kpi(`${s.responseRate}%`, "Response rate"),
    kpi(`${s.ghostRate}%`, "Ghost rate"),
  ].join("");

  const presentStages = STAGE_ORDER.filter((st) => apps.some((a) => a.status === st) || ACTIVE.includes(st));
  const board = presentStages.map((st) => {
    const items = apps.filter((a) => a.status === st);
    return `<div class="col">
      <div class="h"><span class="sw" style="background:${STAGE_COLOR[st]}"></span> ${st} <span class="count">${items.length}</span></div>
      <div class="stack">${items.map(jobCard).join("") || '<div class="none">—</div>'}</div>
    </div>`;
  }).join("");

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

  const chartData = JSON.stringify(
    ACTIVE.filter((st) => apps.some((a) => a.status === st))
      .map((st) => ({ label: st[0].toUpperCase() + st.slice(1), value: apps.filter((a) => a.status === st).length, color: STAGE_COLOR[st] })),
  );

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Career Compass — Pipeline</title>
<style>
:root{color-scheme:light;--bg:#f7f8fa;--card:#fff;--ink:#14161c;--muted:#6b7280;--line:#e6e8ee;--accent:#4f46e5;--accent-soft:#eef0fe;--shadow:0 1px 2px rgba(20,22,28,.06),0 4px 14px rgba(20,22,28,.05)}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:1180px;margin:0 auto;padding:20px 20px 64px}
header.top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px}
h1{font-size:20px;margin:0 0 2px;letter-spacing:-.01em}.sub{color:var(--muted);font-size:12.5px}
.chip{display:inline-flex;align-items:center;gap:6px;background:var(--accent-soft);color:var(--accent);border-radius:999px;padding:4px 10px;font-size:12px;font-weight:600}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;box-shadow:var(--shadow)}
.kpi .n{font-size:26px;font-weight:700;letter-spacing:-.02em}.kpi .l{color:var(--muted);font-size:12px;margin-top:2px}.kpi .foot{font-size:11.5px;margin-top:6px;color:var(--muted)}
.grid2{display:grid;grid-template-columns:1.55fr 1fr;gap:16px;align-items:start}@media(max-width:900px){.grid2{grid-template-columns:1fr}}
.panel{background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow)}
.panel h2{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:0;padding:14px 16px;border-bottom:1px solid var(--line)}
.panel .body{padding:14px 16px}.chart-box{position:relative;height:230px;display:flex;align-items:flex-end;gap:10px}
.bar-row{display:flex;flex-direction:column;gap:9px;width:100%}
.bar{display:flex;align-items:center;gap:10px}.bar .lab{width:96px;font-size:12px;color:var(--muted);text-align:right;flex:0 0 auto}
.bar .track{flex:1;background:#f0f1f5;border-radius:6px;height:22px;overflow:hidden}.bar .fill{height:100%;border-radius:6px}
.bar .val{font-size:12px;font-weight:600;width:22px}
.action{display:flex;gap:10px;padding:11px 0;border-bottom:1px dashed var(--line)}.action:last-child{border-bottom:0}
.action .dot{width:8px;height:8px;border-radius:50%;margin-top:6px;flex:0 0 auto;background:var(--accent)}
.action.overdue .dot{background:#ef4444}.action.soon .dot{background:#f59e0b}
.action .t{flex:1}.action .t b{display:block;font-size:13.5px}.action .t span{color:var(--muted);font-size:12px}
.board{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(220px,1fr);gap:12px;overflow-x:auto;padding-bottom:8px}
.col{background:#fbfbfd;border:1px solid var(--line);border-radius:12px;min-height:80px}
.col .h{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line);font-weight:600;font-size:12.5px;text-transform:capitalize}
.col .h .sw{width:9px;height:9px;border-radius:50%}.col .h .count{margin-left:auto;background:#eef0f4;color:var(--muted);border-radius:999px;font-size:11px;padding:1px 8px}
.col .stack{padding:10px;display:flex;flex-direction:column;gap:9px}.none{color:var(--muted);font-size:11.5px;padding:4px 2px}.none-lg{color:var(--muted);font-size:13px}
.jc{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--stage,#ccc);border-radius:10px;padding:10px 11px;cursor:pointer;transition:.12s}
.jc:hover{box-shadow:var(--shadow);transform:translateY(-1px)}.jc .co{font-weight:650;font-size:13px}.jc .ro{color:var(--muted);font-size:12px;margin-top:1px}
.jc .meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;align-items:center}
.pill{font-size:10.5px;padding:2px 7px;border-radius:999px;font-weight:600}.p-high{background:#fee2e2;color:#b91c1c}.p-medium{background:#fef3c7;color:#92400e}.p-low{background:#e5e7eb;color:#4b5563}
.exc{font-size:11px;color:var(--muted);margin-left:auto}
.btn{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:9px;padding:7px 12px;font-size:12.5px;font-weight:600;cursor:pointer;transition:.12s}
.btn:hover{border-color:var(--accent);color:var(--accent)}.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}.btn.primary:hover{background:#4338ca}
.toolbar{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}
.state{text-align:center;padding:48px 20px;color:var(--muted)}.state h3{color:var(--ink);font-size:16px;margin:0 0 6px}.state .btns{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:16px}
.foot-note{color:var(--muted);font-size:11.5px;margin-top:22px;text-align:center}
#toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%) translateY(20px);background:var(--ink);color:#fff;padding:10px 16px;border-radius:10px;font-size:13px;opacity:0;transition:.2s;pointer-events:none}
#toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
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
<div class="kpis">${kpis}</div>
${apps.length === 0 ? emptyState : `
<div class="grid2">
  <div class="panel">
    <h2>Pipeline by stage</h2>
    <div class="body"><div class="board">${board}</div></div>
  </div>
  <div style="display:flex;flex-direction:column;gap:16px">
    <div class="panel"><h2>Next actions</h2><div class="body">${actionsHtml}</div></div>
    <div class="panel"><h2>Stage distribution</h2><div class="body"><div id="chart" class="chart-box"></div></div></div>
  </div>
</div>`}
<div class="foot-note">Data stays local (<code>~/.career-compass</code>). Click any card to copy a prompt for Claude — that's where the work happens. Refresh the page to re-read from disk.</div>
</div>
<div id="toast"></div>
<script>
const CHART=${chartData};
(function(){
  const box=document.getElementById("chart");
  if(box&&CHART.length){
    const max=Math.max(...CHART.map(d=>d.value),1);
    box.innerHTML='<div class="bar-row">'+CHART.map(d=>
      '<div class="bar"><span class="lab">'+d.label+'</span><span class="track"><span class="fill" style="width:'+(d.value/max*100)+'%;background:'+d.color+'"></span></span><span class="val">'+d.value+'</span></div>'
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
