"use client";

import type { FunnelStage } from "@/lib/analytics";
import { STATUS_COLORS } from "@/lib/theme";

export function PipelineFunnel({ stages }: { stages: FunnelStage[] }) {
  const max = Math.max(...stages.map((s) => s.count), 1);
  return (
    <div className="space-y-2">
      {stages.map((stage) => (
        <div key={stage.stage} className="flex items-center gap-3">
          <span className="text-xs w-24 text-right text-text-secondary capitalize">{stage.stage}</span>
          <div className="flex-1 h-8 relative">
            <div className="h-full rounded-button transition-all duration-300" style={{ width: `${(stage.count / max) * 100}%`, backgroundColor: STATUS_COLORS[stage.stage] ?? "#666", minWidth: stage.count > 0 ? "2rem" : "0" }} />
          </div>
          <span className="text-sm font-mono w-8">{stage.count}</span>
          {stage.conversionRate !== null && <span className="text-xs text-text-muted w-12">{stage.conversionRate}%</span>}
        </div>
      ))}
    </div>
  );
}
