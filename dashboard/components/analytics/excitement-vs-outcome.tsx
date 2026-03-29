"use client";

import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface DataPoint { excitement: number; stageIndex: number; company: string; }

export function ExcitementVsOutcome({ data }: { data: DataPoint[] }) {
  if (data.length < 2) return null;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart>
          <XAxis dataKey="excitement" name="Excitement" domain={[0, 10]} tick={{ fill: "#666", fontSize: 10 }} />
          <YAxis dataKey="stageIndex" name="Furthest Stage" domain={[0, 6]} tick={{ fill: "#666", fontSize: 10 }} />
          <Tooltip contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid #333", borderRadius: "6px" }} labelStyle={{ color: "#E8E0D5" }} />
          <Scatter data={data} fill="#D97706" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
