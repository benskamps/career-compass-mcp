import type { Meta, StoryObj } from "@storybook/react";
import { CompletenessRing } from "./completeness-ring";

const meta: Meta<typeof CompletenessRing> = {
  title: "Layout/CompletenessRing",
  component: CompletenessRing,
  parameters: { layout: "centered" },
};

export default meta;
type Story = StoryObj<typeof CompletenessRing>;

export const Empty: Story = {
  args: {
    score: 0,
    missingFields: ["profile", "experience", "skills", "education", "projects"],
  },
};

export const HalfComplete: Story = {
  args: {
    score: 50,
    missingFields: ["education", "projects", "testimonials"],
  },
};

export const MostlyComplete: Story = {
  args: {
    score: 72,
    missingFields: ["testimonials"],
  },
};

export const Complete: Story = {
  args: {
    score: 100,
    missingFields: [],
  },
};
