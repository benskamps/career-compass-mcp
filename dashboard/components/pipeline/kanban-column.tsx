import { ApplicationCard } from "./application-card";
import type { Application } from "@shared/schemas/career-schema";

interface KanbanColumnProps { label: string; applications: Application[]; color: string; }

export function KanbanColumn({ label, applications, color }: KanbanColumnProps) {
  return (
    <div className="flex flex-col w-72 shrink-0">
      <div className="flex items-center gap-2 px-3 py-2 mb-3">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <h2 className="text-sm font-semibold">{label}</h2>
        <span className="text-xs font-mono text-text-muted">{applications.length}</span>
      </div>
      <div className="flex flex-col gap-2 flex-1">
        {applications.map((app) => (<ApplicationCard key={app.id} app={app} />))}
        {applications.length === 0 && (
          <div className="text-xs text-text-muted text-center py-8 border border-dashed border-border rounded-lg">No applications</div>
        )}
      </div>
    </div>
  );
}
