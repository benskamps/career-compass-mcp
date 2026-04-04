/* ── CSS Variable reader (runtime, client-only) ─────────────────────────── */

function getCSSVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim() || fallback
  );
}

/* ── Static fallback maps (used during SSR + backward compat) ───────────── */

export const STATUS_COLORS: Record<string, string> = {
  discovered: "#64748B",
  applied: "#3B82F6",
  screening: "#6366F1",
  interviewing: "#D97706",
  offer: "#059669",
  negotiating: "#EAB308",
  accepted: "#22C55E",
  rejected: "#D44460",
  withdrawn: "#6B7280",
  ghosted: "#4B5563",
};

export const PRIORITY_COLORS: Record<string, string> = {
  high: "#E11D48",
  medium: "#D97706",
  low: "#6B7280",
};

/* ── Runtime readers (resolve CSS vars on client, fallback on server) ───── */

export function getStatusColor(status: string): string {
  const fallback = STATUS_COLORS[status] ?? "#6B7280";
  return getCSSVar(`--color-status-${status}`, fallback);
}

export function getPriorityColor(priority: string): string {
  const fallback = PRIORITY_COLORS[priority] ?? "#6B7280";
  return getCSSVar(`--color-priority-${priority}`, fallback);
}

export function getAccentColor(): string {
  return getCSSVar("--color-accent", "#D97706");
}

/* ── Constants (unchanged) ──────────────────────────────────────────────── */

export const ACTIVE_STATUSES = [
  "discovered", "applied", "screening", "interviewing", "offer", "negotiating",
] as const;

export const CLOSED_STATUSES = [
  "accepted", "rejected", "withdrawn", "ghosted",
] as const;

export const KANBAN_COLUMNS = [
  { key: "discovered", label: "Discovered" },
  { key: "applied", label: "Applied" },
  { key: "screening", label: "Screening" },
  { key: "interviewing", label: "Interviewing" },
  { key: "offer_negotiating", label: "Offer / Negotiating" },
] as const;

export function daysSince(dateString: string): number {
  const then = new Date(dateString);
  const now = new Date();
  return Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24));
}
