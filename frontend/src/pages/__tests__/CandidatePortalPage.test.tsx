import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CandidatePortalPage } from "../CandidatePortalPage";
import { candidatePortalService } from "../../services/candidatePortalService";
import { communicationService } from "../../services/communicationService";
import { HttpError } from "../../services/http";
import { toast } from "../../shared/utils/toast";
import { VisualThemeProvider } from "../../hooks/useVisualTheme";

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

vi.mock("../../services/candidatePortalService", () => ({
  candidatePortalService: {
    getOverview: vi.fn(),
    listBehavioralAssessments: vi.fn(),
    getBehavioralAssessment: vi.fn(),
    startBehavioralAssessment: vi.fn(),
    saveBehavioralAnswers: vi.fn(),
    submitBehavioralAssessment: vi.fn(),
    getPreAdmission: vi.fn(),
    uploadPreAdmissionDocument: vi.fn(),
    updateProfile: vi.fn(),
    uploadResume: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock("../../services/communicationService", () => ({
  communicationService: {
    getCandidateCommunications: vi.fn(),
    markCommunicationRead: vi.fn(),
    requestCandidateContact: vi.fn(),
  },
}));

vi.mock("../../shared/utils/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function mockBaseOverview() {
  (candidatePortalService.getOverview as any).mockResolvedValue({
    candidate: {
      id: "cand-1",
      full_name: "Logout Tester",
      email: "logout@example.com",
      phone: "11999999999",
      cpf: "12345678909",
      salary_expectation: "5500.00",
      desired_contract_type: "CLT",
      city: "São Paulo",
      state: "SP",
      profile_completeness: 100,
      profile_status: "active",
    },
    resume: { has_resume: true, current_version: 1 },
    applications: [],
    interviews: [],
    documents: [],
  });
  (candidatePortalService.listBehavioralAssessments as any).mockResolvedValue([]);
  (candidatePortalService.getPreAdmission as any).mockResolvedValue({ case: null });
  (communicationService.getCandidateCommunications as any).mockResolvedValue({ communications: [] });
  (communicationService.requestCandidateContact as any).mockResolvedValue({});
}

function renderPortal() {
  return render(
    <VisualThemeProvider>
      <MemoryRouter future={routerFuture} initialEntries={["/candidato/portal"]}>
        <Routes>
          <Route path="/candidato/portal" element={<CandidatePortalPage />} />
          <Route path="/candidato/login" element={<div>Login destino</div>} />
        </Routes>
      </MemoryRouter>
    </VisualThemeProvider>,
  );
}

describe("CandidatePortalPage.handleLogout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBaseOverview();
  });

  it("limpa sessão local mesmo se a API de logout falhar (não deixa Uncaught Promise)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    (candidatePortalService.logout as any).mockRejectedValue(
      new HttpError(0, "ERR_EMPTY_RESPONSE", "ERR_EMPTY_RESPONSE", {}),
    );

    renderPortal();

    const logoutButton = await screen.findByRole("button", { name: /sair da conta/i });
    fireEvent.click(logoutButton);

    await waitFor(() => {
      expect(screen.getByText("Login destino")).toBeInTheDocument();
    });
    expect(candidatePortalService.logout).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it("redireciona para login após logout bem-sucedido", async () => {
    (candidatePortalService.logout as any).mockResolvedValue(undefined);

    renderPortal();

    const logoutButton = await screen.findByRole("button", { name: /sair da conta/i });
    fireEvent.click(logoutButton);

    await waitFor(() => {
      expect(screen.getByText("Login destino")).toBeInTheDocument();
    });
  });
});

describe("CandidatePortalPage.behavioralAssessment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBaseOverview();
  });

  it("ao concluir avaliação volta para Início, mostra card de conclusão e toast", async () => {
    const summary = {
      id: "assignment-1",
      candidate_id: "cand-1",
      job_id: "job-1",
      job_title: "Analista",
      template_id: "template-1",
      template_name: "Perfil comportamental",
      status: "pending",
      assigned_at: "2026-05-01T00:00:00Z",
      started_at: null,
      submitted_at: null,
      expires_at: null,
      answered_count: 0,
      question_count: 1,
    };
    const detail = {
      ...summary,
      status: "in_progress",
      started_at: "2026-05-01T01:00:00Z",
      competencies: [
        {
          id: "comp-1",
          name: "Organização",
          description: null,
          display_order: 0,
          questions: [
            {
              id: "question-1",
              question_text: "Como você prioriza suas tarefas?",
              answer_type: "text",
              is_required: true,
              display_order: 0,
              options_json: null,
              answer: null,
            },
          ],
        },
      ],
    };

    (candidatePortalService.listBehavioralAssessments as any).mockResolvedValue([summary]);
    (candidatePortalService.startBehavioralAssessment as any).mockResolvedValue(detail);
    (candidatePortalService.submitBehavioralAssessment as any).mockResolvedValue({
      ...detail,
      status: "submitted",
      submitted_at: "2026-05-01T02:00:00Z",
      answered_count: 1,
    });

    renderPortal();

    await screen.findByText("Resumo da situação");
    fireEvent.click(await screen.findByRole("button", { name: /responder avaliação/i }));
    fireEvent.click(await screen.findByRole("button", { name: /responder avaliação/i }));
    fireEvent.change(await screen.findByRole("textbox"), {
      target: { value: "Uso matriz de prioridade." },
    });
    fireEvent.click(screen.getByRole("button", { name: /enviar avaliação/i }));

    expect(await screen.findByText("Avaliação concluída")).toBeInTheDocument();
    expect(screen.getByText(/Perfil comportamental foi enviada com sucesso/i)).toBeInTheDocument();
    expect(screen.queryByText("Como você prioriza suas tarefas?")).not.toBeInTheDocument();
    expect(candidatePortalService.submitBehavioralAssessment).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("Avaliação concluída com sucesso.");
  });
});

describe("CandidatePortalPage.nextSteps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBaseOverview();
  });

  const baseTimeline = {
    current_step_label: "Análise de currículo",
    steps: [
      {
        key: "application_received",
        label: "Inscrição",
        description: "Inscrição recebida",
        status: "completed" as const,
      },
      {
        key: "resume_analysis",
        label: "Triagem",
        description: "Análise de currículo",
        status: "current" as const,
      },
      {
        key: "interview",
        label: "Entrevista",
        description: "Entrevista online",
        status: "pending" as const,
      },
      {
        key: "result",
        label: "Resultado",
        description: "Resultado final",
        status: "pending" as const,
      },
    ],
  };

  it("no estado inicial não mostra Entrevista nem Resultado", async () => {
    (candidatePortalService.getOverview as any).mockResolvedValue({
      candidate: { full_name: "John Doe", city: "SP", state: "SP" },
      public_timeline: {
        ...baseTimeline,
        current_step_label: "Inscrição",
        steps: baseTimeline.steps.map((s, i) =>
          i === 0 ? { ...s, status: "current" } : { ...s, status: "pending" }
        ),
      },
      status_public: "Em andamento",
    });

    renderPortal();

    const jornadaTitle = await screen.findByText("Sua jornada de candidatura");
    expect(jornadaTitle).toBeInTheDocument();

    expect(screen.getByText("Inscrição recebida")).toBeInTheDocument();
    expect(screen.getByText("Currículo em análise")).toBeInTheDocument();
    expect(screen.getByText("Próxima etapa")).toBeInTheDocument();
    expect(screen.getByText("Avisaremos por aqui quando houver novidades.")).toBeInTheDocument();

    expect(screen.queryByText("Entrevista")).not.toBeInTheDocument();
    expect(screen.queryByText("Resultado")).not.toBeInTheDocument();
  });

  it("mostra Entrevista apenas quando houver entrevista agendada", async () => {
    (candidatePortalService.getOverview as any).mockResolvedValue({
      candidate: { full_name: "John Doe", city: "SP", state: "SP" },
      public_timeline: {
        ...baseTimeline,
        current_step_label: "Entrevista",
        steps: baseTimeline.steps.map((s) =>
          s.key === "application_received" || s.key === "resume_analysis"
            ? { ...s, status: "completed" }
            : s.key === "interview"
            ? { ...s, status: "current", interview: { scheduled_at: "2026-06-01T10:00:00Z" } }
            : s.key === "result" ? { ...s, status: "pending" } : s
        ),
      },
      status_public: "Em andamento",
    });

    renderPortal();

    await screen.findByText("Sua jornada de candidatura");

    expect(screen.getByText("Entrevista")).toBeInTheDocument();
    expect(screen.getByText(/Entrevista agendada para/i)).toBeInTheDocument();
  });

  it("mostra Resultado apenas quando o processo estiver finalizado", async () => {
    (candidatePortalService.getOverview as any).mockResolvedValue({
      candidate: { full_name: "John Doe", city: "SP", state: "SP" },
      public_timeline: {
        ...baseTimeline,
        current_step_label: "Resultado",
        steps: baseTimeline.steps.map((s) =>
          s.key === "result" ? { ...s, status: "current" } : { ...s, status: "completed" }
        ),
      },
      status_public: "Finalizado",
    });

    renderPortal();

    await screen.findByText("Sua jornada de candidatura");

    expect(screen.getByText("Resultado")).toBeInTheDocument();
    expect(screen.getByText("Você será atualizado sobre o resultado do processo.")).toBeInTheDocument();
  });

  it("mantém pré-admissão como processo ativo e não mostra processo encerrado", async () => {
    (candidatePortalService.getOverview as any).mockResolvedValue({
      candidate: {
        id: "cand-1",
        full_name: "Joana Admitida",
        email: "joana@example.com",
        phone: "11999999999",
        city: "São Paulo",
        state: "SP",
        application_source: "public_application",
        application_source_label: "Candidatura pública",
      },
      active_application: {
        pipeline_id: "pipeline-1",
        job_id: "job-1",
        job_title: "Analista de Suporte N1",
        pipeline_stage: "pre_admission",
        status_public: "Pré-admissão",
        submitted_at: "2026-05-10T10:00:00Z",
        current_analysis_id: null,
        analysis_status: null,
        resume_version_id: "resume-version-1",
        resume_filename: "joana.pdf",
        is_talent_pool: false,
      },
      application_history: [],
      latest_resume: {
        resume_id: "resume-1",
        resume_version_id: "resume-version-1",
        file_name: "joana.pdf",
        extraction_status: "completed",
        uploaded_at: "2026-05-10T10:00:00Z",
      },
      talent_pool: false,
      status_public: "Pré-admissão",
      application_status: "active",
      current_process_status_label: "Pré-admissão",
      is_process_closed: false,
      closed_reason_public_label: null,
      can_request_contact: true,
      can_apply_to_other_jobs: true,
      public_timeline: {
        current_step_key: "result",
        current_step_label: "Aprovado",
        steps: [
          {
            key: "application_received",
            label: "Inscrição recebida",
            status: "completed",
            description: "Recebemos sua candidatura.",
            interview: null,
          },
          {
            key: "resume_analysis",
            label: "Currículo em análise",
            status: "completed",
            description: "Seu currículo está sendo avaliado.",
            interview: null,
          },
          {
            key: "result",
            label: "Aprovado",
            status: "current",
            description: "Você foi aprovado e segue em andamento admissional.",
            interview: null,
          },
        ],
      },
    });

    renderPortal();

    expect((await screen.findAllByText("Pré-admissão")).length).toBeGreaterThan(0);
    expect(screen.getByText("Analista de Suporte N1")).toBeInTheDocument();
    expect(screen.queryByText("Processo encerrado")).not.toBeInTheDocument();
  });

  it("mostra admitido como sucesso final sem banco de talentos", async () => {
    (candidatePortalService.getOverview as any).mockResolvedValue({
      candidate: {
        id: "cand-1",
        full_name: "Joana Admitida",
        email: "joana@example.com",
        phone: "11999999999",
        city: "São Paulo",
        state: "SP",
        application_source: "public_application",
        application_source_label: "Candidatura pública",
      },
      active_application: null,
      application_history: [
        {
          pipeline_id: "pipeline-1",
          job_id: "job-1",
          job_title: "Analista de Suporte N1",
          status: "admitted",
          status_label: "Admitido",
          submitted_at: "2026-05-10T10:00:00Z",
          updated_at: "2026-05-25T10:00:00Z",
          resume_file_name: "joana.pdf",
          analysis_status: null,
          application_source: "public_application",
          talent_pool: false,
          talent_pool_profile_status: null,
        },
      ],
      latest_resume: {
        resume_id: "resume-1",
        resume_version_id: "resume-version-1",
        file_name: "joana.pdf",
        extraction_status: "completed",
        uploaded_at: "2026-05-10T10:00:00Z",
      },
      talent_pool: false,
      status_public: "Admitido",
      application_status: "admitted",
      current_process_status_label: "Admitido",
      is_process_closed: true,
      closed_reason_public_label: "Admissão concluída.",
      can_request_contact: true,
      can_apply_to_other_jobs: true,
      public_timeline: {
        current_step_key: "result",
        current_step_label: "Admitido",
        steps: [
          {
            key: "application_received",
            label: "Inscrição recebida",
            status: "completed",
            description: "Recebemos sua candidatura.",
            interview: null,
          },
          {
            key: "result",
            label: "Admitido",
            status: "current",
            description: "Admissão concluída.",
            interview: null,
          },
        ],
      },
    });

    renderPortal();

    expect((await screen.findAllByText("Admitido")).length).toBeGreaterThan(0);
    expect(screen.getByText("Analista de Suporte N1")).toBeInTheDocument();
    expect(screen.queryByText("Você está no nosso Banco de Talentos.")).not.toBeInTheDocument();
  });

  it("não cobra avaliação comportamental pendente após admitted", async () => {
    (candidatePortalService.getOverview as any).mockResolvedValue({
      candidate: {
        id: "cand-1",
        full_name: "Joana Admitida",
        email: "joana@example.com",
        phone: "11999999999",
        city: "São Paulo",
        state: "SP",
        application_source: "public_application",
        application_source_label: "Candidatura pública",
      },
      active_application: null,
      application_history: [
        {
          pipeline_id: "pipeline-1",
          job_id: "job-1",
          job_title: "Analista de Suporte N1",
          status: "admitted",
          status_label: "Admitido",
          submitted_at: "2026-05-10T10:00:00Z",
          updated_at: "2026-05-25T10:00:00Z",
          resume_file_name: "joana.pdf",
          analysis_status: null,
          application_source: "public_application",
          talent_pool: false,
          talent_pool_profile_status: null,
        },
      ],
      latest_resume: {
        resume_id: "resume-1",
        resume_version_id: "resume-version-1",
        file_name: "joana.pdf",
        extraction_status: "completed",
        uploaded_at: "2026-05-10T10:00:00Z",
      },
      talent_pool: false,
      status_public: "Admitido",
      application_status: "admitted",
      current_process_status_label: "Admitido",
      is_process_closed: true,
      closed_reason_public_label: "Admissão concluída.",
      can_request_contact: true,
      can_apply_to_other_jobs: true,
      public_timeline: {
        current_step_key: "result",
        current_step_label: "Admitido",
        steps: [
          {
            key: "application_received",
            label: "Inscrição recebida",
            status: "completed",
            description: "Recebemos sua candidatura.",
            interview: null,
          },
          {
            key: "result",
            label: "Admitido",
            status: "current",
            description: "Admissão concluída.",
            interview: null,
          },
        ],
      },
    });
    (candidatePortalService.listBehavioralAssessments as any).mockResolvedValue([
      {
        id: "assignment-1",
        candidate_id: "cand-1",
        job_id: "job-1",
        job_title: "Analista de Suporte N1",
        template_id: "template-1",
        template_name: "Perfil comportamental",
        status: "pending",
        assigned_at: "2026-05-10T10:00:00Z",
        started_at: null,
        submitted_at: null,
        expires_at: null,
        answered_count: 0,
        question_count: 10,
      },
    ]);

    renderPortal();

    await screen.findByText("Analista de Suporte N1");

    expect(screen.queryByText("Avaliação comportamental pendente")).not.toBeInTheDocument();
  });
});

describe("CandidatePortalPage.rejectedProcess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (candidatePortalService.listBehavioralAssessments as any).mockResolvedValue([]);
    (candidatePortalService.getPreAdmission as any).mockResolvedValue({ case: null });
    (communicationService.getCandidateCommunications as any).mockResolvedValue({ communications: [] });
    (communicationService.requestCandidateContact as any).mockResolvedValue({});
  });

  function mockRejectedOverview() {
    (candidatePortalService.getOverview as any).mockResolvedValue({
      candidate: {
        id: "cand-1",
        full_name: "Maria Portal",
        email: "maria@example.com",
        phone: "11999999999",
        city: "São Paulo",
        state: "SP",
        application_source: "public_application",
        application_source_label: "Candidatura pública",
      },
      active_application: null,
      application_history: [
        {
          pipeline_id: "pipeline-1",
          job_id: "job-1",
          job_title: "Analista de Dados",
          status: "finished",
          status_label: "Processo encerrado",
          submitted_at: "2026-05-10T10:00:00Z",
          updated_at: "2026-05-20T10:00:00Z",
          resume_file_name: "maria.pdf",
          analysis_status: null,
          application_source: "public_application",
          talent_pool: false,
          talent_pool_profile_status: null,
        },
      ],
      latest_resume: {
        resume_id: "resume-1",
        resume_version_id: "version-1",
        file_name: "maria.pdf",
        extraction_status: "completed",
        uploaded_at: "2026-05-10T10:00:00Z",
      },
      talent_pool: true,
      status_public: "Processo encerrado",
      application_status: "rejected",
      current_process_status_label: "Processo encerrado",
      is_process_closed: true,
      closed_reason_public_label: "Você não foi selecionado para esta vaga no momento.",
      can_request_contact: true,
      can_apply_to_other_jobs: true,
      public_timeline: {
        current_step_key: "result",
        current_step_label: "Processo encerrado",
        steps: [
          {
            key: "application_received",
            label: "Inscrição recebida",
            status: "completed",
            description: "Recebemos sua candidatura.",
            interview: null,
          },
          {
            key: "resume_analysis",
            label: "Currículo em análise",
            status: "completed",
            description: "Seu currículo está sendo avaliado.",
            interview: null,
          },
          {
            key: "result",
            label: "Processo encerrado",
            status: "closed",
            description: "Você será atualizado sobre o andamento.",
            interview: null,
          },
        ],
      },
    });
  }

  it("mostra processo encerrado, resultado não selecionado e banco de talentos como complemento", async () => {
    mockRejectedOverview();

    renderPortal();

    expect((await screen.findAllByText("Processo encerrado")).length).toBeGreaterThan(0);
    expect(screen.getByText("Você não foi selecionado para esta vaga no momento.")).toBeInTheDocument();
    expect(screen.getAllByText(/Seu perfil continuará disponível em nosso banco de talentos/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Resultado")).toBeInTheDocument();
    expect(screen.getAllByText("Não selecionado").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /solicitar contato com o rh/i })).toBeInTheDocument();
    expect(screen.queryByText("Próxima atualização")).not.toBeInTheDocument();
  });

  it("envia solicitação de contato com assunto e corpo sugeridos", async () => {
    mockRejectedOverview();

    renderPortal();

    fireEvent.click(await screen.findByRole("button", { name: /solicitar contato com o rh/i }));

    await waitFor(() => {
      expect(communicationService.requestCandidateContact).toHaveBeenCalledWith({
        job_id: "job-1",
        subject: "Solicitação de contato sobre processo encerrado",
        body: "Olá, gostaria de solicitar contato sobre o processo seletivo da vaga Analista de Dados.",
      });
    });
  });

  it("candidato apenas em banco de talentos não vê mensagem de não seleção", async () => {
    (candidatePortalService.getOverview as any).mockResolvedValue({
      candidate: {
        id: "cand-2",
        full_name: "João Talento",
        email: "joao@example.com",
        phone: "11999999999",
        city: "São Paulo",
        state: "SP",
        application_source: "manual",
        application_source_label: "Cadastro manual",
      },
      active_application: null,
      application_history: [],
      latest_resume: {
        resume_id: "resume-2",
        resume_version_id: "version-2",
        file_name: "joao.pdf",
        extraction_status: "completed",
        uploaded_at: "2026-05-10T10:00:00Z",
      },
      talent_pool: true,
      status_public: "Você está em nosso banco de talentos",
      application_status: "talent_pool",
      current_process_status_label: "Você está em nosso banco de talentos",
      is_process_closed: false,
      closed_reason_public_label: null,
      can_request_contact: true,
      can_apply_to_other_jobs: true,
      public_timeline: null,
    });

    renderPortal();

    expect((await screen.findAllByText("Você está em nosso banco de talentos")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Você não foi selecionado para esta vaga no momento.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /solicitar contato com o rh/i })).not.toBeInTheDocument();
  });
});

describe("CandidatePortalPage.premiumLightThemeAndEmptyStates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mensagens vazias mostram empty state", async () => {
    mockBaseOverview();
    (communicationService.getCandidateCommunications as any).mockResolvedValue({ communications: [] });

    renderPortal();

    expect(await screen.findByText("Mais novidades em breve!")).toBeInTheDocument();
    expect(screen.getByText("Quando tivermos atualizações, avisaremos por aqui.")).toBeInTheDocument();
  });

  it("portal renderiza no tema claro sem quebrar", async () => {
    mockBaseOverview();
    renderPortal();

    expect(await screen.findByText("Sua jornada de candidatura")).toBeInTheDocument();
    expect(screen.getByText("Resumo da situação")).toBeInTheDocument();
    expect(screen.getByText("Próxima atualização")).toBeInTheDocument();
    expect(screen.getByText("Dicas para sua candidatura")).toBeInTheDocument();
  });

  it("logout limpa chaves de tema sem persistir novas", async () => {
    mockBaseOverview();
    (candidatePortalService.logout as any).mockResolvedValue(undefined);

    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    renderPortal();
    setItemSpy.mockClear();

    const logoutButton = await screen.findByRole("button", { name: /sair da conta/i });
    fireEvent.click(logoutButton);

    await waitFor(() => {
      expect(screen.getByText("Login destino")).toBeInTheDocument();
    });

    // Confirma que setItem não foi chamado com chaves de tema
    const themeCalls = setItemSpy.mock.calls.filter(([key]) => key.includes("theme") || key.includes("visual"));
    expect(themeCalls.length).toBe(0);

    setItemSpy.mockRestore();
  });
});
