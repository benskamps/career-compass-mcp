import { loadCareerData } from "@/lib/data";
import { calculateCompleteness } from "@/lib/completeness";
import { ProfileHeader } from "@/components/career/profile-header";
import { SkillsRadar } from "@/components/career/skills-radar";
import { SkillsList } from "@/components/career/skills-list";
import { ExperienceTimeline } from "@/components/career/experience-timeline";
import { Testimonials } from "@/components/career/testimonials";
import { EducationList } from "@/components/career/education-list";
import { Separator } from "@/components/ui/separator";

export default async function CareerPage() {
  const career = await loadCareerData();
  if (!career) {
    return (<div className="flex items-center justify-center min-h-[50vh]"><p className="text-text-secondary">No career data found. Complete onboarding first.</p></div>);
  }
  const completeness = calculateCompleteness(career);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <ProfileHeader profile={career.profile} completeness={completeness} />
      <section className="space-y-4"><h2 className="text-xl font-semibold">Skills</h2><SkillsRadar skills={career.skills} /><SkillsList skills={career.skills} /></section>
      <Separator />
      <section className="space-y-4"><h2 className="text-xl font-semibold">Experience</h2><ExperienceTimeline experience={career.experience} /></section>
      {career.testimonials.length > 0 && (<><Separator /><section className="space-y-4"><h2 className="text-xl font-semibold">Testimonials</h2><Testimonials testimonials={career.testimonials} /></section></>)}
      {career.education.length > 0 && (<><Separator /><section className="space-y-4"><h2 className="text-xl font-semibold">Education</h2><EducationList education={career.education} /></section></>)}
    </div>
  );
}
