import { Card, CardContent } from "@/components/ui/card";
import type { Testimonial } from "@shared/schemas/career-schema";

export function Testimonials({ testimonials }: { testimonials: Testimonial[] }) {
  if (testimonials.length === 0) return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {testimonials.map((t, i) => (
        <Card key={i} className="bg-accent-muted border-accent/20">
          <CardContent className="p-5">
            <blockquote className="text-sm italic mb-3">&ldquo;{t.quote}&rdquo;</blockquote>
            <div className="text-xs text-text-secondary"><span className="font-medium">{t.source}</span><span className="text-text-muted"> &middot; {t.relationship}</span></div>
            {t.context && <p className="text-xs text-text-muted mt-1">{t.context}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
