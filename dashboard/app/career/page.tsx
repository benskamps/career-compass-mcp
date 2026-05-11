import { loadCareerData } from "@/lib/data";
import { calculateCompleteness } from "@/lib/completeness";
import { ProfileHeader } from "@/components/career/profile-header";
import { SkillsRadar } from "@/components/career/skills-radar";
import { SkillsList } from "@/components/career/skills-list";
import { ExperienceTimeline } from "@/components/career/experience-timeline";
import { Testimonials } from "@/components/career/testimonials";
import { EducationList } from "@/components/career/education-list";
import { Separator } from "@/components/ui/separator";
import { Quote, GraduationCap } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export default async function CareerPage() {
  const career = await loadCareerData();
  if (!career) {
    return (<div className="flex items-center justify-center min-h-[50vh]"><p className="text-text-secondary">No career data found. Complete onboarding first.</p></div>);
  }
  const completeness = calculateCompleteness(career);

  return (
    <div className="px-6 py-8 max-w-4xl mx-auto space-y-8">
      <ProfileHeader profile={career.profile} completeness={completeness} />
      <section className="space-y-4"><h2 className="text-lg font-semibold tracking-tight">Skills</h2><SkillsRadar skills={career.skills} /><SkillsList skills={career.skills} /></section>
      <Separator />
      <section className="space-y-4"><h2 className="text-lg font-semibold tracking-tight">Experience</h2><ExperienceTimeline experience={career.experience} /></section>
      <Separator />
      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Testimonials</h2>
        {career.testimonials.length > 0 ? <Testimonials testimonials={career.testimonials} /> : <EmptyState icon={Quote} message="No testimonials yet. Ask Claude to ingest a recommendation." />}
      </section>
      <Separator />
      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Education</h2>
        {career.education.length > 0 ? <EducationList education={career.education} /> : <EmptyState icon={GraduationCap} message="No education entries. Ask Claude to add degrees or certifications." />}
      </section>
    </div>
  );
}
