"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Experience } from "@shared/schemas/career-schema";

export function ExperienceTimeline({ experience }: { experience: Experience[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {experience.map((role, i) => {
        const key = `${role.company}-${role.startDate}`;
        const isOpen = expanded === key;
        return (
          <div key={key} className="flex gap-4">
            <div className="flex flex-col items-center pt-1">
              <div className="w-3 h-3 rounded-full bg-accent" />
              {i < experience.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
            </div>
            <Card className="flex-1 cursor-pointer" onClick={() => setExpanded(isOpen ? null : key)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div><h3 className="font-semibold">{role.role}</h3><p className="text-sm text-text-secondary">{role.company}</p></div>
                  <div className="text-right">
                    <span className="text-xs font-mono text-text-muted">{role.startDate} — {role.endDate}</span>
                    {role.industry && <Badge variant="outline" className="ml-2 text-[10px]">{role.industry}</Badge>}
                  </div>
                </div>
                {isOpen && role.achievements.length > 0 && (
                  <div className="mt-4 space-y-3 border-t border-border pt-3">
                    {role.achievements.map((ach, j) => (
                      <div key={j} className="space-y-1">
                        <p className="text-sm font-medium">{ach.metric}</p>
                        <p className="text-xs text-text-secondary">{ach.context}</p>
                        <p className="text-xs text-text-muted">{ach.impact}</p>
                        <div className="flex gap-1 flex-wrap">
                          {ach.keywords.map((kw) => (<span key={kw} className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted">{kw}</span>))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );
      })}
    </div>
  );
}
