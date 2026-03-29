import { loadPipeline } from "@/lib/data";
import { computeAnalytics } from "@/lib/analytics";
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
    return (<div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6"><h2 className="text-xl font-semibold mb-2">Not enough data yet</h2><p className="text-text-secondary max-w-md">Add more applications to unlock analytics. Your data tells a story — we need a few more chapters.</p></div>);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <h1 className="text-2xl font-semibold">Analytics</h1>
      <StatCardsRow data={data} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card><CardHeader><CardTitle className="text-base">Pipeline Funnel</CardTitle></CardHeader><CardContent><PipelineFunnel stages={data.funnelStages} /></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Status Breakdown</CardTitle></CardHeader><CardContent><StatusBreakdown statusCounts={data.statusCounts} /></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Source Effectiveness</CardTitle></CardHeader><CardContent><SourceEffectiveness sources={data.sourceStats} /></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Excitement vs. Outcome</CardTitle></CardHeader><CardContent><ExcitementVsOutcome data={data.excitementOutcome} /></CardContent></Card>
      </div>
    </div>
  );
}
