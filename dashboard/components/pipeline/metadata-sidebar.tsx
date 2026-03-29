import { Badge } from "@/components/ui/badge";
import type { Application } from "@shared/schemas/career-schema";

export function MetadataSidebar({ app }: { app: Application }) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
        Details
      </h3>
      <div className="space-y-3 text-sm">
        {app.source && (
          <div className="flex justify-between">
            <span className="text-text-muted">Source</span>
            <span>{app.source}</span>
          </div>
        )}
        {app.referral && (
          <div className="flex justify-between">
            <span className="text-text-muted">Referral</span>
            <span>{app.referral}</span>
          </div>
        )}
        {app.postingUrl && (
          <div className="flex justify-between">
            <span className="text-text-muted">Posting</span>
            <a
              href={app.postingUrl}
              target="_blank"
              rel="noopener"
              className="text-accent hover:underline truncate max-w-[200px]"
            >
              View posting
            </a>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-text-muted">Remote</span>
          <Badge variant="outline" className="text-xs">
            {app.remote}
          </Badge>
        </div>
        {app.location && (
          <div className="flex justify-between">
            <span className="text-text-muted">Location</span>
            <span>{app.location}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-text-muted">Cover letter</span>
          <span>{app.coverLetterGenerated ? "Yes" : "No"}</span>
        </div>
      </div>
    </div>
  );
}
