import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps { label: string; value: string | number; detail?: string; }

export function StatCard({ label, value, detail }: StatCardProps) {
  return (
    <Card className="lift-on-hover">
      <CardContent className="p-5">
        <p className="text-[11px] text-text-muted uppercase tracking-[0.08em] font-medium">{label}</p>
        <p className="text-3xl font-semibold font-mono mt-1.5 tabular-nums tracking-tight">{value}</p>
        {detail && <p className="text-xs text-text-secondary mt-1.5">{detail}</p>}
      </CardContent>
    </Card>
  );
}
