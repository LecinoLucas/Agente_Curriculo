import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminBiPage } from "../AdminBiPage";

const getBiOverviewMock = vi.fn();
const listJobsMock = vi.fn();
const listJobAreasMock = vi.fn();

vi.mock("../../services/adminBiService", () => ({
  adminBiService: {
    getBiOverview: (params: unknown) => getBiOverviewMock(params),
  },
}));

vi.mock("../../services/jobsService", () => ({
  listJobs: (...args: unknown[]) => listJobsMock(...args),
}));

vi.mock("../../services/jobAreasService", () => ({
  jobAreasService: {
    listJobAreas: (...args: unknown[]) => listJobAreasMock(...args),
  },
}));

describe("AdminBiPage", () => {
  beforeEach(() => {
    getBiOverviewMock.mockReset();
    listJobsMock.mockReset();
    listJobAreasMock.mockReset();

    listJobsMock.mockResolvedValue({
      data: [{ id: "job-1", title: "Analista de Sistemas" }],
    });
    listJobAreasMock.mockResolvedValue({
      data: [{ id: "area-1", name: "Tecnologia" }],
    });
    getBiOverviewMock.mockResolvedValue({
      summary: {
        total_candidates: 120,
        active_candidates: 90,
        archived_candidates: 10,
        total_jobs: 25,
        published_jobs: 8,
        archived_jobs: 12,
        completed_analyses: 180,
        failed_analyses: 5,
        average_score: 74.5,
        hired_candidates: 3,
        ai_total_tokens: 1200000,
        ai_total_calls: 25,
        ai_estimated_cost_usd: null,
      },
      jobs_by_status: [{ status: "published", total: 8 }],
      candidates_by_status: [{ status: "active", total: 90 }],
      analyses_by_status: [{ status: "completed", total: 180 }],
      pipeline_by_stage: [{ stage: "screening", total: 20 }],
      analyses_daily: [{ date: "2026-05-12", total: 10 }],
      ai_usage_daily: [{ date: "2026-05-12", tokens: 100000, calls: 20 }],
      top_jobs_by_candidates: [{ job_id: "job-1", title: "Analista de Sistemas", status: "published", total_candidates: 15 }],
      top_expensive_analyses: [{ analysis_id: "analysis-1", candidate_name: "Lucas", tokens: 50000, estimated_cost_usd: null }],
      latest_analysis_failures: [],
      ai_usage: {
        total_calls: 25,
        successful_calls: 24,
        failed_calls: 1,
        input_tokens: 1000000,
        output_tokens: 200000,
        total_tokens: 1200000,
        estimated_cost_usd: null,
        avg_latency_ms: 2300,
      },
      total_analyses: 185,
    });
  });

  it("renderiza a página e os cards principais", async () => {
    render(
      <MemoryRouter>
        <AdminBiPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("BI de Recrutamento")).toBeInTheDocument();
    expect(screen.getByText("Total de candidatos")).toBeInTheDocument();
    expect(screen.getByText("Vagas por status")).toBeInTheDocument();
  });

  it("renderiza gráficos leves com dados mockados", async () => {
    render(
      <MemoryRouter>
        <AdminBiPage />
      </MemoryRouter>,
    );

    await screen.findByText("Vagas por status");
    expect(screen.getByRole("img", { name: "Distribuição de vagas por status" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Volume de análises por status" })).toBeInTheDocument();
  });

  it("mostra empty state quando não há dados de IA", async () => {
    getBiOverviewMock.mockResolvedValueOnce({
      summary: {
        total_candidates: 0,
        active_candidates: 0,
        archived_candidates: 0,
        total_jobs: 0,
        published_jobs: 0,
        archived_jobs: 0,
        completed_analyses: 0,
        failed_analyses: 0,
        average_score: null,
        hired_candidates: 0,
        ai_total_tokens: 0,
        ai_total_calls: 0,
        ai_estimated_cost_usd: null,
      },
      jobs_by_status: [],
      candidates_by_status: [],
      analyses_by_status: [],
      pipeline_by_stage: [],
      analyses_daily: [],
      ai_usage_daily: [],
      top_jobs_by_candidates: [],
      top_expensive_analyses: [],
      latest_analysis_failures: [],
      ai_usage: {
        total_calls: 0,
        successful_calls: 0,
        failed_calls: 0,
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        estimated_cost_usd: null,
        avg_latency_ms: null,
      },
      total_analyses: 0,
    });

    render(
      <MemoryRouter>
        <AdminBiPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Sem dados de uso de IA ainda.")).toBeInTheDocument();
  });

  it("reaplica filtros", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <AdminBiPage />
      </MemoryRouter>,
    );

    await screen.findByText("BI de Recrutamento");
    await user.selectOptions(screen.getByLabelText("Período"), "7");
    await user.click(screen.getByRole("button", { name: /aplicar filtros/i }));

    await waitFor(() => {
      expect(getBiOverviewMock).toHaveBeenCalled();
    });
  });
});
