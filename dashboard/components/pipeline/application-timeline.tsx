import type { Application } from "@shared/schemas/career-schema";
import { STATUS_COLORS } from "@/lib/theme";

export function ApplicationTimeline({ app }: { app: Application }) {
  const events: { date: string; label: string; detail?: string; color: string }[] = [];

  if (app.dateDiscovered)
    events.push({ date: app.dateDiscovered, label: "Discovered", color: STATUS_COLORS.discovered });
  if (app.dateApplied)
    events.push({ date: app.dateApplied, label: "Applied", color: STATUS_COLORS.applied });

  for (const round of app.interviewRounds) {
    events.push({
      date: round.date ?? "TBD",
      label: `Interview: ${round.type.replace("_", " ")}`,
      detail: [
        round.interviewers.length > 0 ? `With: ${round.interviewers.join(", ")}` : null,
        round.outcome,
        round.notes,
      ]
        .filter(Boolean)
        .join(" — "),
      color: STATUS_COLORS.interviewing,
    });
  }

  events.push({
    date: app.dateUpdated.slice(0, 10),
    label: `Status: ${app.status}`,
    color: STATUS_COLORS[app.status] ?? "#666",
  });

  return (
    <div className="space-y-0">
      {events.map((event, i) => (
        <div key={i} className="flex gap-4">
          <div className="flex flex-col items-center">
            <div
              className="w-3 h-3 rounded-full border-2"
              style={{ borderColor: event.color }}
            />
            {i < events.length - 1 && <div className="w-px flex-1 bg-border" />}
          </div>
          <div className="pb-6">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-text-muted">{event.date}</span>
              <span className="text-sm font-medium">{event.label}</span>
            </div>
            {event.detail && (
              <p className="text-xs text-text-secondary mt-1">{event.detail}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
