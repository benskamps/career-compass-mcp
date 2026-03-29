import { StatCard } from "./stat-card";
import type { AnalyticsResult } from "@/lib/analytics";

export function StatCardsRow({ data }: { data: AnalyticsResult }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard label="Total Applications" value={data.totalApplications} />
      <StatCard label="Response Rate" value={`${data.responseRate}%`} />
      <StatCard label="Avg Days to Response" value={data.avgDaysToResponse} detail="Excludes ghosted" />
      <StatCard label="Active" value={data.activeCount} detail={`${data.activeCount} in play`} />
    </div>
  );
}
