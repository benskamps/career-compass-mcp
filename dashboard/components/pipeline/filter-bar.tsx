"use client";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface FilterBarProps {
  onSearchChange: (query: string) => void;
  onSortChange: (sort: string) => void;
  onPriorityFilter: (priority: string | null) => void;
}

export function FilterBar({ onSearchChange, onSortChange, onPriorityFilter }: FilterBarProps) {
  return (
    <div className="flex items-center gap-3 pb-4">
      <Input
        placeholder="Search company or role..."
        onChange={(e) => onSearchChange(e.target.value)}
        className="max-w-xs"
      />
      <Select defaultValue="date" onValueChange={(v: string | null) => onSortChange(v ?? "date")}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Sort by" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="date">Date updated</SelectItem>
          <SelectItem value="excitement">Excitement</SelectItem>
          <SelectItem value="priority">Priority</SelectItem>
          <SelectItem value="company">Company</SelectItem>
        </SelectContent>
      </Select>
      <Select defaultValue="all" onValueChange={(v: string | null) => onPriorityFilter(v === "all" || v === null ? null : v)}>
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Priority" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All priorities</SelectItem>
          <SelectItem value="high">High</SelectItem>
          <SelectItem value="medium">Medium</SelectItem>
          <SelectItem value="low">Low</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
