"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { saveSkills } from "@/app/onboarding/actions";
import type { Skill } from "@shared/schemas/career-schema";

interface StepSkillsProps { currentSkills: Skill[]; }

export function StepSkills({ currentSkills }: StepSkillsProps) {
  const [skills, setSkills] = useState<Skill[]>(currentSkills);

  const grouped = skills.reduce((acc, skill) => {
    const cat = skill.category || "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(skill);
    return acc;
  }, {} as Record<string, Skill[]>);

  const setProficiency = (name: string, proficiency: number) => {
    const updated = skills.map((s) => s.name === name ? { ...s, proficiency } : s);
    setSkills(updated);
    saveSkills(updated);
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        <h2 className="text-xl font-semibold">Review your skills</h2>
        <p className="text-sm text-text-secondary">Rate your proficiency for each skill. This helps tailor resumes and identify gaps.</p>
        {Object.entries(grouped).map(([category, catSkills]) => (
          <div key={category} className="space-y-3">
            <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">{category}</h3>
            {catSkills.map((skill) => (
              <div key={skill.name} className="flex items-center justify-between p-3 rounded-lg bg-bg-elevated">
                <div><span className="text-sm">{skill.name}</span>{skill.lastUsed && <span className="ml-2 text-xs font-mono text-text-muted">{skill.lastUsed === "current" ? "current" : `last: ${skill.lastUsed}`}</span>}</div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <button key={level} onClick={() => setProficiency(skill.name, level)} className={`w-5 h-5 rounded-full border transition-colors duration-150 ${(skill.proficiency ?? 0) >= level ? "bg-accent border-accent" : "border-border hover:border-accent/50"}`} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
