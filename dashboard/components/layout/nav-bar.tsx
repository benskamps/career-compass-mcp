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
}

export function NavBar({ completenessScore, dataPath }: NavBarProps) {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between h-14 px-6 border-b border-border bg-bg-base/95 backdrop-blur-sm">
      <Link href="/" className="text-lg font-semibold tracking-tight text-text-primary">
        Career Compass
      </Link>
      <div className="flex items-center gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className={`px-4 py-2 text-sm font-medium rounded-button transition-colors duration-150 ${isActive ? "text-accent border-b-2 border-accent" : "text-text-secondary hover:text-text-primary"}`}>
              {item.label}
            </Link>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <CompletenessRing score={completenessScore} />
        <SettingsDropdown dataPath={dataPath} version="2.0.0" />
      </div>
    </nav>
  );
}
