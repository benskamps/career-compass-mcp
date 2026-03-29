"use client";

import { useState, useMemo } from "react";
import { KanbanColumn } from "./kanban-column";
import { FilterBar } from "./filter-bar";
import { ClosedSection } from "./closed-section";
import { KANBAN_COLUMNS, CLOSED_STATUSES, STATUS_COLORS } from "@/lib/theme";
import type { Application } from "@shared/schemas/career-schema";

interface KanbanBoardProps { applications: Application[]; }

export function KanbanBoard({ applications }: KanbanBoardProps) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("date");
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let apps = [...applications];
    if (search) {
      const q = search.toLowerCase();
      apps = apps.filter((a) => a.company.toLowerCase().includes(q) || a.role.toLowerCase().includes(q));
    }
    if (priorityFilter) {
      apps = apps.filter((a) => a.priority === priorityFilter);
    }
    apps.sort((a, b) => {
      if (sort === "date") return b.dateUpdated.localeCompare(a.dateUpdated);
      if (sort === "company") return a.company.localeCompare(b.company);
      if (sort === "excitement") return (b.excitement ?? 0) - (a.excitement ?? 0);
      if (sort === "priority") {
        const p = { high: 0, medium: 1, low: 2 };
        return (p[a.priority as keyof typeof p] ?? 1) - (p[b.priority as keyof typeof p] ?? 1);
      }
      return 0;
    });
    return apps;
  }, [applications, search, sort, priorityFilter]);

  const active = filtered.filter((a) => !(CLOSED_STATUSES as readonly string[]).includes(a.status));
  const closed = filtered.filter((a) => (CLOSED_STATUSES as readonly string[]).includes(a.status));

  const getColumnApps = (key: string): Application[] => {
    if (key === "offer_negotiating") return active.filter((a) => a.status === "offer" || a.status === "negotiating");
    return active.filter((a) => a.status === key);
  };

  if (applications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <h2 className="text-xl font-semibold mb-2">No applications yet</h2>
        <p className="text-text-secondary max-w-md">
          Open Claude and use <code className="font-mono text-accent">manage_pipeline</code> to add your first one, or paste a job posting and use <code className="font-mono text-accent">explore_opportunity</code>.
        </p>
      </div>
    );
  }

  return (
    <div>
      <FilterBar onSearchChange={setSearch} onSortChange={setSort} onPriorityFilter={setPriorityFilter} />
      <div className="flex gap-4 overflow-x-auto pb-4">
        {KANBAN_COLUMNS.map((col) => (
          <KanbanColumn
            key={col.key}
            label={col.label}
            applications={getColumnApps(col.key)}
            color={col.key === "offer_negotiating" ? STATUS_COLORS.offer : STATUS_COLORS[col.key] ?? "#666"}
          />
        ))}
      </div>
      <ClosedSection applications={closed} />
    </div>
  );
}
