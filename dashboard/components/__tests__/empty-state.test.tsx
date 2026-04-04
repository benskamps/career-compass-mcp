import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { EmptyState } from "@/components/ui/empty-state";
import type { LucideIcon } from "lucide-react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

// Minimal stub icon that renders a recognizable element
const TestIcon: LucideIcon = (props: any) => (
  <svg data-testid="test-icon" {...props} />
);

describe("EmptyState", () => {
  it("renders message text", () => {
    render(<EmptyState icon={TestIcon} message="No applications yet" />);
    expect(screen.getByText("No applications yet")).toBeInTheDocument();
  });

  it("renders icon when provided", () => {
    render(<EmptyState icon={TestIcon} message="Nothing here" />);
    expect(screen.getByTestId("test-icon")).toBeInTheDocument();
  });

  it("renders action link when action is provided", () => {
    render(
      <EmptyState
        icon={TestIcon}
        message="Nothing here"
        action={{ label: "Add one", href: "/pipeline/new" }}
      />
    );
    const link = screen.getByRole("link", { name: "Add one" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/pipeline/new");
  });

  it("does not render action link when action is omitted", () => {
    render(<EmptyState icon={TestIcon} message="Nothing here" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
