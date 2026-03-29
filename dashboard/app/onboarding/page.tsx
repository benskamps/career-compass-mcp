import { loadCareerData, hasProfileData } from "@/lib/data";
import { calculateCompleteness } from "@/lib/completeness";
import { OnboardingClient } from "./client";

export default async function OnboardingPage() {
  const hasData = hasProfileData();
  const career = hasData ? await loadCareerData() : null;
  const score = career ? calculateCompleteness(career) : 0;

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] p-8">
      <OnboardingClient hasData={hasData} career={career ? JSON.parse(JSON.stringify(career)) : null} completenessScore={score} />
    </div>
  );
}
