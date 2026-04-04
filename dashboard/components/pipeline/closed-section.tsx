"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getStatusColor } from "@/lib/theme";
import Link from "next/link";
import type { Application } from "@shared/schemas/career-schema";

interface ClosedSectionProps { applications: Application[]; }

export function ClosedSection({ applications }: ClosedSectionProps) {
  const [open, setOpen] = useState(false);
  if (applications.length === 0) return null;

  return (
    <div className="mt-6 border-t border-border pt-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
      >
        <ChevronRight className={`w-4 h-4 transition-transform ${open ? "rotate-90" : ""}`} />
        Closed ({applications.length})
      </button>
      {open && (
        <div className="mt-3 space-y-1">
          {applications.map((app) => (
            <Link
              key={app.id}
              href={`/pipeline/${app.id}`}
              className="flex items-center justify-between p-2 rounded-lg hover:bg-bg-elevated transition-colors"
            >
              <div className="flex items-center gap-3">
                <Badge
                  variant="outline"
                  className="text-[10px]"
                  style={{ borderColor: getStatusColor(app.status), color: getStatusColor(app.status) }}
                >
                  {app.status}
                </Badge>
                <span className="text-sm">{app.company}</span>
                <span className="text-sm text-text-secondary">{app.role}</span>
              </div>
              <span className="text-xs font-mono text-text-muted">{app.dateUpdated.slice(0, 10)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
