import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CandidateSearchModal } from "../CandidateSearchModal";
import { candidatesService } from "../../../services/candidatesService";
import { HttpError } from "../../../services/http";
import { pipelineService } from "../../../services/pipelineService";

vi.mock("../../../services/candidatesService", () => ({
  candidatesService: {
    listSummaries: vi.fn(),
  },
}));

vi.mock("../../../services/pipelineService", () => ({
  pipelineService: {
    getCandidateHistory: vi.fn(),
    addCandidateToJob: vi.fn(),
    reconsiderCandidateJob: vi.fn(),
  },
}));

describe("CandidateSearchModal process history action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(candidatesService.listSummaries).mockResolvedValue({
      data: [
        {
          id: "candidate-1",
          full_name: "Ana Souza",
          email: "ana@example.com",
          phone: null,
          cpf: null,
          application_source: null,
          tags: [],
          created_at: "2026-05-20T10:00:00Z",
          resume_count: 1,
          linked_job_count: 0,
          latest_job_id: "job-1",
          latest_job_title: "Engenheiro Backend",
          latest_job_stage: "rejected",
          latest_relationship_status: "rejected",
          active_job_id: null,
          active_job_title: null,
          active_job_stage: null,
          active_job_job_fit_score: null,
          ai_status: null,
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
    });
    vi.mocked(pipelineService.getCandidateHistory).mockResolvedValue({
      candidate_id: "candidate-1",
      candidate_name: "Ana Souza",
      job_id: "job-1",
      job_title: "Engenheiro Backend",
      current_stage: "rejected",
      status: "rejected",
      entered_at: "2026-05-20T10:00:00Z",
      updated_at: "2026-05-22T10:00:00Z",
      transitions: [],
    });
  });

  it("navega para a aba Histórico ao clicar em Ver histórico anterior", async () => {
    const user = userEvent.setup();
    const onOpenCandidate = vi.fn();

    render(
      <CandidateSearchModal
        isOpen
        activeJobId="job-1"
        activeJobTitle="Engenheiro Backend"
        ranking={null}
        rankingLoading={false}
        onClose={vi.fn()}
        onAdded={vi.fn()}
        onCreateNew={vi.fn()}
        onOpenCandidate={onOpenCandidate}
      />,
    );

    await screen.findByText("Ana Souza");
    expect(candidatesService.listSummaries).toHaveBeenCalledWith(1, 40, {
      search: undefined,
      link_status_filter: "without_active_job",
    });
    await user.click(screen.getByRole("button", { name: "Vincular" }));
    expect(await screen.findByText("Este candidato já participou desta vaga anteriormente.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ver histórico anterior" }));

    await waitFor(() => {
      expect(onOpenCandidate).toHaveBeenCalledWith(
        "candidate-1",
        "/candidatos/candidate-1?tab=history&job_id=job-1",
      );
    });
  });

  it("usa reconsideração ao iniciar novo processo para candidato já encerrado na vaga", async () => {
    const user = userEvent.setup();
    const onAdded = vi.fn();

    vi.mocked(pipelineService.reconsiderCandidateJob).mockResolvedValue({
      candidate_id: "candidate-1",
      job_id: "job-1",
      stage: "entry",
      candidate_status: "Recebido",
      status: "active",
      transition_id: "transition-1",
      updated_at: "2026-05-22T10:00:00Z",
      analysis: null,
    });

    render(
      <CandidateSearchModal
        isOpen
        activeJobId="job-1"
        activeJobTitle="Engenheiro Backend"
        ranking={null}
        rankingLoading={false}
        onClose={vi.fn()}
        onAdded={onAdded}
        onCreateNew={vi.fn()}
      />,
    );

    await screen.findByText("Ana Souza");
    await user.click(screen.getByRole("button", { name: "Vincular" }));
    await screen.findByText("Este candidato já participou desta vaga anteriormente.");
    await user.click(screen.getByRole("button", { name: "Iniciar novo processo" }));

    await waitFor(() => {
      expect(pipelineService.reconsiderCandidateJob).toHaveBeenCalledWith("candidate-1", {
        job_id: "job-1",
        initial_stage: "entry",
        reason: "Reabertura manual do processo pela pipeline.",
      });
    });
    expect(pipelineService.addCandidateToJob).not.toHaveBeenCalled();
    expect(onAdded).toHaveBeenCalled();
  });

  it("abre reconsideração usando metadados da listagem quando já houve processo anterior na mesma vaga", async () => {
    const user = userEvent.setup();

    vi.mocked(pipelineService.getCandidateHistory).mockRejectedValue(new Error("histórico indisponível"));

    render(
      <CandidateSearchModal
        isOpen
        activeJobId="job-1"
        activeJobTitle="Engenheiro Backend"
        ranking={null}
        rankingLoading={false}
        onClose={vi.fn()}
        onAdded={vi.fn()}
        onCreateNew={vi.fn()}
      />,
    );

    await screen.findByText("Ana Souza");
    await user.click(screen.getByRole("button", { name: "Vincular" }));

    expect(await screen.findByText("Este candidato já participou desta vaga anteriormente.")).toBeInTheDocument();
    expect(pipelineService.addCandidateToJob).not.toHaveBeenCalled();
  });

  it("ignora clique duplicado enquanto o vínculo está em andamento", async () => {
    const user = userEvent.setup();
    let resolveLink: (value: unknown) => void = () => undefined;

    vi.mocked(candidatesService.listSummaries).mockResolvedValue({
      data: [
        {
          id: "candidate-1",
          full_name: "Ana Souza",
          email: "ana@example.com",
          phone: null,
          cpf: null,
          application_source: null,
          tags: [],
          created_at: "2026-05-20T10:00:00Z",
          resume_count: 1,
          linked_job_count: 0,
          latest_job_id: null,
          latest_job_title: null,
          latest_job_stage: null,
          latest_relationship_status: null,
          active_job_id: null,
          active_job_title: null,
          active_job_stage: null,
          active_job_job_fit_score: null,
          ai_status: null,
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
    });
    vi.mocked(pipelineService.getCandidateHistory).mockRejectedValue(new Error("sem histórico"));
    vi.mocked(pipelineService.addCandidateToJob).mockReturnValue(
      new Promise((resolve) => {
        resolveLink = resolve;
      }) as ReturnType<typeof pipelineService.addCandidateToJob>,
    );

    render(
      <CandidateSearchModal
        isOpen
        activeJobId="job-1"
        activeJobTitle="Engenheiro Backend"
        ranking={null}
        rankingLoading={false}
        onClose={vi.fn()}
        onAdded={vi.fn()}
        onCreateNew={vi.fn()}
      />,
    );

    await screen.findByText("Ana Souza");
    const button = screen.getByRole("button", { name: "Vincular" });

    await user.dblClick(button);

    expect(pipelineService.addCandidateToJob).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveLink({
        candidate_id: "candidate-1",
        job_id: "job-1",
        stage: "entry",
        candidate_status: "Recebido",
        status: "active",
        transition_id: "transition-1",
        updated_at: "2026-05-22T10:00:00Z",
        analysis: null,
      });
    });
  });

  it("faz fallback para reconsiderar quando add-to-job retorna conflito de vínculo histórico", async () => {
    const user = userEvent.setup();
    const onAdded = vi.fn();

    vi.mocked(candidatesService.listSummaries).mockResolvedValue({
      data: [
        {
          id: "candidate-1",
          full_name: "Ana Souza",
          email: "ana@example.com",
          phone: null,
          cpf: null,
          application_source: null,
          tags: [],
          created_at: "2026-05-20T10:00:00Z",
          resume_count: 1,
          linked_job_count: 0,
          latest_job_id: null,
          latest_job_title: null,
          latest_job_stage: null,
          latest_relationship_status: null,
          active_job_id: null,
          active_job_title: null,
          active_job_stage: null,
          active_job_job_fit_score: null,
          ai_status: null,
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
    });
    vi.mocked(pipelineService.getCandidateHistory).mockRejectedValue(new Error("histórico indisponível"));
    vi.mocked(pipelineService.addCandidateToJob).mockRejectedValue(
      new HttpError(
        409,
        "Não foi possível concluir a operação porque o vínculo já existe ou foi alterado. Recarregue e tente novamente.",
      ),
    );
    vi.mocked(pipelineService.reconsiderCandidateJob).mockResolvedValue({
      candidate_id: "candidate-1",
      job_id: "job-1",
      stage: "entry",
      candidate_status: "Recebido",
      status: "active",
      transition_id: "transition-1",
      updated_at: "2026-05-22T10:00:00Z",
      analysis: null,
    });

    render(
      <CandidateSearchModal
        isOpen
        activeJobId="job-1"
        activeJobTitle="Engenheiro Backend"
        ranking={null}
        rankingLoading={false}
        onClose={vi.fn()}
        onAdded={onAdded}
        onCreateNew={vi.fn()}
      />,
    );

    await screen.findByText("Ana Souza");
    await user.click(screen.getByRole("button", { name: "Vincular" }));

    await waitFor(() => {
      expect(pipelineService.reconsiderCandidateJob).toHaveBeenCalledWith("candidate-1", {
        job_id: "job-1",
        initial_stage: "entry",
        reason: "Reabertura automática após conflito de vínculo histórico.",
      });
    });
    expect(onAdded).toHaveBeenCalled();
  });
});
