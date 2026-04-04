import type { Meta, StoryObj } from "@storybook/react";
import { EmptyState } from "./empty-state";
import { Inbox, Search, FileText, Users } from "lucide-react";

const meta: Meta<typeof EmptyState> = {
  title: "UI/EmptyState",
  component: EmptyState,
  parameters: { layout: "centered" },
};

export default meta;
type Story = StoryObj<typeof EmptyState>;

export const Default: Story = {
  args: {
    icon: Inbox,
    message: "No applications yet. Start tracking your job search!",
  },
};

export const WithAction: Story = {
  args: {
    icon: Search,
    message: "No matching results found.",
    action: { label: "Clear filters", href: "/pipeline" },
  },
};

export const NoDocuments: Story = {
  args: {
    icon: FileText,
    message: "No resumes generated yet.",
    action: { label: "Create your first resume", href: "/career" },
  },
};

export const NoContacts: Story = {
  args: {
    icon: Users,
    message: "No contacts added for this application.",
  },
};
