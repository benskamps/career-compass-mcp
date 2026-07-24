"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type { SourceStat } from "@/lib/analytics";
import { getStatusColor } from "@/lib/theme";

export function SourceEffectiveness({ sources }: { sources: SourceStat[] }) {
  const amberAccent = getStatusColor("interviewing");
  const blueAccent = getStatusColor("applied");

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={sources} margin={{ top: 4, right: 8, left: -12, bottom: 24 }}>
          {/* interval={0} forces every source to render; without the angle they
              collide ("Company site" ran into "Recruiter outreach"). */}
          <XAxis
            dataKey="source"
            interval={0}
            angle={-20}
            textAnchor="end"
            height={52}
            tick={{ fill: "var(--color-text-secondary, #968f87)", fontSize: 11 }}
          />
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
