import type { LucideIcon } from "lucide-react";
import Link from "next/link";

interface EmptyStateProps {
  icon: LucideIcon;
  message: string;
  action?: { label: string; href: string };
}

export function EmptyState({ icon: Icon, message, action }: EmptyStateProps) {
  return (
    <div className="relative flex flex-col items-center justify-center py-16 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          background:
            "radial-gradient(60% 40% at 50% 30%, var(--color-accent-muted) 0%, transparent 70%)",
        }}
      />
      <div className="relative flex flex-col items-center">
        <div className="w-14 h-14 rounded-full bg-bg-elevated border border-border flex items-center justify-center mb-4 shadow-sm">
          <Icon className="w-6 h-6 text-text-secondary" strokeWidth={1.5} />
        </div>
        <p className="text-sm text-text-secondary max-w-sm">{message}</p>
        {action && (
          <Link
            href={action.href}
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent hover:text-accent-hover transition-colors"
          >
            {action.label}
            <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
          </Link>
        )}
      </div>
    </div>
  );
}
