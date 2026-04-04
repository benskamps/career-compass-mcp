"use client";

import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";
import type { Skill } from "@shared/schemas/career-schema";
import { getStatusColor } from "@/lib/theme";

interface SkillsRadarProps { skills: Skill[]; }

export function SkillsRadar({ skills }: SkillsRadarProps) {
  const categories = ["Leadership", "Operations", "Domain", "Technical"];
  const data = categories.map((cat) => {
    const catSkills = skills.filter((s) => s.category === cat);
    const avg = catSkills.length > 0 ? catSkills.reduce((sum, s) => sum + (s.proficiency ?? 0), 0) / catSkills.length : 0;
    return { category: cat, proficiency: Math.round(avg * 10) / 10 };
  });

  const accentColor = getStatusColor("interviewing"); // amber accent

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
          <PolarGrid stroke="var(--color-brand-border, #3a3632)" />
          <PolarAngleAxis dataKey="category" tick={{ fill: "var(--color-text-secondary, #968f87)", fontSize: 12 }} />
          <PolarRadiusAxis domain={[0, 5]} tick={{ fill: "var(--color-text-muted, #686260)", fontSize: 10 }} />
          <Radar dataKey="proficiency" stroke={accentColor} fill={accentColor} fillOpacity={0.2} strokeWidth={2} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
