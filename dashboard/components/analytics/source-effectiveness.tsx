"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type { SourceStat } from "@/lib/analytics";
import { getStatusColor } from "@/lib/theme";

export function SourceEffectiveness({ sources }: { sources: SourceStat[] }) {
  const amberAccent = getStatusColor("interviewing");
  const blueAccent = getStatusColor("applied");

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={sources}>
          <XAxis dataKey="source" tick={{ fill: "var(--color-text-secondary, #968f87)", fontSize: 12 }} />
          <YAxis tick={{ fill: "var(--color-text-muted, #686260)", fontSize: 10 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-bg-surface, #1c1a17)",
              border: "1px solid var(--color-brand-border, #3a3632)",
              borderRadius: "6px",
            }}
            labelStyle={{ color: "var(--color-text-primary, #E8E0D5)" }}
          />
          <Legend />
          <Bar dataKey="count" fill={amberAccent} name="Applications" radius={[4, 4, 0, 0]} />
          <Bar dataKey="responseRate" fill={blueAccent} name="Response %" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
