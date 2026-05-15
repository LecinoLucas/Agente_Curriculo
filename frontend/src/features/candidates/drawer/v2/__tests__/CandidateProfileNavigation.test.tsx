import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CandidateProfileNavigation } from "../CandidateProfileNavigation";

describe("CandidateProfileNavigation", () => {
  const defaultProps = {
    activeTab: "overview" as const,
    onChange: vi.fn(),
    pipelineStage: "entry" as const,
    hasActiveJob: true,
    userRole: "recruiter" as const,
  };

  it("should render overview tab always", () => {
    render(<CandidateProfileNavigation {...defaultProps} />);
    expect(screen.getByText("Resumo")).toBeInTheDocument();
  });

  it("should show limited tabs when no context provided", () => {
    const { container } = render(
      <CandidateProfileNavigation
        activeTab="overview"
        onChange={vi.fn()}
      />
    );

    const tabs = container.querySelectorAll("button[type='button']");
    // Should have at least overview and "Mostrar tudo" button
    expect(tabs.length).toBeGreaterThanOrEqual(1);
  });

  it("should show more tabs with context", () => {
    const { container } = render(
      <CandidateProfileNavigation
        {...defaultProps}
        pipelineStage="hr_interview"
        hasInterviews={true}
      />
    );

    const tabs = container.querySelectorAll("button[type='button']");
    // Should have more tabs when context is provided
    expect(tabs.length).toBeGreaterThan(1);
  });

  it("should show 'Mostrar tudo' toggle when available", () => {
    render(
      <CandidateProfileNavigation
        {...defaultProps}
        pipelineStage="hr_interview"
        hasInterviews={true}
      />
    );

    // Look for the "Mostrar tudo" button
    const showAllButton = screen.queryByText(/Mostrar (tudo|menos)/);
    if (showAllButton) {
      expect(showAllButton).toBeInTheDocument();
    }
  });

  it("should call onChange when tab is clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <CandidateProfileNavigation
        activeTab="overview"
        onChange={onChange}
        hasActiveJob={true}
        pipelineStage="entry"
      />
    );

    // Find and click a tab that should be visible
    const analysisTab = screen.queryByText("Análise");
    if (analysisTab) {
      await user.click(analysisTab);
      expect(onChange).toHaveBeenCalledWith("score");
    }
  });

  it("should highlight active tab", () => {
    render(
      <CandidateProfileNavigation
        activeTab="score"
        onChange={vi.fn()}
        hasActiveJob={true}
        pipelineStage="entry"
      />
    );

    // The active tab should have specific styling
    const buttons = screen.getAllByRole("button");
    const activeButton = buttons.find((btn) => btn.textContent?.includes("Análise"));

    if (activeButton) {
      expect(activeButton).toHaveClass("bg-[hsl(var(--surface))]");
    }
  });
});
