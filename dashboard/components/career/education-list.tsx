import { Badge } from "@/components/ui/badge";
import type { Education } from "@shared/schemas/career-schema";

export function EducationList({ education }: { education: Education[] }) {
  if (education.length === 0) return null;
  return (
    <div className="space-y-3">
      {education.map((edu, i) => (
        <div key={i} className="flex items-start justify-between p-3 rounded-lg bg-bg-surface">
          <div><p className="text-sm font-medium">{edu.degree}</p><p className="text-xs text-text-secondary">{edu.institution}</p>{edu.honors && <p className="text-xs text-text-muted">{edu.honors}</p>}</div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-text-muted">{edu.date}</span>
            {edu.certifications.map((cert) => (<Badge key={cert} variant="outline" className="text-[10px]">{cert}</Badge>))}
          </div>
        </div>
      ))}
    </div>
  );
}
