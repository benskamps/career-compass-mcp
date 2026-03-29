import type { Application, ApplicationStatus } from "@shared/schemas/career-schema";

const TERMINAL_STATUSES: ApplicationStatus[] = ["rejected", "withdrawn", "accepted", "ghosted"];
const STAGE_ORDER: ApplicationStatus[] = ["discovered", "applied", "screening", "interviewing", "offer", "negotiating", "accepted"];

export interface SourceStat { source: string; count: number; responseRate: number; furthestStage: string; }
export interface FunnelStage { stage: string; count: number; conversionRate: number | null; }

export interface AnalyticsResult {
  totalApplications: number; responseRate: number; avgDaysToResponse: number; activeCount: number;
  statusCounts: Record<string, number>; funnelStages: FunnelStage[]; sourceStats: SourceStat[];
  priorityCounts: Record<string, number>; excitementOutcome: { excitement: number; stageIndex: number; company: string }[];
}

function stageIndex(status: ApplicationStatus): number {
  const idx = STAGE_ORDER.indexOf(status);
  return idx >= 0 ? idx : 0;
}

export function computeAnalytics(applications: Application[]): AnalyticsResult {
  const total = applications.length;
  const statusCounts: Record<string, number> = {};
  for (const app of applications) { statusCounts[app.status] = (statusCounts[app.status] ?? 0) + 1; }

  const responded = applications.filter((a) => a.status !== "applied" && a.status !== "discovered").length;
  const responseRate = total > 0 ? Math.round((responded / total) * 100) : 0;
  const activeCount = applications.filter((a) => !TERMINAL_STATUSES.includes(a.status)).length;

  const withResponse = applications.filter((a) => a.dateApplied && a.status !== "applied" && a.status !== "ghosted");
  const avgDaysToResponse = withResponse.length > 0
    ? Math.round(withResponse.reduce((sum, a) => {
        const applied = new Date(a.dateApplied!);
        const updated = new Date(a.dateUpdated);
        return sum + (updated.getTime() - applied.getTime()) / (1000 * 60 * 60 * 24);
      }, 0) / withResponse.length)
    : 0;

  const funnelStages: FunnelStage[] = STAGE_ORDER.filter((s) => s !== "negotiating").map((stage, i) => {
    const count = applications.filter((a) => stageIndex(a.status) >= i).length;
    return { stage, count, conversionRate: null };
  });
  for (let i = 1; i < funnelStages.length; i++) {
    const prev = funnelStages[i - 1].count;
    funnelStages[i].conversionRate = prev > 0 ? Math.round((funnelStages[i].count / prev) * 100) : null;
  }

  const sourceMap = new Map<string, Application[]>();
  for (const app of applications) {
    const src = app.source ?? "Unknown";
    if (!sourceMap.has(src)) sourceMap.set(src, []);
    sourceMap.get(src)!.push(app);
  }
  const sourceStats: SourceStat[] = [...sourceMap.entries()].map(([source, apps]) => {
    const resp = apps.filter((a) => a.status !== "applied" && a.status !== "discovered").length;
    const furthest = apps.reduce((max, a) => Math.max(max, stageIndex(a.status)), 0);
    return { source, count: apps.length, responseRate: apps.length > 0 ? Math.round((resp / apps.length) * 100) : 0, furthestStage: STAGE_ORDER[furthest] ?? "discovered" };
  });

  const priorityCounts: Record<string, number> = { high: 0, medium: 0, low: 0 };
  for (const app of applications.filter((a) => !TERMINAL_STATUSES.includes(a.status))) {
    priorityCounts[app.priority] = (priorityCounts[app.priority] ?? 0) + 1;
  }

  const excitementOutcome = applications.filter((a) => a.excitement !== undefined).map((a) => ({ excitement: a.excitement!, stageIndex: stageIndex(a.status), company: a.company }));

  return { totalApplications: total, responseRate, avgDaysToResponse, activeCount, statusCounts, funnelStages, sourceStats, priorityCounts, excitementOutcome };
}
