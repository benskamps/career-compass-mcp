import type { Meta, StoryObj } from "@storybook/react";
import { SkillsRadar } from "./skills-radar";
import type { Skill } from "@shared/schemas/career-schema";

const sampleSkills: Skill[] = [
  { name: "Strategic Planning", category: "Leadership", proficiency: 4 },
  { name: "Team Management", category: "Leadership", proficiency: 5 },
  { name: "Stakeholder Comms", category: "Leadership", proficiency: 4 },
  { name: "Agile / Scrum", category: "Operations", proficiency: 3 },
  { name: "Roadmapping", category: "Operations", proficiency: 4 },
  { name: "Data Analysis", category: "Operations", proficiency: 3 },
  { name: "SaaS", category: "Domain", proficiency: 5 },
  { name: "AI / ML Products", category: "Domain", proficiency: 4 },
  { name: "SQL", category: "Technical", proficiency: 3 },
  { name: "Python", category: "Technical", proficiency: 2 },
  { name: "REST APIs", category: "Technical", proficiency: 3 },
];

const meta: Meta<typeof SkillsRadar> = {
  title: "Career/SkillsRadar",
  component: SkillsRadar,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ width: 400, height: 320 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof SkillsRadar>;

export const Default: Story = {
  args: { skills: sampleSkills },
};

export const Empty: Story = {
  args: { skills: [] },
};
