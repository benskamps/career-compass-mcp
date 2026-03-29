import { describe, it, expect } from "vitest";
import { calculateCompleteness } from "./completeness";
import type { CareerData } from "@shared/schemas/career-schema.js";

const emptyCareer: CareerData = {
  profile: {
    name: "",
    summary: "",
    targetRoles: [],
    targetIndustries: [],
    targetCompanySize: [],
    salaryCurrency: "USD",
    openToRemote: true,
    openToRelocation: false,
  },
  experience: [],
  skills: [],
  education: [],
  projects: [],
  testimonials: [],
};

const fullCareer: CareerData = {
  profile: {
    name: "Alex Rivera",
    summary: "Operations leader with 9 years experience",
    targetRoles: ["Program Manager"],
    targetIndustries: ["SaaS"],
    targetCompanySize: ["Series B"],
    salaryMin: 140000,
    salaryMax: 180000,
    salaryCurrency: "USD",
    openToRemote: true,
    openToRelocation: false,
  },
  experience: [
    {
      role: "Senior PM",
      company: "MedFlow",
      startDate: "2021-03",
      endDate: "present",
      achievements: [
        { metric: "Reduced time 40%", context: "Process", impact: "Saved $2M", keywords: [] },
      ],
      tags: [],
    },
  ],
  skills: [
    { name: "Leadership", category: "Leadership", proficiency: 5 },
    { name: "Operations", category: "Operations", proficiency: 4 },
    { name: "Data Analysis", category: "Technical", proficiency: 3 },
  ],
  education: [{ degree: "BS", institution: "UT Austin", date: "2015", relevantCoursework: [], certifications: [] }],
  projects: [],
  testimonials: [
    { source: "Jane Doe, VP", relationship: "Manager", quote: "Outstanding performer" },
  ],
};

describe("calculateCompleteness", () => {
  it("returns 0 for empty career data", () => {
    expect(calculateCompleteness(emptyCareer)).toBe(0);
  });

  it("returns 100 for fully populated career data", () => {
    expect(calculateCompleteness(fullCareer)).toBe(100);
  });

  it("returns partial score for partial data", () => {
    const partial: CareerData = {
      ...emptyCareer,
      profile: { ...emptyCareer.profile, name: "Alex", summary: "A summary" },
      experience: fullCareer.experience,
    };
    expect(calculateCompleteness(partial)).toBe(45);
  });

  it("skills need 3+ with proficiency to count", () => {
    const twoSkills: CareerData = {
      ...emptyCareer,
      profile: { ...emptyCareer.profile, name: "Alex", summary: "A summary" },
      skills: [
        { name: "A", category: "X", proficiency: 3 },
        { name: "B", category: "Y", proficiency: 4 },
      ],
    };
    expect(calculateCompleteness(twoSkills)).toBe(20);
  });
});
