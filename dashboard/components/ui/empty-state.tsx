import type { LucideIcon } from "lucide-react";
import Link from "next/link";

interface EmptyStateProps {
  icon: LucideIcon;
  message: string;
  action?: { label: string; href: string };
}

export function EmptyState({ icon: Icon, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon className="w-10 h-10 text-text-muted mb-3" />
      <p className="text-sm text-text-secondary">{message}</p>
      {action && (
        <Link href={action.href} className="mt-3 text-sm text-accent hover:underline">
          {action.label}
        </Link>
      )}
    </div>
  );
}
