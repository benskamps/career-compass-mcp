"use client";

import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useTheme } from "@/lib/theme-provider";
import { Sun, Moon, Monitor, Check } from "lucide-react";

interface SettingsDropdownProps {
  dataPath: string;
  version: string;
}

export function SettingsDropdown({ dataPath, version }: SettingsDropdownProps) {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="p-2 rounded-button text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors duration-150">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="2.5" />
          <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M2.87 2.87l1.06 1.06M12.07 12.07l1.06 1.06M2.87 13.13l1.06-1.06M12.07 3.93l1.06-1.06" />
        </svg>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {/*
          Each DropdownMenuLabel MUST sit inside a DropdownMenuGroup. It renders
          Base UI's Menu.GroupLabel, which reads MenuGroupRootContext and throws
          "Menu group parts must be used within <Menu.Group>" when that context
          is absent. In a production build that throw is not caught by anything
          here, so it took down the whole dashboard with "This page couldn't
          load" — the entire app, from one click on the theme button.
        */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setTheme("light")}>
            <Sun className="size-4" />
            <span className="flex-1">Light</span>
            {theme === "light" && <Check className="size-4 text-accent" />}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("dark")}>
            <Moon className="size-4" />
            <span className="flex-1">Dark</span>
            {theme === "dark" && <Check className="size-4 text-accent" />}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("system")}>
            <Monitor className="size-4" />
            <span className="flex-1">System</span>
            {theme === "system" && <Check className="size-4 text-accent" />}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Info</DropdownMenuLabel>
          <DropdownMenuItem disabled>
            <span className="text-xs font-mono text-text-muted truncate">{dataPath}</span>
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <span className="text-xs text-text-muted">v{version}</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
