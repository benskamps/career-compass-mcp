import { ApplicationCard } from "./application-card";
import type { Application } from "@shared/schemas/career-schema";

interface KanbanColumnProps { label: string; applications: Application[]; color: string; }

export function KanbanColumn({ label, applications, color }: KanbanColumnProps) {
  return (
    <div className="flex flex-col min-w-[272px] w-full md:w-72 md:shrink-0">
      <div className="flex items-center gap-2 px-3 py-2 mb-3">
        <span
          className="w-2 h-2 rounded-full ring-2 ring-offset-1 ring-offset-bg-base"
          style={{ backgroundColor: color, boxShadow: `0 0 0 0 ${color}40` }}
        />
        <h2 className="text-sm font-semibold tracking-tight">{label}</h2>
        <span className="ml-auto text-[10px] font-mono text-text-muted tabular-nums px-1.5 py-0.5 rounded-md bg-bg-elevated border border-border">
          {applications.length}
        </span>
      </div>
      <div className="flex flex-col gap-2 flex-1">
        {applications.map((app) => (<ApplicationCard key={app.id} app={app} />))}
        {applications.length === 0 && (
          <div className="relative text-xs text-text-muted text-center py-8 border border-dashed border-border rounded-lg overflow-hidden">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{
                background: `radial-gradient(120% 80% at 50% 0%, ${color}10 0%, transparent 60%)`,
              }}
            />
            <span className="relative">Nothing here yet</span>
          </div>
        )}
      </div>
    </div>
  );
}
