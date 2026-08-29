"use client";

import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer, Label } from "recharts";
import { getAccentColor } from "@/lib/theme";
import { STAGE_ORDER } from "@/lib/analytics";

interface DataPoint { excitement: number; stageIndex: number; company: string; }

// Short labels for the outcome axis, indexed by stageIndex. Without these the
// Y axis printed raw integers 0–6 and meant nothing to a reader.
const STAGE_LABEL = STAGE_ORDER.map((s) => s.charAt(0).toUpperCase() + s.slice(1, 4));

export function ExcitementVsOutcome({ data }: { data: DataPoint[] }) {
  // Fewer than two points cannot show a correlation — but returning null left a
  // blank card with no explanation. Say why it is empty instead.
  if (data.length < 2) {
    return (
      <div className="h-48 flex items-center justify-center">
        <p className="text-sm text-text-muted text-center px-6">
          Add a couple more applications with an excitement rating to see how enthusiasm tracked with outcome.
        </p>
      </div>
    );
  }

  const accentColor = getAccentColor();

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 12, left: 8, bottom: 20 }}>
          {/* type="number" is load-bearing: without it recharts treats the axis
              as categorical, silently ignores `domain`, and plots ticks in
              insertion order. The chart looked populated and meant nothing. */}
          <XAxis
            type="number"
            dataKey="excitement"
            name="Excitement"
            domain={[0, 10]}
            ticks={[0, 2, 4, 6, 8, 10]}
            tick={{ fill: "var(--color-text-muted, #686260)", fontSize: 10 }}
          >
            <Label value="Excitement (0–10)" position="bottom" offset={4} style={{ fill: "var(--color-text-muted, #686260)", fontSize: 10 }} />
          </XAxis>
          <YAxis
            type="number"
            dataKey="stageIndex"
            name="Furthest stage"
            domain={[0, STAGE_ORDER.length - 1]}
            ticks={STAGE_ORDER.map((_, i) => i)}
            tickFormatter={(i: number) => STAGE_LABEL[i] ?? ""}
            width={44}
            tick={{ fill: "var(--color-text-muted, #686260)", fontSize: 10 }}
          />
          <ZAxis range={[60, 60]} />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            contentStyle={{
              backgroundColor: "var(--color-bg-surface, #1c1a17)",
              border: "1px solid var(--color-brand-border, #3a3632)",
              borderRadius: "6px",
            }}
            labelStyle={{ color: "var(--color-text-primary, #E8E0D5)" }}
            // Typed loosely on purpose: recharts' Formatter value type is a wide
            // union (ValueType | undefined); annotating it precisely costs more
            // than it proves. This only needs to relabel the outcome axis.
            formatter={(value, name) =>
              name === "Furthest stage" ? [STAGE_LABEL[value as number] ?? value, name] : [value, name]
            }
          />
          <Scatter data={data} fill={accentColor} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
