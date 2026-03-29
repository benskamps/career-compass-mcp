import type { CareerData } from "@shared/schemas/career-schema.js";

interface CompletenessRule {
  weight: number;
  check: (data: CareerData) => boolean;
}

const RULES: CompletenessRule[] = [
  {
    weight: 20,
    check: (d) => d.profile.name.length > 0 && d.profile.summary.length > 0,
  },
  {
    weight: 10,
    check: (d) => d.profile.targetRoles.length > 0,
  },
  {
    weight: 5,
    check: (d) => d.profile.salaryMin !== undefined && d.profile.salaryMax !== undefined,
  },
  {
    weight: 25,
    check: (d) =>
      d.experience.length > 0 &&
      d.experience.some((e) => e.achievements.length > 0),
  },
  {
    weight: 20,
    check: (d) =>
      d.skills.filter((s) => s.proficiency !== undefined).length >= 3,
  },
  {
    weight: 10,
    check: (d) => d.education.length > 0,
  },
  {
    weight: 10,
    check: (d) => d.testimonials.length > 0,
  },
];

export function calculateCompleteness(data: CareerData): number {
  return RULES.reduce(
    (score, rule) => score + (rule.check(data) ? rule.weight : 0),
    0
  );
}
