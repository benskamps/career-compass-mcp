"use client";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface SettingsDropdownProps {
  dataPath: string;
  version: string;
}

export function SettingsDropdown({ dataPath, version }: SettingsDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="p-2 rounded-button text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors duration-150">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="2.5" />
          <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M2.87 2.87l1.06 1.06M12.07 12.07l1.06 1.06M2.87 13.13l1.06-1.06M12.07 3.93l1.06-1.06" />
        </svg>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Settings</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <span className="text-xs font-mono text-text-muted truncate">{dataPath}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <span className="text-xs text-text-muted">v{version}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
