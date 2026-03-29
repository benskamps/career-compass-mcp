"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { SourceStat } from "@/lib/analytics";

export function SourceEffectiveness({ sources }: { sources: SourceStat[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={sources}>
          <XAxis dataKey="source" tick={{ fill: "#999", fontSize: 12 }} />
          <YAxis tick={{ fill: "#666", fontSize: 10 }} />
          <Tooltip contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid #333", borderRadius: "6px" }} labelStyle={{ color: "#E8E0D5" }} />
          <Bar dataKey="count" fill="#D97706" name="Applications" radius={[4, 4, 0, 0]} />
          <Bar dataKey="responseRate" fill="#3B82F6" name="Response %" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
