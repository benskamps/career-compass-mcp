import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleAdd,
  handleUpdate,
  handleGet,
  handleList,
  handleStats,
  handleNextActions,
} from "../pipeline.js";
import type { Pipeline, Application } from "../../schemas/career-schema.js";
import type {
  PipelineAddArgs,
  PipelineUpdateArgs,
  PipelineGetArgs,
  PipelineListArgs,
} from "../../types/tool-args.js";

vi.mock("../../storage/file-store.js", () => ({
  loadPipeline: vi.fn(),
  savePipeline: vi.fn(),
  isCorruptDataError: (e: unknown) =>
    e instanceof Error && e.name === "CorruptDataError",
}));

function makePipeline(apps: Pipeline["applications"] = []): Pipeline {
  return { applications: apps, lastUpdated: new Date().toISOString() };
}

function makeApp(overrides: Partial<Application> = {}): Application {
  return {
    id: "test-001",
    company: "TestCorp",
    role: "Engineer",
    status: "applied",
    dateApplied: "2026-03-01",
    dateUpdated: "2026-03-01T00:00:00.000Z",
    priority: "medium",
    contacts: [],
    interviewRounds: [],
    notes: [],
    coverLetterGenerated: false,
    remote: "unknown",
    ...overrides,
  };
}

// ─── handleAdd ───────────────────────────────────────────────────────────────

describe("handleAdd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds an application and returns success message", async () => {
    const pipeline = makePipeline();
    const args: PipelineAddArgs = {
      action: "add",
      company: "Acme Inc",
      role: "Staff Engineer",
    };

    const result = await handleAdd(args, pipeline);

    expect(pipeline.applications).toHaveLength(1);
    expect(result.content[0].text).toContain("Acme Inc");
    expect(result.content[0].text).toContain("Staff Engineer");
    expect(result.content[0].text).toContain("applied");
  });

  it("generates an ID, sets status to applied, and uses current date", async () => {
    const pipeline = makePipeline();
    const args: PipelineAddArgs = {
      action: "add",
      company: "NewCo",
      role: "Developer",
    };

    await handleAdd(args, pipeline);

    const app = pipeline.applications[0];
    expect(app.id).toBeDefined();
    expect(app.id.length).toBe(8);
    expect(app.status).toBe("applied");
    expect(app.dateApplied).toBe(new Date().toISOString().slice(0, 10));
  });

  it("uses provided priority and excitement", async () => {
    const pipeline = makePipeline();
    const args: PipelineAddArgs = {
      action: "add",
      company: "BigCo",
      role: "Lead",
      priority: "high",
      excitement: 9,
    };

    await handleAdd(args, pipeline);

    const app = pipeline.applications[0];
    expect(app.priority).toBe("high");
    expect(app.excitement).toBe(9);
  });

  it("defaults priority to medium when not provided", async () => {
    const pipeline = makePipeline();
    const args: PipelineAddArgs = {
      action: "add",
      company: "MedCo",
      role: "IC",
    };

    await handleAdd(args, pipeline);
    expect(pipeline.applications[0].priority).toBe("medium");
  });

  it("creates salary range when min/max provided", async () => {
    const pipeline = makePipeline();
    const args: PipelineAddArgs = {
      action: "add",
      company: "PayCo",
      role: "SWE",
      salaryMin: 150000,
      salaryMax: 200000,
    };

    await handleAdd(args, pipeline);

    const app = pipeline.applications[0];
    expect(app.salaryRange).toEqual({ min: 150000, max: 200000, currency: "USD" });
  });
});

// ─── handleUpdate ────────────────────────────────────────────────────────────

describe("handleUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates status of an existing application", async () => {
    const app = makeApp({ id: "upd-001" });
    const pipeline = makePipeline([app]);
    const args: PipelineUpdateArgs = {
      action: "update",
      id: "upd-001",
      status: "screening",
    };

    const result = await handleUpdate(args, pipeline);

    expect(pipeline.applications[0].status).toBe("screening");
    expect(result.content[0].text).toContain("screening");
  });

  it("returns error for unknown ID", async () => {
    const pipeline = makePipeline([makeApp()]);
    const args: PipelineUpdateArgs = {
      action: "update",
      id: "nonexistent",
    };

    const result = await handleUpdate(args, pipeline);

    expect(result.content[0].text).toContain("not found");
  });

  it("appends a note with date prefix", async () => {
    const app = makeApp({ id: "note-001", notes: [] });
    const pipeline = makePipeline([app]);
    const args: PipelineUpdateArgs = {
      action: "update",
      id: "note-001",
      notes: "Had a great call with recruiter",
    };

    await handleUpdate(args, pipeline);

    const notes = pipeline.applications[0].notes;
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/^\[\d{4}-\d{2}-\d{2}\] Had a great call with recruiter$/);
  });

  it("adds a contact when contactName is provided", async () => {
    const app = makeApp({ id: "contact-001" });
    const pipeline = makePipeline([app]);
    const args: PipelineUpdateArgs = {
      action: "update",
      id: "contact-001",
      contactName: "Jane Doe",
      contactTitle: "Hiring Manager",
      contactEmail: "jane@test.com",
    };

    await handleUpdate(args, pipeline);

    const contacts = pipeline.applications[0].contacts;
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toEqual({
      name: "Jane Doe",
      title: "Hiring Manager",
      email: "jane@test.com",
    });
  });

  it("adds an interview round when interviewType is provided", async () => {
    const app = makeApp({ id: "intv-001" });
    const pipeline = makePipeline([app]);
    const args: PipelineUpdateArgs = {
      action: "update",
      id: "intv-001",
      interviewType: "technical",
      interviewDate: "2026-04-10",
    };

    await handleUpdate(args, pipeline);

    const rounds = pipeline.applications[0].interviewRounds;
    expect(rounds).toHaveLength(1);
    expect(rounds[0].type).toBe("technical");
    expect(rounds[0].date).toBe("2026-04-10");
  });

  it("updates priority", async () => {
    const app = makeApp({ id: "pri-001", priority: "low" });
    const pipeline = makePipeline([app]);
    const args: PipelineUpdateArgs = {
      action: "update",
      id: "pri-001",
      priority: "high",
    };

    await handleUpdate(args, pipeline);

    expect(pipeline.applications[0].priority).toBe("high");
  });
});

// ─── handleGet ───────────────────────────────────────────────────────────────

describe("handleGet", () => {
  it("returns application JSON for a valid ID", () => {
    const app = makeApp({ id: "get-001", company: "GetCo" });
    const pipeline = makePipeline([app]);
    const args: PipelineGetArgs = { action: "get", id: "get-001" };

    const result = handleGet(args, pipeline);
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.id).toBe("get-001");
    expect(parsed.company).toBe("GetCo");
  });

  it("returns error for missing ID", () => {
    const pipeline = makePipeline([makeApp()]);
    const args: PipelineGetArgs = { action: "get", id: "missing-id" };

    const result = handleGet(args, pipeline);

    expect(result.content[0].text).toContain("not found");
  });
});

// ─── handleList ──────────────────────────────────────────────────────────────

describe("handleList", () => {
  it("returns markdown table with all apps", () => {
    const apps = [
      makeApp({ id: "l-001", company: "Alpha" }),
      makeApp({ id: "l-002", company: "Beta" }),
    ];
    const pipeline = makePipeline(apps);
    const args: PipelineListArgs = { action: "list" };

    const result = handleList(args, pipeline);
    const text = result.content[0].text;

    expect(text).toContain("2 total");
    expect(text).toContain("Alpha");
    expect(text).toContain("Beta");
    expect(text).toContain("| ID |");
  });

  it("filters by status", () => {
    const apps = [
      makeApp({ id: "fs-001", company: "Applied Co", status: "applied" }),
      makeApp({ id: "fs-002", company: "Screening Co", status: "screening" }),
    ];
    const pipeline = makePipeline(apps);
    const args: PipelineListArgs = { action: "list", filterStatus: "screening" };

    const result = handleList(args, pipeline);
    const text = result.content[0].text;

    expect(text).toContain("1 total");
    expect(text).toContain("Screening Co");
    expect(text).not.toContain("Applied Co");
  });

  it("filters by priority", () => {
    const apps = [
      makeApp({ id: "fp-001", company: "HighPri", priority: "high" }),
      makeApp({ id: "fp-002", company: "LowPri", priority: "low" }),
    ];
    const pipeline = makePipeline(apps);
    const args: PipelineListArgs = { action: "list", filterPriority: "high" };

    const result = handleList(args, pipeline);
    const text = result.content[0].text;

    expect(text).toContain("1 total");
    expect(text).toContain("HighPri");
    expect(text).not.toContain("LowPri");
  });

  it("sorts by excitement descending", () => {
    const apps = [
      makeApp({ id: "se-001", company: "LowExcite", excitement: 3, dateUpdated: "2026-03-01T00:00:00.000Z" }),
      makeApp({ id: "se-002", company: "HighExcite", excitement: 9, dateUpdated: "2026-03-01T00:00:00.000Z" }),
    ];
    const pipeline = makePipeline(apps);
    const args: PipelineListArgs = { action: "list", sortBy: "excitement" };

    const result = handleList(args, pipeline);
    const text = result.content[0].text;

    const highIdx = text.indexOf("HighExcite");
    const lowIdx = text.indexOf("LowExcite");
    expect(highIdx).toBeLessThan(lowIdx);
  });

  it("respects limit parameter", () => {
    const apps = [
      makeApp({ id: "lim-001", company: "A", dateUpdated: "2026-03-03T00:00:00.000Z" }),
      makeApp({ id: "lim-002", company: "B", dateUpdated: "2026-03-02T00:00:00.000Z" }),
      makeApp({ id: "lim-003", company: "C", dateUpdated: "2026-03-01T00:00:00.000Z" }),
    ];
    const pipeline = makePipeline(apps);
    const args: PipelineListArgs = { action: "list", limit: 2 };

    const result = handleList(args, pipeline);
    const text = result.content[0].text;

    expect(text).toContain("3 total");
    expect(text).toContain("showing 2");
  });
});

// ─── handleStats ─────────────────────────────────────────────────────────────

describe("handleStats", () => {
  it("returns correct counts for mixed statuses", () => {
    const apps = [
      makeApp({ id: "s-001", status: "applied" }),
      makeApp({ id: "s-002", status: "applied" }),
      makeApp({ id: "s-003", status: "screening" }),
      makeApp({ id: "s-004", status: "rejected" }),
      makeApp({ id: "s-005", status: "offer" }),
    ];
    const pipeline = makePipeline(apps);

    const result = handleStats(pipeline);
    const text = result.content[0].text;

    expect(text).toContain("Total applications:** 5");
    expect(text).toContain("**applied**: 2");
    expect(text).toContain("**screening**: 1");
    expect(text).toContain("**rejected**: 1");
    expect(text).toContain("**offer**: 1");
  });

  it("handles empty pipeline", () => {
    const pipeline = makePipeline([]);

    const result = handleStats(pipeline);
    const text = result.content[0].text;

    expect(text).toContain("Total applications:** 0");
    expect(text).toContain("Active:** 0");
    expect(text).toContain("Response rate:** 0%");
  });

  it("calculates response rate correctly", () => {
    // 4 total, 1 still "applied" => response rate = (4-1)/4 * 100 = 75%
    const apps = [
      makeApp({ id: "rr-001", status: "applied" }),
      makeApp({ id: "rr-002", status: "screening" }),
      makeApp({ id: "rr-003", status: "interviewing" }),
      makeApp({ id: "rr-004", status: "rejected" }),
    ];
    const pipeline = makePipeline(apps);

    const result = handleStats(pipeline);
    const text = result.content[0].text;

    expect(text).toContain("Response rate:** 75%");
  });

  it("identifies active vs closed applications", () => {
    // Active = not in ["rejected", "withdrawn", "accepted", "ghosted"]
    const apps = [
      makeApp({ id: "ac-001", status: "applied" }),     // active
      makeApp({ id: "ac-002", status: "screening" }),    // active
      makeApp({ id: "ac-003", status: "rejected" }),     // closed
      makeApp({ id: "ac-004", status: "withdrawn" }),    // closed
      makeApp({ id: "ac-005", status: "accepted" }),     // closed
    ];
    const pipeline = makePipeline(apps);

    const result = handleStats(pipeline);
    const text = result.content[0].text;

    expect(text).toContain("Active:** 2");
  });
});

// ─── handleNextActions ───────────────────────────────────────────────────────

describe("handleNextActions", () => {
  it("flags overdue follow-ups", () => {
    const app = makeApp({
      id: "fu-001",
      status: "screening",
      followUpDue: "2026-01-01",
    });
    const pipeline = makePipeline([app]);

    const result = handleNextActions(pipeline);
    const text = result.content[0].text;

    expect(text).toContain("Overdue follow-up");
    expect(text).toContain("fu-001");
  });

  it("flags pending offers", () => {
    const app = makeApp({
      id: "off-001",
      status: "offer",
      company: "OfferCo",
      role: "Lead",
    });
    const pipeline = makePipeline([app]);

    const result = handleNextActions(pipeline);
    const text = result.content[0].text;

    expect(text).toContain("Pending offer");
    expect(text).toContain("OfferCo");
  });

  it("flags stale applied apps (7+ days)", () => {
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 10);
    const app = makeApp({
      id: "stale-001",
      status: "applied",
      dateUpdated: staleDate.toISOString(),
      company: "StaleCo",
    });
    const pipeline = makePipeline([app]);

    const result = handleNextActions(pipeline);
    const text = result.content[0].text;

    expect(text).toContain("Follow up");
    expect(text).toContain("StaleCo");
    expect(text).toContain("10d ago");
  });

  it("returns all-clear for pipeline with only closed apps", () => {
    const apps = [
      makeApp({ id: "cl-001", status: "rejected" }),
      makeApp({ id: "cl-002", status: "withdrawn" }),
      makeApp({ id: "cl-003", status: "accepted" }),
    ];
    const pipeline = makePipeline(apps);

    const result = handleNextActions(pipeline);
    const text = result.content[0].text;

    expect(text).toContain("No immediate actions needed");
  });

  it("flags screening apps stale for 5+ days", () => {
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 6);
    const app = makeApp({
      id: "scr-001",
      status: "screening",
      dateUpdated: staleDate.toISOString(),
      company: "ScreenCo",
    });
    const pipeline = makePipeline([app]);

    const result = handleNextActions(pipeline);
    const text = result.content[0].text;

    expect(text).toContain("Check status");
    expect(text).toContain("ScreenCo");
  });
});
