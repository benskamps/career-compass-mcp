"use client";

import { Card, CardContent } from "@/components/ui/card";
import type { Profile } from "@shared/schemas/career-schema";

interface StepProfileProps { profile: Profile; }

export function StepProfile({ profile }: StepProfileProps) {
  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <h2 className="text-xl font-semibold">Confirm your profile</h2>
        <p className="text-sm text-text-secondary">Claude extracted this from your resume. Does it look right?</p>
        <div className="space-y-3">
          {[
            { label: "Name", value: profile.name },
            { label: "Summary", value: profile.summary },
            { label: "Location", value: profile.location ?? "Not set" },
            { label: "Email", value: profile.email ?? "Not set" },
            { label: "LinkedIn", value: profile.linkedIn ?? "Not set" },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between items-start p-3 rounded-lg bg-bg-elevated">
              <span className="text-sm text-text-secondary">{label}</span>
              <span className="text-sm text-right max-w-xs">{value}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-text-muted">To fix anything, ask Claude: &quot;Update my profile summary to...&quot;</p>
      </CardContent>
    </Card>
  );
}
