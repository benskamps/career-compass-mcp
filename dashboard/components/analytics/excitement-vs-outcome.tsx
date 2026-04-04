"use client";

import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { getAccentColor } from "@/lib/theme";

interface DataPoint { excitement: number; stageIndex: number; company: string; }

export function ExcitementVsOutcome({ data }: { data: DataPoint[] }) {
  if (data.length < 2) return null;

  const accentColor = getAccentColor();

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart>
          <XAxis dataKey="excitement" name="Excitement" domain={[0, 10]} tick={{ fill: "var(--color-text-muted, #686260)", fontSize: 10 }} />
          <YAxis dataKey="stageIndex" name="Furthest Stage" domain={[0, 6]} tick={{ fill: "var(--color-text-muted, #686260)", fontSize: 10 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-bg-surface, #1c1a17)",
              border: "1px solid var(--color-brand-border, #3a3632)",
              borderRadius: "6px",
            }}
            labelStyle={{ color: "var(--color-text-primary, #E8E0D5)" }}
          />
          <Scatter data={data} fill={accentColor} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
