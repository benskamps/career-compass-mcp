import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps { label: string; value: string | number; detail?: string; }

export function StatCard({ label, value, detail }: StatCardProps) {
  return (
    <Card><CardContent className="p-5">
      <p className="text-xs text-text-muted uppercase tracking-wider">{label}</p>
      <p className="text-3xl font-semibold font-mono mt-1">{value}</p>
      {detail && <p className="text-xs text-text-secondary mt-1">{detail}</p>}
    </CardContent></Card>
  );
}
