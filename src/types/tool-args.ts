import type { ApplicationStatus } from "../schemas/career-schema.js";

// ─── Pipeline Tool Argument Types ─────────────────────────────────────────────

export type PipelineAddArgs = {
  action: "add";
  company: string;
  role: string;
  /** Raw caller input — `parseStatus` in pipeline.ts is the gate, not the type. */
  status?: string;
  postingUrl?: string;
  postingText?: string;
  source?: string;
  referral?: string;
  priority?: "high" | "medium" | "low";
  excitement?: number;
  salaryMin?: number;
  salaryMax?: number;
};

export type PipelineUpdateArgs = {
  action: "update";
  id: string;
  /** Raw caller input — `parseStatus` in pipeline.ts is the gate, not the type. */
  status?: string;
  notes?: string;
  followUpDue?: string;
  priority?: "high" | "medium" | "low";
  contactName?: string;
  contactTitle?: string;
  contactEmail?: string;
  interviewType?: "phone_screen" | "behavioral" | "technical" | "panel" | "final" | "offer_call" | "other";
  interviewDate?: string;
};

export type PipelineGetArgs = { action: "get"; id: string };

export type PipelineListArgs = {
  action: "list";
  filterStatus?: ApplicationStatus;
  filterPriority?: "high" | "medium" | "low";
  sortBy?: "date" | "status" | "priority" | "company" | "excitement";
  limit?: number;
};

export type PipelineStatsArgs = { action: "stats" };
export type PipelineNextActionsArgs = { action: "next_actions" };

export type PipelineArgs =
  | PipelineAddArgs
  | PipelineUpdateArgs
  | PipelineGetArgs
  | PipelineListArgs
  | PipelineStatsArgs
  | PipelineNextActionsArgs;

// ─── Tool Response ────────────────────────────────────────────────────────────

export type ToolResponse = {
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
};
