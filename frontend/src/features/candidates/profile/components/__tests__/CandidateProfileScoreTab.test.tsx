import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../../../../../services/scoreExplanationService", () => ({
  scoreExplanationService: { get: vi.fn().mockResolvedValue(null) },
}));

vi.mock("../../drawer/tabs/ScoreTab", () => ({
  ScoreTab: () => <div data-testid="score-tab-inner" />,
}));

vi.mock("../ProfileSharedUI", () => ({
  EmptyBlock: ({
    title,
    description,
    actionLabel,
    onAction,
    actionDisabled,
  }: {
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
    actionDisabled?: boolean;
  }) => (
    <div>
      <p data-testid="empty-title">{title}</p>
      <p data-testid="empty-description">{description}</p>
      {actionLabel && (
        <button onClick={onAction} disabled={actionDisabled} data-testid="empty-action">
          {actionLabel}
        </button>
      )}
    </div>
  ),
  SectionCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DefinitionList: () => <dl />,
  ActionButton: ({ children, onClick, disabled }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
}));

// ── Component under test ──────────────────────────────────────────────────────

import { CandidateProfileScoreTab } from "../CandidateProfileScoreTab";
import type { CandidateOverview } from "../../../../../types/domain";

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE_CANDIDATE: CandidateOverview["candidate"] = {
  id: "cand-1",
  full_name: "Ana Silva",
  email: null,
  phone: null,
  cpf: null,
  location_city: null,
  location_state: null,
  location_country: "BR",
  linkedin_url: null,
  github_url: null,
  portfolio_url: null,
  internal_notes: null,
  tags: [],
  user_id: null,
  created_by: "user-1",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const BASE_OVERVIEW: CandidateOverview = {
  candidate: BASE_CANDIDATE,
  resumes: [],
  latest_analysis: null,
  latest_analysis_pipeline: null,
  top_matches: [],
  active_job_id: "job-1",
  active_job: { id: "job-1", title: "Dev Sênior", status: "published" },
  pipeline_entries: [],
  active_job_decision: null,
  active_job_skill_preview: null,
  latest_note: null,
  preview_pendencies: [],
  latest_movement: null,
};

function renderTab(overrides: {
  overviewPartial?: Partial<CandidateOverview>;
  activeJobId?: string | null;
  scoreNotReady?: boolean;
  analysisRequesting?: boolean;
  matchingRecalculating?: boolean;
  manualAnalysisStatus?: string | null;
  onRequestAnalysis?: ReturnType<typeof vi.fn>;
  onRecalculateMatching?: ReturnType<typeof vi.fn>;
}) {
  const overview: CandidateOverview = {
    ...BASE_OVERVIEW,
    ...overrides.overviewPartial,
  };
  const onRequestAnalysis = overrides.onRequestAnalysis ?? vi.fn().mockResolvedValue(undefined);
  const onRecalculateMatching = overrides.onRecalculateMatching;

  return render(
    <CandidateProfileScoreTab
      overview={overview}
      activeJobId={overrides.activeJobId !== undefined ? overrides.activeJobId : "job-1"}
      activeJob={null}
      activePipelineEntry={null}
      rankingEntry={null}
      analysisResult={null}
      loading={false}
      error={null}
      scoreNotReady={overrides.scoreNotReady ?? false}
      analysisRequesting={overrides.analysisRequesting ?? false}
      matchingRecalculating={overrides.matchingRecalculating ?? false}
      manualAnalysisStatus={(overrides.manualAnalysisStatus ?? null) as never}
      onRequestAnalysis={onRequestAnalysis}
      onRecalculateMatching={onRecalculateMatching}
      compatibilityGuidance={null}
    />,
  );
}

/** Build an overview with matching_pending decision state:
 *  - current_analysis_id set (analysis exists)
 *  - analysis_status = "completed"
 *  - scoreNotReady = true (no ranking entry)
 */
function matchingPendingOverview(): Partial<CandidateOverview> {
  return {
    active_job_decision: {
      score_status: "matching_pending",
      analysis_status: "completed",
      current_analysis_id: "analysis-abc",
      match_score: null,
      warnings: [],
      next_action: "none",
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("CandidateProfileScoreTab — matching_pending state", () => {
  it("shows 'Matching pendente' title", () => {
    renderTab({ overviewPartial: matchingPendingOverview(), scoreNotReady: true });
    expect(screen.getByTestId("empty-title")).toHaveTextContent("Matching pendente");
  });

  it("does NOT show 'Reprocessar análise' button label", () => {
    renderTab({ overviewPartial: matchingPendingOverview(), scoreNotReady: true });
    expect(screen.queryByText(/Reprocessar análise/i)).not.toBeInTheDocument();
  });

  it("shows 'Recalcular matching' button label", () => {
    renderTab({
      overviewPartial: matchingPendingOverview(),
      scoreNotReady: true,
      onRecalculateMatching: vi.fn().mockResolvedValue(undefined),
    });
    expect(screen.getByTestId("empty-action")).toHaveTextContent("Recalcular matching");
  });

  it("shows 'Recalculando...' when matchingRecalculating is true", () => {
    renderTab({
      overviewPartial: matchingPendingOverview(),
      scoreNotReady: true,
      matchingRecalculating: true,
      onRecalculateMatching: vi.fn().mockResolvedValue(undefined),
    });
    expect(screen.getByTestId("empty-action")).toHaveTextContent("Recalculando...");
  });

  it("description mentions no IA cost", () => {
    renderTab({ overviewPartial: matchingPendingOverview(), scoreNotReady: true });
    expect(screen.getByTestId("empty-description")).toHaveTextContent(/não usa IA/i);
  });

  it("clicking button calls onRecalculateMatching, not onRequestAnalysis", async () => {
    const onRecalculate = vi.fn().mockResolvedValue(undefined);
    const onRequestAnalysis = vi.fn().mockResolvedValue(undefined);
    renderTab({
      overviewPartial: matchingPendingOverview(),
      scoreNotReady: true,
      onRecalculateMatching: onRecalculate,
      onRequestAnalysis,
    });
    await userEvent.click(screen.getByTestId("empty-action"));
    expect(onRecalculate).toHaveBeenCalledOnce();
    expect(onRequestAnalysis).not.toHaveBeenCalled();
  });

  it("button is disabled when matchingRecalculating is true", () => {
    renderTab({
      overviewPartial: matchingPendingOverview(),
      scoreNotReady: true,
      matchingRecalculating: true,
      onRecalculateMatching: vi.fn().mockResolvedValue(undefined),
    });
    expect(screen.getByTestId("empty-action")).toBeDisabled();
  });

  it("shows 'Candidato sem vaga ativa' when activeJobId is null (no matching_pending shown)", () => {
    renderTab({
      overviewPartial: matchingPendingOverview(),
      scoreNotReady: true,
      activeJobId: null,
      onRecalculateMatching: vi.fn().mockResolvedValue(undefined),
    });
    expect(screen.getByTestId("empty-title")).toHaveTextContent("Candidato sem vaga ativa");
    expect(screen.queryByText(/Recalcular matching/i)).not.toBeInTheDocument();
  });

  it("button is disabled when onRecalculateMatching is not provided", () => {
    renderTab({
      overviewPartial: matchingPendingOverview(),
      scoreNotReady: true,
      // no onRecalculateMatching
    });
    expect(screen.getByTestId("empty-action")).toBeDisabled();
  });
});

describe("CandidateProfileScoreTab — other states still use onRequestAnalysis", () => {
  it("analysis_failed state shows 'Tentar novamente' and calls onRequestAnalysis", async () => {
    const onRequestAnalysis = vi.fn().mockResolvedValue(undefined);
    renderTab({
      overviewPartial: {
        active_job_decision: {
          score_status: "analysis_failed",
          analysis_status: "failed",
          current_analysis_id: "analysis-abc",
          match_score: null,
          warnings: [],
          next_action: "request_analysis",
        },
      },
      manualAnalysisStatus: "failed",
      onRequestAnalysis,
    });
    const btn = screen.getByTestId("empty-action");
    expect(btn).toHaveTextContent("Tentar novamente");
    await userEvent.click(btn);
    expect(onRequestAnalysis).toHaveBeenCalledOnce();
  });

  it("no analysis state shows 'Gerar análise agora' and calls onRequestAnalysis", async () => {
    const onRequestAnalysis = vi.fn().mockResolvedValue(undefined);
    renderTab({
      overviewPartial: {
        active_job_decision: {
          score_status: "waiting_analysis",
          analysis_status: null,
          current_analysis_id: null,
          match_score: null,
          warnings: [],
          next_action: "request_analysis",
        },
      },
      scoreNotReady: true,
      onRequestAnalysis,
    });
    const btn = screen.getByTestId("empty-action");
    expect(btn).toHaveTextContent("Gerar análise agora");
    await userEvent.click(btn);
    expect(onRequestAnalysis).toHaveBeenCalledOnce();
  });
});
