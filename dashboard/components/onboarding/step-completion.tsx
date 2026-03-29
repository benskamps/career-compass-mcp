"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CompletenessRing } from "@/components/layout/completeness-ring";
import { useRouter } from "next/navigation";

interface StepCompletionProps { score: number; }

export function StepCompletion({ score }: StepCompletionProps) {
  const router = useRouter();
  return (
    <Card>
      <CardContent className="p-8 space-y-6 text-center">
        <CompletenessRing score={score} size={80} />
        <h2 className="text-2xl font-semibold">Your Career KB is ready</h2>
        <p className="text-text-secondary max-w-md mx-auto">You can always enrich it later by pasting performance reviews, recommendations, or project summaries into Claude.</p>
        <div className="flex flex-col gap-3 max-w-xs mx-auto pt-4">
          <Button onClick={() => router.push("/pipeline")} className="w-full">Go to Pipeline</Button>
          <Button variant="ghost" onClick={() => router.push("/career")} className="w-full">View Career KB</Button>
        </div>
      </CardContent>
    </Card>
  );
}
