import type { Meta, StoryObj } from "@storybook/react";
import { ApplicationCard } from "./application-card";
import type { Application } from "@shared/schemas/career-schema";

const baseApp: Application = {
  id: "app-1",
  company: "Anthropic",
  role: "Senior Product Manager",
  department: "Product",
  industry: "AI / ML",
  location: "San Francisco, CA",
  remote: "hybrid",
  status: "interviewing",
  dateUpdated: new Date(Date.now() - 3 * 86400000).toISOString(),
  contacts: [{ name: "Jane Smith", title: "Hiring Manager" }],
  interviewRounds: [],
  notes: [],
  priority: "high",
  source: "Referral",
  excitement: 8,
  coverLetterGenerated: false,
};

const meta: Meta<typeof ApplicationCard> = {
  title: "Pipeline/ApplicationCard",
  component: ApplicationCard,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 320 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ApplicationCard>;

export const Default: Story = {
  args: { app: baseApp },
};

export const Overdue: Story = {
  args: {
    app: {
      ...baseApp,
      id: "app-overdue",
      followUpDue: new Date(Date.now() - 5 * 86400000).toISOString(),
    },
  },
};

export const HighExcitement: Story = {
  args: {
    app: {
      ...baseApp,
      id: "app-excited",
      excitement: 9,
      company: "OpenAI",
      role: "Director of Product",
    },
  },
};

export const OfferStage: Story = {
  args: {
    app: {
      ...baseApp,
      id: "app-offer",
      status: "offer",
      company: "Stripe",
      role: "Head of Product",
      excitement: 7,
      priority: "high",
    },
  },
};

export const Rejected: Story = {
  args: {
    app: {
      ...baseApp,
      id: "app-rejected",
      status: "rejected",
      company: "Meta",
      role: "Product Lead",
      excitement: 5,
      priority: "low",
    },
  },
};
