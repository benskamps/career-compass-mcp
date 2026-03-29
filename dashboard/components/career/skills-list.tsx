import type { Skill } from "@shared/schemas/career-schema";

export function SkillsList({ skills }: { skills: Skill[] }) {
  const grouped = skills.reduce((acc, s) => {
    const cat = s.category || "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {} as Record<string, Skill[]>);

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([category, catSkills]) => (
        <div key={category}>
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">{category}</h3>
          <div className="space-y-2">
            {catSkills.map((skill) => {
              const isCurrent = skill.lastUsed === "current";
              return (
                <div key={skill.name} className={`flex items-center justify-between p-3 rounded-lg bg-bg-surface ${!isCurrent && skill.lastUsed ? "opacity-60" : ""}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-sm">{skill.name}</span>
                    {skill.yearsUsed && <span className="text-xs font-mono text-text-muted">{skill.yearsUsed}y</span>}
                  </div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((level) => (<div key={level} className={`w-3 h-3 rounded-full ${(skill.proficiency ?? 0) >= level ? "bg-accent" : "bg-border"}`} />))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
