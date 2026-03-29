import { Badge } from "@/components/ui/badge";
import { CompletenessRing } from "@/components/layout/completeness-ring";
import type { Profile } from "@shared/schemas/career-schema";

export function ProfileHeader({ profile, completeness }: { profile: Profile; completeness: number }) {
  return (
    <div className="space-y-4 pb-8 border-b border-border">
      <div className="flex items-start justify-between">
        <div><h1 className="text-3xl font-semibold">{profile.name}</h1><p className="text-text-secondary mt-1 max-w-2xl">{profile.summary}</p></div>
        <CompletenessRing score={completeness} size={56} />
      </div>
      <div className="flex items-center gap-4 text-sm text-text-secondary">
        {profile.location && <span>{profile.location}</span>}
        {profile.linkedIn && <a href={`https://${profile.linkedIn}`} target="_blank" rel="noopener" className="text-accent hover:underline">LinkedIn</a>}
        {profile.portfolio && <a href={`https://${profile.portfolio}`} target="_blank" rel="noopener" className="text-accent hover:underline">Portfolio</a>}
      </div>
      <div className="flex flex-wrap gap-2">
        {profile.targetRoles.map((role) => (<Badge key={role}>{role}</Badge>))}
        {profile.targetIndustries.map((ind) => (<Badge key={ind} variant="outline">{ind}</Badge>))}
      </div>
      <div className="flex items-center gap-4 text-sm text-text-muted">
        {profile.salaryMin && profile.salaryMax && (<span className="font-mono">${profile.salaryMin.toLocaleString()}–${profile.salaryMax.toLocaleString()} {profile.salaryCurrency}</span>)}
        {profile.openToRemote && <Badge variant="secondary">Remote</Badge>}
        {profile.openToRelocation && <Badge variant="secondary">Open to relocation</Badge>}
      </div>
    </div>
  );
}
