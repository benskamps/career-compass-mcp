"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PhaseOne } from "@/components/onboarding/phase-one";
import { WizardShell } from "@/components/onboarding/wizard-shell";
import { StepProfile } from "@/components/onboarding/step-profile";
import { StepTargets } from "@/components/onboarding/step-targets";
import { StepSalary } from "@/components/onboarding/step-salary";
import { StepSkills } from "@/components/onboarding/step-skills";
import { StepCompletion } from "@/components/onboarding/step-completion";
import type { CareerData } from "@shared/schemas/career-schema";

interface OnboardingClientProps { hasData: boolean; career: CareerData | null; completenessScore: number; }

export function OnboardingClient({ hasData, career, completenessScore }: OnboardingClientProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<1 | 2>(hasData ? 2 : 1);

  const handleDataDetected = useCallback(() => { setPhase(2); router.refresh(); }, [router]);
  const handleComplete = useCallback(() => { router.push("/pipeline"); }, [router]);

  if (phase === 1) return <PhaseOne onDataDetected={handleDataDetected} />;
  if (!career) return null;

  const profile = career.profile;
  const skills = career.skills;

  const steps = [
    { id: "profile", label: "Confirm Profile", component: <StepProfile profile={profile} />, hasGap: true },
    { id: "targets", label: "Target Roles & Industries", component: <StepTargets currentRoles={profile.targetRoles} currentIndustries={profile.targetIndustries} currentSizes={profile.targetCompanySize} />, hasGap: profile.targetRoles.length === 0 },
    { id: "salary", label: "Salary & Preferences", component: <StepSalary currentMin={profile.salaryMin} currentMax={profile.salaryMax} currentCurrency={profile.salaryCurrency} currentRemote={profile.openToRemote} currentRelocation={profile.openToRelocation} currentNotice={profile.noticePeriod} />, hasGap: profile.salaryMin === undefined || profile.salaryMax === undefined },
    { id: "skills", label: "Review Skills", component: <StepSkills currentSkills={skills} />, hasGap: skills.filter((s) => s.proficiency !== undefined).length < 3 },
    { id: "completion", label: "Setup Complete", component: <StepCompletion score={completenessScore} />, hasGap: true },
  ];

  return <WizardShell steps={steps} onComplete={handleComplete} />;
}
