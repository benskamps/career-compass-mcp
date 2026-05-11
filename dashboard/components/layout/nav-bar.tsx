"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CompletenessRing } from "./completeness-ring";
import { SettingsDropdown } from "./settings-dropdown";

const NAV_ITEMS = [
  { href: "/pipeline", label: "Pipeline" },
  { href: "/career", label: "Career" },
  { href: "/analytics", label: "Analytics" },
];

interface NavBarProps {
  completenessScore: number;
  dataPath: string;
  version: string;
}

export function NavBar({ completenessScore, dataPath, version }: NavBarProps) {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between h-14 px-6 border-b border-border bg-bg-base/85 backdrop-blur-md supports-[backdrop-filter]:bg-bg-base/70">
      <Link href="/" className="text-lg font-semibold tracking-tight text-text-primary rounded-sm">
        Career Compass
      </Link>
      <div className="flex items-center gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`relative px-4 py-2 text-sm font-medium rounded-button transition-colors duration-150 ${isActive ? "text-accent" : "text-text-secondary hover:text-text-primary"}`}
            >
              {item.label}
              <span
                aria-hidden
                className={`pointer-events-none absolute left-3 right-3 -bottom-px h-0.5 rounded-full bg-accent transition-all duration-200 ${isActive ? "opacity-100 scale-x-100" : "opacity-0 scale-x-50"}`}
              />
            </Link>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <CompletenessRing score={completenessScore} />
        <SettingsDropdown dataPath={dataPath} version={version} />
      </div>
    </nav>
  );
}
