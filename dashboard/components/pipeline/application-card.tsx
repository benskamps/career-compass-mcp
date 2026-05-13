import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PRIORITY_COLORS, STATUS_COLORS, daysSince } from "@/lib/theme";
import type { Application } from "@shared/schemas/career-schema";

interface ApplicationCardProps { app: Application; }

export function ApplicationCard({ app }: ApplicationCardProps) {
  const daysInStage = daysSince(app.dateUpdated);
  const isOverdue = app.followUpDue && new Date(app.followUpDue) < new Date();

  return (
    <Link href={`/pipeline/${app.id}`} className="block rounded-xl">
      <Card
        className="border-l-2 hover:bg-bg-elevated lift-on-hover cursor-pointer"
        style={{ borderLeftColor: STATUS_COLORS[app.status] ?? "#666" }}
      >
        <CardContent className="p-4 space-y-2">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate">{app.company}</h3>
              <p className="text-xs text-text-secondary truncate">{app.role}</p>
            </div>
            <span
              className="w-2.5 h-2.5 rounded-full mt-1 shrink-0 ring-1 ring-inset ring-black/5 dark:ring-white/10"
              style={{ backgroundColor: PRIORITY_COLORS[app.priority] }}
              title={`${app.priority} priority`}
            />
          </div>
          {app.excitement && (
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                <div
                  className="h-full rounded-full bar-fill-in"
                  style={{
                    width: `${(app.excitement / 10) * 100}%`,
                    background: `linear-gradient(90deg, var(--color-accent), var(--color-accent-hover))`,
                  }}
                />
              </div>
              <span className="text-xs font-mono text-text-muted tabular-nums">{app.excitement}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono text-text-muted tabular-nums">{daysInStage}d</span>
            {app.source && (<Badge variant="outline" className="text-[10px] px-1.5 py-0">{app.source}</Badge>)}
          </div>
          {isOverdue && (<div className="text-xs text-accent font-medium">Follow-up overdue</div>)}
          {app.contacts.length > 0 && (
            <div className="flex items-center gap-1">
              <div className="w-5 h-5 rounded-full bg-bg-elevated border border-border flex items-center justify-center">
                <span className="text-[10px] font-mono text-text-muted tabular-nums">{app.contacts.length}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
