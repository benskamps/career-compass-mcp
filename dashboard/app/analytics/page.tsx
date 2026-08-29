import { loadPipeline } from "@/lib/data";
import { computeAnalytics } from "@/lib/analytics";
import { ACTIVE_STATUSES } from "@/lib/theme";
import { StatCardsRow } from "@/components/analytics/stat-cards-row";
import { PipelineFunnel } from "@/components/analytics/pipeline-funnel";
import { StatusBreakdown } from "@/components/analytics/status-breakdown";
import { SourceEffectiveness } from "@/components/analytics/source-effectiveness";
import { ExcitementVsOutcome } from "@/components/analytics/excitement-vs-outcome";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AnalyticsPage() {
  const pipeline = await loadPipeline();
  const data = computeAnalytics(pipeline.applications);

  if (data.totalApplications < 3) {
    return (
      <div className="relative flex flex-col items-center justify-center min-h-[50vh] text-center p-6 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            background:
              "radial-gradient(45% 35% at 50% 30%, var(--color-accent-muted) 0%, transparent 70%)",
          }}
        />
        <div className="relative max-w-md">
          <h2 className="text-xl font-semibold mb-2 tracking-tight">Charts wake up at three</h2>
          <p className="text-text-secondary">
            Add 3+ applications via Claude to unlock analytics. Try: &ldquo;I found a job posting I&apos;m interested in&rdquo; — Claude adds it to your pipeline.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 max-w-5xl mx-auto space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-text-secondary mt-1 tabular-nums">
          {data.totalApplications} applications · {data.statusCounts ? ACTIVE_STATUSES.filter((s) => (data.statusCounts[s] ?? 0) > 0).length : 0} active stages
        </p>
      </header>
      <StatCardsRow data={data} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <Card><CardHeader><CardTitle className="text-base">Pipeline Funnel</CardTitle></CardHeader><CardContent><PipelineFunnel stages={data.funnelStages} /></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Status Breakdown</CardTitle></CardHeader><CardContent><StatusBreakdown statusCounts={data.statusCounts} /></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Source Effectiveness</CardTitle></CardHeader><CardContent><SourceEffectiveness sources={data.sourceStats} /></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Excitement vs. Outcome</CardTitle></CardHeader><CardContent><ExcitementVsOutcome data={data.excitementOutcome} /></CardContent></Card>
      </div>
    </div>
  );
}
