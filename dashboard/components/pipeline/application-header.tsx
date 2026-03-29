import { Badge } from "@/components/ui/badge";
import { STATUS_COLORS, PRIORITY_COLORS, daysSince } from "@/lib/theme";
import type { Application } from "@shared/schemas/career-schema";

export function ApplicationHeader({ app }: { app: Application }) {
  const daysActive = app.dateApplied ? daysSince(app.dateApplied) : 0;
  const isOverdue = app.followUpDue && new Date(app.followUpDue) < new Date();

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{app.company}</h1>
          <p className="text-lg text-text-secondary">{app.role}</p>
        </div>
        <Badge
          className="text-sm px-3 py-1"
          style={{ backgroundColor: STATUS_COLORS[app.status], color: "#fff" }}
        >
          {app.status}
        </Badge>
      </div>
      <div className="flex items-center gap-4 text-sm">
        <span className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: PRIORITY_COLORS[app.priority] }}
          />
          {app.priority} priority
        </span>
        {app.excitement && <span>Excitement: {app.excitement}/10</span>}
        {app.salaryRange && (
          <span className="font-mono text-text-secondary">
            ${app.salaryRange.min?.toLocaleString()}–${app.salaryRange.max?.toLocaleString()}
          </span>
        )}
      </div>
      <div className="flex gap-6 text-xs text-text-muted font-mono border-t border-border pt-3">
        <span>{daysActive}d since applied</span>
        <span>{app.interviewRounds.length} interview rounds</span>
        {isOverdue && <span className="text-accent">Follow-up overdue</span>}
      </div>
    </div>
  );
}
