"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface WizardStep {
  id: string;
  label: string;
  component: React.ReactNode;
  hasGap: boolean;
}

interface WizardShellProps {
  steps: WizardStep[];
  onComplete: () => void;
}

export function WizardShell({ steps, onComplete }: WizardShellProps) {
  const visibleSteps = steps.filter((s) => s.hasGap);
  const [currentIndex, setCurrentIndex] = useState(0);

  if (visibleSteps.length === 0) {
    onComplete();
    return null;
  }

  const current = visibleSteps[currentIndex];
  const isLast = currentIndex === visibleSteps.length - 1;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex gap-1">
        {visibleSteps.map((step, i) => (
          <div key={step.id} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= currentIndex ? "bg-accent" : "bg-border"}`} />
        ))}
      </div>
      <div className="text-sm text-text-secondary">Step {currentIndex + 1} of {visibleSteps.length}: {current.label}</div>
      <div>{current.component}</div>
      <div className="flex justify-between pt-4">
        <Button variant="ghost" onClick={() => setCurrentIndex((i) => i - 1)} disabled={currentIndex === 0}>Back</Button>
        <Button onClick={() => { if (isLast) { onComplete(); } else { setCurrentIndex((i) => i + 1); } }}>{isLast ? "Complete Setup" : "Next"}</Button>
      </div>
    </div>
  );
}
