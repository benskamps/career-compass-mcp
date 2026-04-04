"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { getStatusColor } from "@/lib/theme";

export function StatusBreakdown({ statusCounts }: { statusCounts: Record<string, number> }) {
  const data = Object.entries(statusCounts)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => ({ name: status, value: count, fill: getStatusColor(status) }));

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={50}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-bg-surface, #1c1a17)",
              border: "1px solid var(--color-brand-border, #3a3632)",
              borderRadius: "6px",
            }}
            labelStyle={{ color: "var(--color-text-primary, #E8E0D5)" }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-3 justify-center mt-2">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-1.5 text-xs">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.fill }} />
            <span className="text-text-secondary capitalize">{d.name}</span>
            <span className="font-mono text-text-muted">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
