import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ApplicationCard } from "@/components/pipeline/application-card";
import type { Application } from "@shared/schemas/career-schema";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

const makeApp = (overrides: Partial<Application> = {}): Application => ({
  id: "app-1",
  company: "Acme Corp",
  role: "Senior Engineer",
  status: "applied",
  dateUpdated: new Date().toISOString(),
  contacts: [],
  interviewRounds: [],
  notes: [],
  coverLetterGenerated: false,
  remote: "unknown",
  priority: "medium",
  ...overrides,
});

describe("ApplicationCard", () => {
  it("renders company name and role", () => {
    render(<ApplicationCard app={makeApp()} />);
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("Senior Engineer")).toBeInTheDocument();
  });

  it("renders link with correct href for the application", () => {
    const app = makeApp({ id: "app-42", status: "interviewing" });
    render(<ApplicationCard app={app} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/pipeline/app-42");
  });

  it("shows overdue indicator when followUpDue is in the past", () => {
    const app = makeApp({ followUpDue: "2020-01-01T00:00:00.000Z" });
    render(<ApplicationCard app={app} />);
    expect(screen.getByText("Follow-up overdue")).toBeInTheDocument();
  });

  it("does not show overdue indicator when followUpDue is in the future", () => {
    const app = makeApp({ followUpDue: "2099-01-01T00:00:00.000Z" });
    render(<ApplicationCard app={app} />);
    expect(screen.queryByText("Follow-up overdue")).not.toBeInTheDocument();
  });

  it("shows excitement gauge when excitement is provided", () => {
    const app = makeApp({ excitement: 7 });
    render(<ApplicationCard app={app} />);
    // The excitement score is rendered as a font-mono span
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("does not show excitement score when excitement is absent", () => {
    render(<ApplicationCard app={makeApp({ excitement: undefined })} />);
    // Without excitement, no numeric score beside the gauge bar should appear
    const monoSpans = document.querySelectorAll(".font-mono");
    // Only the daysInStage span should be present (no excitement score span)
    expect(monoSpans).toHaveLength(1);
  });
});
