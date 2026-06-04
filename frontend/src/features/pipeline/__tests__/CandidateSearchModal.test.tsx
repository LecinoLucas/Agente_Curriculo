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
    expect(candidatesService.listSummaries).toHaveBeenCalledWith(1, 10, {
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

  it("ao abrir, carrega lista inicial sem o usuário precisar digitar", async () => {
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

    // Initial fetch fires with no search term and shows the candidate immediately.
    await screen.findByText("Ana Souza");
    expect(candidatesService.listSummaries).toHaveBeenCalledWith(1, 10, {
      search: undefined,
      link_status_filter: "without_active_job",
    });
  });

  it("não exibe 'Nenhum candidato disponível' enquanto a busca inicial está carregando", async () => {
    // Hold the initial request pending so we can assert no premature empty state.
    let resolveList: (value: unknown) => void = () => undefined;
    vi.mocked(candidatesService.listSummaries).mockReturnValueOnce(
      new Promise((resolve) => { resolveList = resolve; }) as ReturnType<
        typeof candidatesService.listSummaries
      >,
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

    // While loading, no empty-state copy must appear.
    expect(screen.queryByText(/nenhum candidato disponível/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/nenhum candidato encontrado/i)).not.toBeInTheDocument();

    // Now resolve as empty — expect the polite empty state, never "Carregando…".
    await act(async () => {
      resolveList({ data: [], total: 0, page: 1, page_size: 40, total_pages: 1 });
    });

    await screen.findByText(/nenhum candidato disponível/i);
    expect(screen.queryByText(/carregando/i)).not.toBeInTheDocument();
  });

  it("digitando busca, empty state mostra 'Nenhum candidato encontrado para esta busca.'", async () => {
    const user = userEvent.setup();
    vi.mocked(candidatesService.listSummaries)
      .mockResolvedValueOnce({
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
        page_size: 40,
        total_pages: 1,
      })
      .mockResolvedValue({ data: [], total: 0, page: 1, page_size: 40, total_pages: 1 });

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
    const input = screen.getByPlaceholderText(/buscar candidato por nome ou e-mail/i);
    await user.type(input, "Zezinho");

    await screen.findByText(/nenhum candidato encontrado para esta busca/i);
  });

  it("não exibe simultaneamente 'Carregando…' e 'Nenhum candidato disponível'", async () => {
    vi.mocked(candidatesService.listSummaries).mockResolvedValueOnce({
      data: [],
      total: 0,
      page: 1,
      page_size: 40,
      total_pages: 1,
    });

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

    await screen.findByText(/nenhum candidato disponível/i);
    // Não deve renderizar "Carregando..." junto.
    expect(screen.queryByText(/carregando/i)).not.toBeInTheDocument();
  });

  it("'Criar candidato manualmente' continua disponível mesmo com lista vazia", async () => {
    vi.mocked(candidatesService.listSummaries).mockResolvedValueOnce({
      data: [],
      total: 0,
      page: 1,
      page_size: 40,
      total_pages: 1,
    });

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

    await screen.findByText(/nenhum candidato disponível/i);
    expect(
      screen.getByRole("button", { name: /Criar candidato manualmente/i }),
    ).toBeInTheDocument();
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

// ── Fase 11: Listagem inicial curta + busca remota ────────────────────────────

describe("CandidateSearchModal — listagem inicial e busca", () => {
  function makeSummary(overrides: { id: string; full_name: string; email?: string | null }) {
    return {
      id: overrides.id,
      full_name: overrides.full_name,
      email: overrides.email ?? null,
      phone: null,
      cpf: null,
      application_source: null,
      tags: [],
      created_at: "2026-05-20T10:00:00Z",
      resume_count: 0,
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
    };
  }

  function makePage(data: ReturnType<typeof makeSummary>[]) {
    return { data, total: data.length, page: 1, page_size: 10, total_pages: 1 };
  }

  beforeEach(() => {
    // resetAllMocks wipes implementations AND the queued `mockResolvedValueOnce`
    // values, which `clearAllMocks` would leave in place across tests.
    vi.resetAllMocks();
  });

  it("abre a modal chamando listSummaries com pageSize=10 e search undefined", async () => {
    vi.mocked(candidatesService.listSummaries).mockResolvedValueOnce(
      makePage([makeSummary({ id: "c-1", full_name: "Alice Alves" })]),
    );

    render(
      <CandidateSearchModal
        isOpen
        activeJobId="job-1"
        activeJobTitle="Vaga"
        ranking={null}
        rankingLoading={false}
        onClose={vi.fn()}
        onAdded={vi.fn()}
        onCreateNew={vi.fn()}
      />,
    );

    await screen.findByText("Alice Alves");
    expect(candidatesService.listSummaries).toHaveBeenCalledWith(1, 10, {
      search: undefined,
      link_status_filter: "without_active_job",
    });
  });

  it("renderiza candidatos iniciais sem o usuário digitar busca", async () => {
    vi.mocked(candidatesService.listSummaries).mockResolvedValueOnce(
      makePage([
        makeSummary({ id: "c-1", full_name: "Alice Alves" }),
        makeSummary({ id: "c-2", full_name: "Bruno Borba" }),
      ]),
    );

    render(
      <CandidateSearchModal
        isOpen
        activeJobId="job-1"
        activeJobTitle="Vaga"
        ranking={null}
        rankingLoading={false}
        onClose={vi.fn()}
        onAdded={vi.fn()}
        onCreateNew={vi.fn()}
      />,
    );

    await screen.findByText("Alice Alves");
    expect(screen.getByText("Bruno Borba")).toBeInTheDocument();
  });

  it("exibe orientação 'Mostrando … candidatos … Use a busca …' quando não há termo", async () => {
    vi.mocked(candidatesService.listSummaries).mockResolvedValueOnce(
      makePage([makeSummary({ id: "c-1", full_name: "Alice Alves" })]),
    );

    render(
      <CandidateSearchModal
        isOpen
        activeJobId="job-1"
        activeJobTitle="Vaga"
        ranking={null}
        rankingLoading={false}
        onClose={vi.fn()}
        onAdded={vi.fn()}
        onCreateNew={vi.fn()}
      />,
    );

    const hint = await screen.findByTestId("initial-list-hint");
    expect(hint.textContent).toMatch(/mostrando .*1 candidato disponível/i);
    expect(hint.textContent).toMatch(/use a busca/i);
  });

  it("orientação some quando há termo de busca", async () => {
    const user = userEvent.setup();
    vi.mocked(candidatesService.listSummaries)
      .mockResolvedValueOnce(
        makePage([makeSummary({ id: "c-1", full_name: "Alice Alves" })]),
      )
      .mockResolvedValueOnce(
        makePage([makeSummary({ id: "c-99", full_name: "Zelda Zen" })]),
      );

    render(
      <CandidateSearchModal
        isOpen
        activeJobId="job-1"
        activeJobTitle="Vaga"
        ranking={null}
        rankingLoading={false}
        onClose={vi.fn()}
        onAdded={vi.fn()}
        onCreateNew={vi.fn()}
      />,
    );

    await screen.findByTestId("initial-list-hint");

    await user.type(
      screen.getByPlaceholderText(/buscar candidato por nome ou e-mail/i),
      "Zelda",
    );

    await waitFor(() => {
      expect(screen.queryByTestId("initial-list-hint")).not.toBeInTheDocument();
    });
  });

  it("digitar busca dispara listSummaries com search preenchido, pageSize maior e sem filtro de vínculo (busca global)", async () => {
    const user = userEvent.setup();
    vi.mocked(candidatesService.listSummaries)
      .mockResolvedValueOnce(
        makePage([makeSummary({ id: "c-1", full_name: "Alice Alves" })]),
      )
      .mockResolvedValueOnce(
        makePage([makeSummary({ id: "c-99", full_name: "Zelda Zen" })]),
      );

    render(
      <CandidateSearchModal
        isOpen
        activeJobId="job-1"
        activeJobTitle="Vaga"
        ranking={null}
        rankingLoading={false}
        onClose={vi.fn()}
        onAdded={vi.fn()}
        onCreateNew={vi.fn()}
      />,
    );

    await screen.findByText("Alice Alves");

    await user.type(
      screen.getByPlaceholderText(/buscar candidato por nome ou e-mail/i),
      "Zelda",
    );

    await waitFor(() => {
      expect(candidatesService.listSummaries).toHaveBeenCalledWith(1, 40, {
        search: "Zelda",
        link_status_filter: undefined,
      });
    });
    expect(await screen.findByText("Zelda Zen")).toBeInTheDocument();
  });

  it("busca não filtra apenas a slice inicial: encontra candidato fora dos primeiros 10 (sem filtro de vínculo)", async () => {
    // Initial fetch retorna 10 candidatos genéricos; a busca por "Zelda" retorna
    // candidato que NÃO estava na lista inicial — provando que a busca foi remota.
    const initialBatch = Array.from({ length: 10 }, (_, i) =>
      makeSummary({ id: `c-${i}`, full_name: `Candidato Inicial ${i}` }),
    );
    vi.mocked(candidatesService.listSummaries)
      .mockResolvedValueOnce(makePage(initialBatch))
      .mockResolvedValueOnce(
        makePage([makeSummary({ id: "c-zelda", full_name: "Zelda Fora Da Slice" })]),
      );

    const user = userEvent.setup();
    render(
      <CandidateSearchModal
        isOpen
        activeJobId="job-1"
        activeJobTitle="Vaga"
        ranking={null}
        rankingLoading={false}
        onClose={vi.fn()}
        onAdded={vi.fn()}
        onCreateNew={vi.fn()}
      />,
    );

    await screen.findByText("Candidato Inicial 0");
    // "Zelda" não está na lista inicial.
    expect(screen.queryByText(/Zelda Fora Da Slice/)).not.toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText(/buscar candidato por nome ou e-mail/i),
      "Zelda",
    );

    expect(await screen.findByText("Zelda Fora Da Slice")).toBeInTheDocument();
  });

  it("limpar busca restaura listagem inicial (chama service de novo sem search)", async () => {
    const user = userEvent.setup();
    vi.mocked(candidatesService.listSummaries)
      .mockResolvedValueOnce(
        makePage([makeSummary({ id: "c-1", full_name: "Alice Alves" })]),
      )
      .mockResolvedValueOnce(
        makePage([makeSummary({ id: "c-99", full_name: "Zelda Zen" })]),
      )
      .mockResolvedValueOnce(
        makePage([makeSummary({ id: "c-1", full_name: "Alice Alves" })]),
      );

    render(
      <CandidateSearchModal
        isOpen
        activeJobId="job-1"
        activeJobTitle="Vaga"
        ranking={null}
        rankingLoading={false}
        onClose={vi.fn()}
        onAdded={vi.fn()}
        onCreateNew={vi.fn()}
      />,
    );

    await screen.findByText("Alice Alves");

    const input = screen.getByPlaceholderText(/buscar candidato por nome ou e-mail/i);
    await user.type(input, "Zelda");
    await screen.findByText("Zelda Zen");

    await user.clear(input);

    await waitFor(() => {
      const calls = vi.mocked(candidatesService.listSummaries).mock.calls;
      const last = calls[calls.length - 1];
      expect(last[0]).toBe(1);
      expect(last[1]).toBe(10);
      expect(last[2]).toMatchObject({
        search: undefined,
        link_status_filter: "without_active_job",
      });
    });
  });

  it("busca sem resultado mostra 'Nenhum candidato encontrado para esta busca.'", async () => {
    const user = userEvent.setup();
    vi.mocked(candidatesService.listSummaries)
      .mockResolvedValueOnce(
        makePage([makeSummary({ id: "c-1", full_name: "Alice Alves" })]),
      )
      .mockResolvedValueOnce(makePage([]));

    render(
      <CandidateSearchModal
        isOpen
        activeJobId="job-1"
        activeJobTitle="Vaga"
        ranking={null}
        rankingLoading={false}
        onClose={vi.fn()}
        onAdded={vi.fn()}
        onCreateNew={vi.fn()}
      />,
    );

    await screen.findByText("Alice Alves");
    await user.type(
      screen.getByPlaceholderText(/buscar candidato por nome ou e-mail/i),
      "InexistenteXYZ",
    );

    await screen.findByText(/nenhum candidato encontrado para esta busca/i);
  });

  it("sem termo e sem candidatos disponíveis mostra 'Nenhum candidato disponível.'", async () => {
    vi.mocked(candidatesService.listSummaries).mockResolvedValueOnce(makePage([]));

    render(
      <CandidateSearchModal
        isOpen
        activeJobId="job-1"
        activeJobTitle="Vaga"
        ranking={null}
        rankingLoading={false}
        onClose={vi.fn()}
        onAdded={vi.fn()}
        onCreateNew={vi.fn()}
      />,
    );

    await screen.findByText(/nenhum candidato disponível/i);
  });

  it("IA Recomenda e 'Criar candidato manualmente' continuam visíveis na listagem inicial", async () => {
    vi.mocked(candidatesService.listSummaries).mockResolvedValueOnce(
      makePage([makeSummary({ id: "c-1", full_name: "Alice Alves" })]),
    );

    render(
      <CandidateSearchModal
        isOpen
        activeJobId="job-1"
        activeJobTitle="Vaga"
        ranking={null}
        rankingLoading={false}
        onClose={vi.fn()}
        onAdded={vi.fn()}
        onCreateNew={vi.fn()}
      />,
    );

    await screen.findByText("Alice Alves");
    expect(screen.getByRole("heading", { name: /IA Recomenda/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Criar candidato manualmente/i }),
    ).toBeInTheDocument();
  });
});

// ── Global search & candidate link status ─────────────────────────────────────

describe("CandidateSearchModal — status de vínculo e busca global", () => {
  function makeSummaryFull(overrides: Partial<{
    id: string;
    full_name: string;
    email: string | null;
    active_job_id: string | null;
    active_job_title: string | null;
    active_job_stage: string | null;
  }>) {
    return {
      id: "c-1",
      full_name: "João Silva",
      email: "joao@example.com",
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
      ...overrides,
    };
  }

  function makePage(data: ReturnType<typeof makeSummaryFull>[]) {
    return { data, total: data.length, page: 1, page_size: 10, total_pages: 1 };
  }

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(pipelineService.getCandidateHistory).mockRejectedValue(new Error("sem histórico"));
    vi.mocked(pipelineService.addCandidateToJob).mockResolvedValue({
      candidate_id: "c-1",
      job_id: "job-current",
      stage: "entry",
      candidate_status: "Recebido",
      status: "active",
      transition_id: "t-1",
      updated_at: "2026-06-01T10:00:00Z",
      analysis: null,
    });
  });

  function renderModal(onOpenCandidate = vi.fn()) {
    return render(
      <CandidateSearchModal
        isOpen
        activeJobId="job-current"
        activeJobTitle="Vaga Atual"
        ranking={null}
        rankingLoading={false}
        onClose={vi.fn()}
        onAdded={vi.fn()}
        onCreateNew={vi.fn()}
        onOpenCandidate={onOpenCandidate}
      />,
    );
  }

  it("candidato disponível mostra botão Vincular e não mostra badge de vínculo", async () => {
    vi.mocked(candidatesService.listSummaries).mockResolvedValue(
      makePage([makeSummaryFull({ active_job_id: null })]),
    );

    renderModal();

    await screen.findByText("João Silva");
    expect(screen.getByTestId("btn-link-c-1")).toBeInTheDocument();
    expect(screen.queryByTestId("badge-already-in-job")).not.toBeInTheDocument();
    expect(screen.queryByTestId("badge-in-another-job")).not.toBeInTheDocument();
    expect(screen.queryByTestId("btn-open-pipeline-c-1")).not.toBeInTheDocument();
  });

  it("candidato já vinculado nesta vaga mostra badge 'Já vinculado nesta vaga' e botão 'Abrir no pipeline'", async () => {
    vi.mocked(candidatesService.listSummaries).mockResolvedValue(
      makePage([makeSummaryFull({ active_job_id: "job-current", active_job_title: "Vaga Atual" })]),
    );

    renderModal();

    await screen.findByText("João Silva");
    expect(screen.getByTestId("badge-already-in-job")).toBeInTheDocument();
    expect(screen.getByTestId("btn-open-pipeline-c-1")).toBeInTheDocument();
    expect(screen.queryByTestId("btn-link-c-1")).not.toBeInTheDocument();
  });

  it("candidato em outra vaga mostra badge 'Em pipeline', botão 'Abrir no pipeline' e botão 'Vincular'", async () => {
    vi.mocked(candidatesService.listSummaries).mockResolvedValue(
      makePage([makeSummaryFull({
        active_job_id: "job-other",
        active_job_title: "Analista de Dados",
        active_job_stage: "hr_interview",
      })]),
    );

    renderModal();

    await screen.findByText("João Silva");
    const badge = screen.getByTestId("badge-in-another-job");
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toMatch(/Analista de Dados/);
    expect(badge.textContent).toMatch(/Entrevista RH/);
    expect(screen.getByTestId("btn-open-pipeline-c-1")).toBeInTheDocument();
    expect(screen.getByTestId("btn-link-c-1")).toBeInTheDocument();
  });

  it("clicar em 'Abrir no pipeline' chama onOpenCandidate com rota /pipeline/:jobId?candidateId=:id", async () => {
    const onOpenCandidate = vi.fn();
    vi.mocked(candidatesService.listSummaries).mockResolvedValue(
      makePage([makeSummaryFull({ active_job_id: "job-other", active_job_title: "Outra Vaga" })]),
    );

    renderModal(onOpenCandidate);

    await screen.findByText("João Silva");
    await userEvent.setup().click(screen.getByTestId("btn-open-pipeline-c-1"));

    expect(onOpenCandidate).toHaveBeenCalledWith(
      "c-1",
      "/pipeline/job-other?candidateId=c-1",
    );
  });

  it("clicar em 'Abrir no pipeline' quando já nesta vaga usa o jobId atual", async () => {
    const onOpenCandidate = vi.fn();
    vi.mocked(candidatesService.listSummaries).mockResolvedValue(
      makePage([makeSummaryFull({ active_job_id: "job-current", active_job_title: "Vaga Atual" })]),
    );

    renderModal(onOpenCandidate);

    await screen.findByText("João Silva");
    await userEvent.setup().click(screen.getByTestId("btn-open-pipeline-c-1"));

    expect(onOpenCandidate).toHaveBeenCalledWith(
      "c-1",
      "/pipeline/job-current?candidateId=c-1",
    );
  });

  it("busca com termo não usa link_status_filter (busca global)", async () => {
    const user = userEvent.setup();
    vi.mocked(candidatesService.listSummaries)
      .mockResolvedValueOnce(makePage([makeSummaryFull({ full_name: "Alice Alves" })]))
      .mockResolvedValueOnce(makePage([]));

    renderModal();

    await screen.findByText("Alice Alves");
    await user.type(screen.getByPlaceholderText(/buscar candidato por nome ou e-mail/i), "João");

    await waitFor(() => {
      const calls = vi.mocked(candidatesService.listSummaries).mock.calls;
      const searchCall = calls.find((c) => c[2]?.search === "João");
      expect(searchCall).toBeDefined();
      expect(searchCall![2].link_status_filter).toBeUndefined();
    });
  });

  it("busca sem termo usa link_status_filter without_active_job (lista inicial)", async () => {
    vi.mocked(candidatesService.listSummaries).mockResolvedValue(makePage([]));

    renderModal();

    await waitFor(() => {
      expect(candidatesService.listSummaries).toHaveBeenCalledWith(1, 10, {
        search: undefined,
        link_status_filter: "without_active_job",
      });
    });
  });

  it("candidato em outra vaga sem título mostra badge 'Em pipeline' sem nome de vaga", async () => {
    vi.mocked(candidatesService.listSummaries).mockResolvedValue(
      makePage([makeSummaryFull({ active_job_id: "job-other", active_job_title: null })]),
    );

    renderModal();

    await screen.findByText("João Silva");
    const badge = screen.getByTestId("badge-in-another-job");
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toMatch(/Em pipeline/);
  });
});

// ── IA Recomenda — status de vínculo via cross-reference ─────────────────────

describe("CandidateSearchModal — IA Recomenda link status", () => {
  function makeRankingEntry(candidateId: string, candidateName: string) {
    return {
      rank: 1,
      candidate_id: candidateId,
      candidate_name: candidateName,
      stage: "",
      pipeline_status: "",
      score_breakdown: {} as never,
      job_fit_score: 85,
      decision_suggestion: "approved" as const,
      reason_tags: [],
      entered_at: null,
      computed_at: "2026-06-01T10:00:00Z",
      ranking_summary_text: "",
      version: "v1",
    };
  }

  function makeSummary(overrides: {
    id: string;
    full_name: string;
    active_job_id: string | null;
    active_job_title?: string | null;
    active_job_stage?: string | null;
  }) {
    return {
      id: overrides.id,
      full_name: overrides.full_name,
      email: null,
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
      active_job_id: overrides.active_job_id,
      active_job_title: overrides.active_job_title ?? null,
      active_job_stage: overrides.active_job_stage ?? null,
      active_job_job_fit_score: null,
      ai_status: null,
    };
  }

  function makeRanking(candidateId: string, candidateName: string) {
    return {
      job_id: "job-current",
      total_candidates: 1,
      threshold_high: 80,
      threshold_low: 50,
      score_version: "v1",
      candidates: [makeRankingEntry(candidateId, candidateName)],
    };
  }

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(pipelineService.getCandidateHistory).mockRejectedValue(new Error("sem histórico"));
    vi.mocked(pipelineService.addCandidateToJob).mockResolvedValue({
      candidate_id: "c-ranked",
      job_id: "job-current",
      stage: "entry",
      candidate_status: "Recebido",
      status: "active",
      transition_id: "t-1",
      updated_at: "2026-06-01T10:00:00Z",
      analysis: null,
    });
  });

  it("recomendado sem summary (sem active_job_id) mostra apenas Vincular sem badge de vínculo", async () => {
    vi.mocked(candidatesService.listSummaries).mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      page_size: 10,
      total_pages: 1,
    });

    render(
      <CandidateSearchModal
        isOpen
        activeJobId="job-current"
        activeJobTitle="Vaga Atual"
        ranking={makeRanking("c-ranked", "Maria Recomendada")}
        rankingLoading={false}
        onClose={vi.fn()}
        onAdded={vi.fn()}
        onCreateNew={vi.fn()}
      />,
    );

    await screen.findByText("Maria Recomendada");
    expect(screen.getByTestId("ranked-btn-link-c-ranked")).toBeInTheDocument();
    expect(screen.queryByTestId("ranked-badge-in-job-c-ranked")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ranked-badge-in-another-c-ranked")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ranked-btn-open-c-ranked")).not.toBeInTheDocument();
  });

  it("recomendado com summary active_job_id === activeJobId mostra 'Já vinculado nesta vaga' e Abrir no pipeline", async () => {
    const onOpenCandidate = vi.fn();
    vi.mocked(candidatesService.listSummaries).mockResolvedValue({
      data: [makeSummary({ id: "c-ranked", full_name: "Maria Recomendada", active_job_id: "job-current" })],
      total: 1,
      page: 1,
      page_size: 10,
      total_pages: 1,
    });

    render(
      <CandidateSearchModal
        isOpen
        activeJobId="job-current"
        activeJobTitle="Vaga Atual"
        ranking={makeRanking("c-ranked", "Maria Recomendada")}
        rankingLoading={false}
        onClose={vi.fn()}
        onAdded={vi.fn()}
        onCreateNew={vi.fn()}
        onOpenCandidate={onOpenCandidate}
      />,
    );

    await screen.findByText("Maria Recomendada");
    expect(screen.getByTestId("ranked-badge-in-job-c-ranked")).toBeInTheDocument();
    expect(screen.getByTestId("ranked-btn-open-c-ranked")).toBeInTheDocument();
    expect(screen.queryByTestId("ranked-btn-link-c-ranked")).not.toBeInTheDocument();
  });

  it("recomendado em outra vaga mostra badge 'Em pipeline', botão Abrir no pipeline e botão Vincular", async () => {
    vi.mocked(candidatesService.listSummaries).mockResolvedValue({
      data: [makeSummary({
        id: "c-ranked",
        full_name: "Maria Recomendada",
        active_job_id: "job-other",
        active_job_title: "Analista Sênior",
        active_job_stage: "hr_interview",
      })],
      total: 1,
      page: 1,
      page_size: 10,
      total_pages: 1,
    });

    render(
      <CandidateSearchModal
        isOpen
        activeJobId="job-current"
        activeJobTitle="Vaga Atual"
        ranking={makeRanking("c-ranked", "Maria Recomendada")}
        rankingLoading={false}
        onClose={vi.fn()}
        onAdded={vi.fn()}
        onCreateNew={vi.fn()}
      />,
    );

    await screen.findByText("Maria Recomendada");
    const badge = screen.getByTestId("ranked-badge-in-another-c-ranked");
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toMatch(/Analista Sênior/);
    expect(badge.textContent).toMatch(/Entrevista RH/);
    expect(screen.getByTestId("ranked-btn-open-c-ranked")).toBeInTheDocument();
    expect(screen.getByTestId("ranked-btn-link-c-ranked")).toBeInTheDocument();
  });

  it("clicar em Abrir no pipeline no recomendado chama onOpenCandidate com rota correta", async () => {
    const onOpenCandidate = vi.fn();
    vi.mocked(candidatesService.listSummaries).mockResolvedValue({
      data: [makeSummary({ id: "c-ranked", full_name: "Maria Recomendada", active_job_id: "job-other" })],
      total: 1,
      page: 1,
      page_size: 10,
      total_pages: 1,
    });

    render(
      <CandidateSearchModal
        isOpen
        activeJobId="job-current"
        activeJobTitle="Vaga Atual"
        ranking={makeRanking("c-ranked", "Maria Recomendada")}
        rankingLoading={false}
        onClose={vi.fn()}
        onAdded={vi.fn()}
        onCreateNew={vi.fn()}
        onOpenCandidate={onOpenCandidate}
      />,
    );

    await screen.findByText("Maria Recomendada");
    await userEvent.setup().click(screen.getByTestId("ranked-btn-open-c-ranked"));

    expect(onOpenCandidate).toHaveBeenCalledWith(
      "c-ranked",
      "/pipeline/job-other?candidateId=c-ranked",
    );
  });
});
