"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type { SourceStat } from "@/lib/analytics";
import { getStatusColor } from "@/lib/theme";

/**
 * Applications per source, and how often each source answered.
 *
 * Two axes, not one. These series share a chart and nothing else: `count` is a
 * handful of applications and `responseRate` is a percentage, so a single linear
 * axis scaled to 100 flattened every count bar into an invisible sliver at the
 * baseline while the percentages filled the frame. The chart read as "response
 * rate is everything and volume is nothing", which is not what the data says —
 * it is what the axis said.
 *
 * Each series now states its own ruler, and the axis ticks are coloured to match
 * their bars so the pairing is readable without consulting the legend.
 */
export function SourceEffectiveness({ sources }: { sources: SourceStat[] }) {
  const amberAccent = getStatusColor("interviewing");
  const blueAccent = getStatusColor("applied");

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={sources} margin={{ top: 4, right: 4, left: -18, bottom: 24 }}>
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
          {/* Counts: left, integer ticks only — a "1.5 applications" gridline is
              a lie the axis tells on its own. */}
          <YAxis
            yAxisId="count"
            allowDecimals={false}
            tick={{ fill: amberAccent, fontSize: 10 }}
            width={34}
          />
          {/* Percentages: right, pinned to 0–100 so the same bar height means the
              same rate on every render, however the pipeline changes. */}
          <YAxis
            yAxisId="rate"
            orientation="right"
            domain={[0, 100]}
            ticks={[0, 50, 100]}
            unit="%"
            tick={{ fill: blueAccent, fontSize: 10 }}
            width={38}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-bg-surface, #1c1a17)",
              border: "1px solid var(--color-brand-border, #3a3632)",
              borderRadius: "6px",
            }}
            labelStyle={{ color: "var(--color-text-primary, #E8E0D5)" }}
            // Typed loosely on purpose: recharts' Formatter signature is a
            // union wide enough that annotating it precisely costs more than it
            // proves, and the only thing this needs to know is which series it
            // is looking at.
            formatter={(value, name) =>
              name === "Response %" ? [`${value}%`, name] : [value as number, name]
            }
          />
          <Legend />
          <Bar
            yAxisId="count"
            dataKey="count"
            fill={amberAccent}
            name="Applications"
            radius={[4, 4, 0, 0]}
          />
          <Bar
            yAxisId="rate"
            dataKey="responseRate"
            fill={blueAccent}
            name="Response %"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
