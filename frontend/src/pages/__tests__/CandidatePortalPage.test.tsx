import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
      city: "São Paulo",
      state: "SP",
      application_source: "public_application",
      application_source_label: "Candidatura pública",
      salary_expectation: "5500.00",
      desired_contract_type: "CLT",
    },
    active_application: {
      pipeline_id: "pipeline-1",
      job_id: "job-1",
      job_title: "Analista",
      pipeline_stage: "screening",
      status_public: "Em triagem",
      submitted_at: "2026-05-01T10:00:00Z",
      current_analysis_id: null,
      analysis_status: null,
      resume_version_id: "resume-version-1",
      resume_filename: "curriculo.pdf",
      is_talent_pool: false,
    },
    application_history: [],
    latest_resume: {
      resume_id: "resume-1",
      resume_version_id: "resume-version-1",
      file_name: "curriculo.pdf",
      extraction_status: "completed",
      uploaded_at: "2026-05-01T10:00:00Z",
    },
    public_interview: null,
    talent_pool: false,
    status_public: "Em triagem",
    application_status: "active",
    current_process_status_label: "Em triagem",
    is_process_closed: false,
    closed_reason_public_label: null,
    can_request_contact: true,
    can_apply_to_other_jobs: true,
    public_timeline: null,
    pre_admission: null,
  });
  (candidatePortalService.listBehavioralAssessments as any).mockResolvedValue([]);
  (candidatePortalService.getPreAdmission as any).mockResolvedValue({
    case: null,
    summary: {
      has_pre_admission_case: false,
      pre_admission_status: null,
      documents_total: 0,
      documents_pending: 0,
      documents_submitted: 0,
      documents_approved: 0,
      next_pending_document: null,
    },
  });
  (communicationService.getCandidateCommunications as any).mockResolvedValue({ communications: [] });
  (communicationService.requestCandidateContact as any).mockResolvedValue({});
}

function renderPortal() {
  return render(
    <VisualThemeProvider>
      <MemoryRouter future={routerFuture} initialEntries={["/candidato/portal"]}>
        <Routes>
          <Route path="/candidato/portal" element={<CandidatePortalPage />} />
          <Route path="/candidato" element={<div>Login destino</div>} />
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

    await screen.findByText("Sua jornada de candidatura");
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

  it("no estado inicial mostra jornada fixa com entrevista futura", async () => {
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
    expect(screen.getAllByText("Currículo em análise").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Avaliação").length).toBeGreaterThan(0);
    expect(screen.getByText("Entrevista")).toBeInTheDocument();
    expect(screen.queryByText("Resultado")).not.toBeInTheDocument();
  });

  it("mostra Entrevista apenas quando houver entrevista agendada", async () => {
    (candidatePortalService.getOverview as any).mockResolvedValue({
      candidate: { full_name: "John Doe", city: "SP", state: "SP" },
      public_interview: {
        id: "int-1",
        status: "scheduled",
        status_label: "Entrevista agendada",
        scheduled_at: "2026-06-01T10:00:00Z",
        interview_type: "hr",
        interview_type_label: "RH",
        interview_format: "online",
        interview_format_label: "Online",
        location: null,
        meeting_url: "https://meet.example.com/sala",
        public_notes: "Entrar 5 minutos antes.",
        is_online: true,
      },
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

    expect(screen.getAllByText("Entrevista").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Entrevista agendada para/i).length).toBeGreaterThan(0);
    expect(screen.getByTestId("candidate-interview-card")).toBeInTheDocument();
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

    expect(screen.getAllByText("Resultado").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Você será atualizado sobre o resultado do processo.").length).toBeGreaterThan(0);
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

    // Navega para Situação
    fireEvent.click(await screen.findByTitle("Situação"));

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
      closed_reason_public_label: "Seu processo foi concluído com sucesso.",
      can_request_contact: true,
      can_apply_to_other_jobs: false,
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
            description: "Seu processo foi concluído com sucesso.",
            interview: null,
          },
        ],
      },
    });

    renderPortal();

    // Navega para Situação
    fireEvent.click(await screen.findByTitle("Situação"));

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
      closed_reason_public_label: "Seu processo foi concluído com sucesso.",
      can_request_contact: true,
      can_apply_to_other_jobs: false,
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
            description: "Seu processo foi concluído com sucesso.",
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

    // Navega para Situação
    fireEvent.click(await screen.findByTitle("Situação"));

    await screen.findByText("Analista de Suporte N1");

    expect(screen.queryByText("Avaliação comportamental pendente")).not.toBeInTheDocument();
  });
});

describe("CandidatePortalPage.rejectedProcess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (candidatePortalService.listBehavioralAssessments as any).mockResolvedValue([]);
    (candidatePortalService.getPreAdmission as any).mockResolvedValue({
      case: null,
      summary: {
        has_pre_admission_case: false,
        pre_admission_status: null,
        documents_total: 0,
        documents_pending: 0,
        documents_submitted: 0,
        documents_approved: 0,
        next_pending_document: null,
      },
    });
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
    expect(screen.getAllByText("Resultado").length).toBeGreaterThan(0);
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

  it("mostra desligado sem banco de talentos como status principal", async () => {
    (candidatePortalService.getOverview as any).mockResolvedValue({
      candidate: {
        id: "cand-3",
        full_name: "Clara Desligada",
        email: "clara@example.com",
        phone: "11999999999",
        city: "São Paulo",
        state: "SP",
        application_source: "public_application",
        application_source_label: "Candidatura pública",
      },
      active_application: null,
      application_history: [
        {
          pipeline_id: "pipeline-3",
          job_id: "job-3",
          job_title: "Analista de RH",
          status: "admitted",
          status_label: "Admitido",
          submitted_at: "2026-05-10T10:00:00Z",
          updated_at: "2026-05-28T10:00:00Z",
          resume_file_name: "clara.pdf",
          analysis_status: null,
          application_source: "public_application",
          talent_pool: false,
          talent_pool_profile_status: null,
        },
      ],
      latest_resume: {
        resume_id: "resume-3",
        resume_version_id: "version-3",
        file_name: "clara.pdf",
        extraction_status: "completed",
        uploaded_at: "2026-05-10T10:00:00Z",
      },
      talent_pool: false,
      status_public: "Processo admissional encerrado",
      application_status: "dismissed",
      current_process_status_label: "Processo admissional encerrado",
      is_process_closed: true,
      closed_reason_public_label: "Seu vínculo admissional foi encerrado pela equipe de RH.",
      can_request_contact: true,
      can_apply_to_other_jobs: false,
      public_timeline: {
        current_step_key: "result",
        current_step_label: "Processo admissional encerrado",
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
            label: "Processo admissional encerrado",
            status: "closed",
            description: "Seu vínculo admissional foi encerrado pela equipe de RH.",
            interview: null,
          },
        ],
      },
    });

    renderPortal();

    expect((await screen.findAllByText("Processo admissional encerrado")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Seu vínculo admissional foi encerrado pela equipe de RH.").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Seu perfil continuará disponível em nosso banco de talentos/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /ver outras vagas/i })).not.toBeInTheDocument();
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

    // Navegar para a aba de Mensagens
    const mensagensBtn = await screen.findByTitle("Mensagens");
    fireEvent.click(mensagensBtn);

    expect(await screen.findByText("Mais novidades em breve!")).toBeInTheDocument();
    expect(screen.getByText("Quando tivermos atualizações, avisaremos por aqui.")).toBeInTheDocument();
  });

  it("portal renderiza no tema claro sem quebrar", async () => {
    mockBaseOverview();
    renderPortal();

    expect(await screen.findByText("Sua jornada de candidatura")).toBeInTheDocument();
    expect(screen.getByText("Próxima ação")).toBeInTheDocument();
    expect(screen.getByText("Resumo da candidatura")).toBeInTheDocument();
    expect(screen.getByTitle("Avaliação Comportamental")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Documentos"));
    expect(await screen.findByText("Pré-admissão ainda não iniciada")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Perfil"));
    expect(await screen.findByText("Dados de contato")).toBeInTheDocument();
  });

  it("botão de correio no header exibe badge se houver mensagens não lidas e navega ao clicar", async () => {
    mockBaseOverview();
    (communicationService.getCandidateCommunications as any).mockResolvedValue({
      communications: [
        {
          id: "msg-1",
          subject: "Teste",
          body: "Olá",
          status: "sent",
          created_at: new Date().toISOString(),
        },
      ],
    });

    renderPortal();

    // Aguarda o header e verifica se o badge "1" aparece no botão do correio
    const headerMailBtn = await screen.findByTestId("header-mail-button");
    expect(headerMailBtn).toBeInTheDocument();

    // Verifica que o badge de não lidas com o número 1 é renderizado no botão do header
    expect(within(headerMailBtn).getByText("1")).toBeInTheDocument();

    // Ao clicar no botão do header, navega para a aba de Mensagens
    fireEvent.click(headerMailBtn);

    // Verifica se estamos na tela de mensagens
    expect(await screen.findByText("Fique por dentro das comunicações enviadas pelo time de recrutamento.")).toBeInTheDocument();
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

  it("valida o layout simples do portal do candidato com abas fixas", async () => {
    mockBaseOverview();
    renderPortal();

    expect(await screen.findByText("Sua jornada de candidatura")).toBeInTheDocument();
    expect(screen.getByText("Próxima ação")).toBeInTheDocument();
    expect(screen.getByText("Resumo da candidatura")).toBeInTheDocument();

    expect(screen.getByTitle("Andamento")).toBeInTheDocument();
    expect(screen.getByTitle("Avaliação Comportamental")).toBeInTheDocument();
    expect(screen.getByTitle("Documentos")).toBeInTheDocument();
    expect(screen.getByTitle("Mensagens")).toBeInTheDocument();
    expect(screen.getByTitle("Perfil")).toBeInTheDocument();

    expect(screen.queryByText("Fique por dentro das comunicações enviadas pelo time de recrutamento.")).not.toBeInTheDocument();

    const headerMailBtn = screen.getByTestId("header-mail-button");
    fireEvent.click(headerMailBtn);
    expect(await screen.findByText("Fique por dentro das comunicações enviadas pelo time de recrutamento.")).toBeInTheDocument();
  });

  it("mostra card de entrevista com data, local e link quando public_interview vem no overview", async () => {
    (candidatePortalService.getOverview as any).mockResolvedValue({
      candidate: {
        id: "cand-1",
        full_name: "Marina Agenda",
        email: "marina@example.com",
        phone: "11999999999",
        city: "São Paulo",
        state: "SP",
        application_source: "public_application",
        application_source_label: "Candidatura pública",
      },
      active_application: {
        pipeline_id: "pipeline-1",
        job_id: "job-1",
        job_title: "Analista",
        pipeline_stage: "hr_interview",
        status_public: "Entrevista",
        submitted_at: "2026-05-10T10:00:00Z",
        current_analysis_id: null,
        analysis_status: null,
        resume_version_id: "resume-version-1",
        resume_filename: "marina.pdf",
        is_talent_pool: false,
      },
      application_history: [],
      latest_resume: {
        resume_id: "resume-1",
        resume_version_id: "resume-version-1",
        file_name: "marina.pdf",
        extraction_status: "completed",
        uploaded_at: "2026-05-10T10:00:00Z",
      },
      public_interview: {
        id: "interview-1",
        status: "scheduled",
        status_label: "Entrevista agendada",
        scheduled_at: "2026-06-01T10:00:00Z",
        interview_type: "hr",
        interview_type_label: "RH",
        interview_format: "online",
        interview_format_label: "Online",
        location: "Sala virtual RH",
        meeting_url: "https://meet.example.com/interview-1",
        public_notes: "Tenha um documento com foto em mãos.",
        is_online: true,
      },
      talent_pool: false,
      status_public: "Entrevista",
      application_status: "active",
      current_process_status_label: "Entrevista",
      is_process_closed: false,
      closed_reason_public_label: null,
      can_request_contact: true,
      can_apply_to_other_jobs: true,
      public_timeline: {
        current_step_key: "interview",
        current_step_label: "Entrevista",
        steps: [
          { key: "application_received", label: "Inscrição recebida", status: "completed", description: "", interview: null },
          { key: "resume_analysis", label: "Currículo em análise", status: "completed", description: "", interview: null },
          {
            key: "interview",
            label: "Entrevista",
            status: "current",
            description: "Sua entrevista foi agendada.",
            interview: {
              id: "interview-1",
              status: "scheduled",
              status_label: "Entrevista agendada",
              scheduled_at: "2026-06-01T10:00:00Z",
              interview_type: "hr",
              interview_type_label: "RH",
              interview_format: "online",
              interview_format_label: "Online",
              location: "Sala virtual RH",
              meeting_url: "https://meet.example.com/interview-1",
              public_notes: "Tenha um documento com foto em mãos.",
              is_online: true,
            },
          },
          { key: "result", label: "Resultado", status: "upcoming", description: "", interview: null },
        ],
      },
    });

    renderPortal();

    const interviewCard = await screen.findByTestId("candidate-interview-card");
    expect(interviewCard).toBeInTheDocument();
    expect(within(interviewCard).getByText(/Entrevista agendada para/i)).toBeInTheDocument();
    expect(within(interviewCard).getByText("Tipo: RH.")).toBeInTheDocument();
    expect(within(interviewCard).getByText("Formato: Online.")).toBeInTheDocument();
    expect(within(interviewCard).getByText("Local: Sala virtual RH")).toBeInTheDocument();
    expect(within(interviewCard).getByRole("link", { name: /acessar link da entrevista/i })).toHaveAttribute(
      "href",
      "https://meet.example.com/interview-1",
    );
    expect(within(interviewCard).getByText("Tenha um documento com foto em mãos.")).toBeInTheDocument();
  });

  it("sincronizar recarrega overview e atualiza a entrevista visível", async () => {
    (candidatePortalService.getOverview as any)
      .mockResolvedValueOnce({
        candidate: { id: "cand-1", full_name: "Marina Agenda", email: "marina@example.com", phone: "11999999999", city: "São Paulo", state: "SP", application_source: "public_application", application_source_label: "Candidatura pública" },
        active_application: { pipeline_id: "pipeline-1", job_id: "job-1", job_title: "Analista", pipeline_stage: "hr_interview", status_public: "Entrevista", submitted_at: "2026-05-10T10:00:00Z", current_analysis_id: null, analysis_status: null, resume_version_id: "resume-version-1", resume_filename: "marina.pdf", is_talent_pool: false },
        application_history: [],
        latest_resume: { resume_id: "resume-1", resume_version_id: "resume-version-1", file_name: "marina.pdf", extraction_status: "completed", uploaded_at: "2026-05-10T10:00:00Z" },
        public_interview: { id: "interview-1", status: "scheduled", status_label: "Entrevista agendada", scheduled_at: "2026-06-01T10:00:00Z", interview_type: "hr", interview_type_label: "RH", interview_format: "online", interview_format_label: "Online", location: "Sala A", meeting_url: "https://meet.example.com/1", public_notes: null, is_online: true },
        talent_pool: false,
        status_public: "Entrevista",
        application_status: "active",
        current_process_status_label: "Entrevista",
        is_process_closed: false,
        closed_reason_public_label: null,
        can_request_contact: true,
        can_apply_to_other_jobs: true,
        public_timeline: { current_step_key: "interview", current_step_label: "Entrevista", steps: [] },
      })
      .mockResolvedValueOnce({
        candidate: { id: "cand-1", full_name: "Marina Agenda", email: "marina@example.com", phone: "11999999999", city: "São Paulo", state: "SP", application_source: "public_application", application_source_label: "Candidatura pública" },
        active_application: { pipeline_id: "pipeline-1", job_id: "job-1", job_title: "Analista", pipeline_stage: "hr_interview", status_public: "Entrevista", submitted_at: "2026-05-10T10:00:00Z", current_analysis_id: null, analysis_status: null, resume_version_id: "resume-version-1", resume_filename: "marina.pdf", is_talent_pool: false },
        application_history: [],
        latest_resume: { resume_id: "resume-1", resume_version_id: "resume-version-1", file_name: "marina.pdf", extraction_status: "completed", uploaded_at: "2026-05-10T10:00:00Z" },
        public_interview: { id: "interview-1", status: "rescheduled", status_label: "Entrevista agendada", scheduled_at: "2026-06-02T14:30:00Z", interview_type: "hr", interview_type_label: "RH", interview_format: "online", interview_format_label: "Online", location: "Sala B", meeting_url: "https://meet.example.com/2", public_notes: "Horário atualizado.", is_online: true },
        talent_pool: false,
        status_public: "Entrevista",
        application_status: "active",
        current_process_status_label: "Entrevista",
        is_process_closed: false,
        closed_reason_public_label: null,
        can_request_contact: true,
        can_apply_to_other_jobs: true,
        public_timeline: { current_step_key: "interview", current_step_label: "Entrevista", steps: [] },
      });

    (candidatePortalService.listBehavioralAssessments as any).mockResolvedValue([]);
    (candidatePortalService.getPreAdmission as any).mockResolvedValue({
      case: null,
      summary: {
        has_pre_admission_case: false,
        pre_admission_status: null,
        documents_total: 0,
        documents_pending: 0,
        documents_submitted: 0,
        documents_approved: 0,
        next_pending_document: null,
      },
    });
    (communicationService.getCandidateCommunications as any).mockResolvedValue({ communications: [] });

    renderPortal();

    expect(await screen.findByText(/Sala A/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /sincronizar/i }));

    await waitFor(() => {
      expect(candidatePortalService.getOverview).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText(/Sala B/)).toBeInTheDocument();
    expect(screen.getByText("Horário atualizado.")).toBeInTheDocument();
  });

  it("resultado final sem entrevista pública não inventa entrevista realizada", async () => {
    (candidatePortalService.getOverview as any).mockResolvedValue({
      candidate: {
        id: "cand-1",
        full_name: "Resultado Sem Entrevista",
        email: "resultado@example.com",
        phone: "11999999999",
        city: "São Paulo",
        state: "SP",
        application_source: "public_application",
        application_source_label: "Candidatura pública",
      },
      active_application: null,
      application_history: [],
      latest_resume: {
        resume_id: "resume-1",
        resume_version_id: "resume-version-1",
        file_name: "resultado.pdf",
        extraction_status: "completed",
        uploaded_at: "2026-05-10T10:00:00Z",
      },
      public_interview: null,
      talent_pool: false,
      status_public: "Admitido",
      application_status: "admitted",
      current_process_status_label: "Admitido",
      is_process_closed: true,
      closed_reason_public_label: "Seu processo foi concluído com sucesso.",
      can_request_contact: true,
      can_apply_to_other_jobs: false,
      public_timeline: {
        current_step_key: "result",
        current_step_label: "Admitido",
        steps: [
          { key: "application_received", label: "Inscrição recebida", status: "completed", description: "", interview: null },
          { key: "resume_analysis", label: "Currículo em análise", status: "completed", description: "", interview: null },
          { key: "interview", label: "Entrevista", status: "completed", description: "", interview: null },
          { key: "result", label: "Admitido", status: "current", description: "", interview: null },
        ],
      },
    });

    renderPortal();

    expect(await screen.findByText("Currículo analisado")).toBeInTheDocument();
    expect(screen.queryByText("Entrevista realizada")).not.toBeInTheDocument();
    expect(screen.queryByTestId("candidate-interview-card")).not.toBeInTheDocument();
  });
});

describe("CandidatePortalPage.preAdmission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBaseOverview();
  });

  function buildEnvelope() {
    return {
      case: {
        id: "case-1",
        status: "documents_pending",
        salary_offer: null,
        start_date: null,
        work_model: null,
        checklist_items: [
          {
            item_id: "item-1",
            title: "CPF",
            description: "Envie o CPF",
            required: true,
            status: "pending",
            rejection_reason_public: null,
            uploaded_document: null,
            allowed_file_types: ["application/pdf", "image/jpeg", "image/png"],
            max_file_size_mb: 10,
          },
          {
            item_id: "item-2",
            title: "RG",
            description: "Envie o RG",
            required: true,
            status: "rejected",
            rejection_reason_public: "Foto borrada, envie novamente.",
            uploaded_document: {
              id: "doc-1",
              original_filename: "rg.pdf",
              mime_type: "application/pdf",
              size_bytes: 1024,
              status: "rejected",
              uploaded_at: "2026-05-20T10:00:00Z",
            },
            allowed_file_types: ["application/pdf", "image/jpeg", "image/png"],
            max_file_size_mb: 10,
          },
          {
            item_id: "item-3",
            title: "Comprovante de endereço",
            description: null,
            required: true,
            status: "approved",
            rejection_reason_public: null,
            uploaded_document: {
              id: "doc-2",
              original_filename: "endereco.pdf",
              mime_type: "application/pdf",
              size_bytes: 1024,
              status: "approved",
              uploaded_at: "2026-05-21T10:00:00Z",
            },
            allowed_file_types: ["application/pdf", "image/jpeg", "image/png"],
            max_file_size_mb: 10,
          },
        ],
        summary: {
          has_pre_admission_case: true,
          pre_admission_status: "documents_pending",
          documents_total: 3,
          documents_pending: 2,
          documents_submitted: 1,
          documents_approved: 1,
          next_pending_document: "CPF",
        },
      },
      summary: {
        has_pre_admission_case: true,
        pre_admission_status: "documents_pending",
        documents_total: 3,
        documents_pending: 2,
        documents_submitted: 1,
        documents_approved: 1,
        next_pending_document: "CPF",
      },
    };
  }

  function mockOverviewWithPreAdmission() {
    (candidatePortalService.getOverview as any).mockResolvedValue({
      candidate: {
        id: "cand-1",
        full_name: "Aline Pré-admissão",
        email: "aline@example.com",
        phone: "11999999999",
        city: "São Paulo",
        state: "SP",
        application_source: "manual",
        application_source_label: "Indicação",
      },
      active_application: {
        pipeline_id: "pipeline-1",
        job_id: "job-1",
        job_title: "Analista Protheus",
        pipeline_stage: "pre_admission",
        status_public: "Pré-admissão em andamento",
        submitted_at: "2026-04-15T10:00:00Z",
        current_analysis_id: null,
        analysis_status: null,
        resume_version_id: "resume-version-1",
        resume_filename: "curriculo.pdf",
        is_talent_pool: false,
      },
      application_history: [],
      latest_resume: null,
      public_interview: null,
      talent_pool: false,
      status_public: "Pré-admissão",
      application_status: "active",
      current_process_status_label: "Pré-admissão",
      is_process_closed: false,
      closed_reason_public_label: null,
      can_request_contact: true,
      can_apply_to_other_jobs: true,
      public_timeline: null,
      pre_admission: {
        has_pre_admission_case: true,
        pre_admission_status: "documents_pending",
        documents_total: 3,
        documents_pending: 2,
        documents_submitted: 1,
        documents_approved: 1,
        next_pending_document: "CPF",
      },
    });
    (candidatePortalService.getPreAdmission as any).mockResolvedValue(buildEnvelope());
  }

  it("mostra tile de pré-admissão no dashboard quando existe caso ativo", async () => {
    mockOverviewWithPreAdmission();

    renderPortal();

    expect(await screen.findByTestId("candidate-portal-pre-admission-tile")).toBeInTheDocument();
    expect(screen.getByText(/1 de 3 documentos aprovados/i)).toBeInTheDocument();
    expect(screen.getByText(/Próximo: CPF/i)).toBeInTheDocument();
  });

  it("não mostra tile de pré-admissão quando não existe caso", async () => {
    renderPortal();

    await screen.findByText("STATUS ATUAL");
    expect(screen.queryByTestId("candidate-portal-pre-admission-tile")).not.toBeInTheDocument();
  });

  it("CTA do tile do dashboard navega para /candidato/pre-admissao", async () => {
    mockOverviewWithPreAdmission();

    renderPortal();

    const cta = await screen.findByTestId("candidate-portal-pre-admission-tile-cta");
    const link = cta.tagName === "A" ? cta : cta.querySelector("a");
    expect(link).not.toBeNull();
    expect(link).toHaveAttribute("href", "/candidato/pre-admissao");
  });

  it("portal mostra card-resumo no perfil sem checklist completo nem upload inline", async () => {
    mockOverviewWithPreAdmission();

    renderPortal();

    fireEvent.click(await screen.findByTitle("Perfil"));

    const summary = await screen.findByTestId("candidate-portal-pre-admission-summary");
    expect(within(summary).getByTestId("candidate-portal-pre-admission-cta")).toHaveAttribute(
      "href",
      "/candidato/pre-admissao",
    );

    // Detail/checklist UI was moved to the dedicated page — must not show here.
    expect(screen.queryByTestId("candidate-portal-pre-admission-card")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Enviar documento para CPF/i)).not.toBeInTheDocument();
  });

  it("portal-resumo não expõe dados internos de RH/Protheus", async () => {
    mockOverviewWithPreAdmission();

    renderPortal();

    fireEvent.click(await screen.findByTitle("Perfil"));

    const summary = await screen.findByTestId("candidate-portal-pre-admission-summary");
    const text = summary.textContent ?? "";
    expect(text).not.toMatch(/protheus/i);
    expect(text).not.toMatch(/review_notes/i);
    expect(text).not.toMatch(/reviewed_by/i);
    expect(text).not.toMatch(/payload/i);
    expect(text).not.toMatch(/score/i);
    expect(text).not.toMatch(/export[_ ]package/i);
  });
});

describe("CandidatePortalPage.assessmentTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBaseOverview();
  });

  it("aba Avaliação sempre visível na sidebar mesmo sem assignment", async () => {
    renderPortal();
    expect(await screen.findByTitle("Avaliação Comportamental")).toBeInTheDocument();
  });

  it("aba Avaliação visível quando vaga não exige avaliação", async () => {
    renderPortal();
    const tabBtn = await screen.findByTitle("Avaliação Comportamental");
    expect(tabBtn).toBeInTheDocument();
  });

  it("estado not_required mostra mensagem correta", async () => {
    // requires_behavioral_assessment ausente → false → not_required
    renderPortal();
    fireEvent.click(await screen.findByTitle("Avaliação Comportamental"));
    expect(await screen.findByText(/esta vaga não possui avaliação obrigatória/i)).toBeInTheDocument();
  });

  it("estado pending_release mostra mensagem correta", async () => {
    (candidatePortalService.getOverview as any).mockResolvedValue({
      candidate: { id: "cand-1", full_name: "Test", email: "t@t.com", phone: null, city: null, state: null, application_source: null, application_source_label: "" },
      active_application: { pipeline_id: "p-1", job_id: "j-1", job_title: "Dev", pipeline_stage: "screening", status_public: "Em triagem", submitted_at: "2026-05-01T10:00:00Z", current_analysis_id: null, analysis_status: null, resume_version_id: null, resume_filename: null, is_talent_pool: false },
      application_history: [],
      latest_resume: null,
      public_interview: null,
      talent_pool: false,
      status_public: "Em triagem",
      application_status: "active",
      current_process_status_label: "Em triagem",
      is_process_closed: false,
      closed_reason_public_label: null,
      can_request_contact: true,
      can_apply_to_other_jobs: true,
      public_timeline: null,
      pre_admission: null,
      requires_behavioral_assessment: true,
    });

    renderPortal();
    fireEvent.click(await screen.findByTitle("Avaliação Comportamental"));
    expect(await screen.findByText(/a avaliação ainda não foi liberada/i)).toBeInTheDocument();
  });

  it("estado available mostra botão Responder avaliação na aba", async () => {
    (candidatePortalService.listBehavioralAssessments as any).mockResolvedValue([
      { id: "a-1", candidate_id: "cand-1", job_id: "job-1", job_title: "Analista", template_id: "t-1", template_name: "Perfil", status: "pending", assigned_at: "2026-05-01T00:00:00Z", started_at: null, submitted_at: null, expires_at: null, answered_count: 0, question_count: 2 },
    ]);

    renderPortal();
    fireEvent.click(await screen.findByTitle("Avaliação Comportamental"));

    const buttons = await screen.findAllByRole("button", { name: /responder avaliação/i });
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it("estado submitted não mostra botão Responder avaliação na aba", async () => {
    (candidatePortalService.listBehavioralAssessments as any).mockResolvedValue([
      { id: "a-1", candidate_id: "cand-1", job_id: "job-1", job_title: "Analista", template_id: "t-1", template_name: "Perfil", status: "submitted", assigned_at: "2026-05-01T00:00:00Z", started_at: "2026-05-01T01:00:00Z", submitted_at: "2026-05-01T02:00:00Z", expires_at: null, answered_count: 2, question_count: 2, ai_evaluation_status: null },
    ]);

    renderPortal();
    fireEvent.click(await screen.findByTitle("Avaliação Comportamental"));

    expect(await screen.findByText(/recebemos suas respostas/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /responder avaliação/i })).not.toBeInTheDocument();
  });

  it("estado completed mostra mensagem de conclusão", async () => {
    (candidatePortalService.listBehavioralAssessments as any).mockResolvedValue([
      { id: "a-1", candidate_id: "cand-1", job_id: "job-1", job_title: "Analista", template_id: "t-1", template_name: "Perfil", status: "submitted", assigned_at: "2026-05-01T00:00:00Z", started_at: "2026-05-01T01:00:00Z", submitted_at: "2026-05-01T02:00:00Z", expires_at: null, answered_count: 2, question_count: 2, ai_evaluation_status: "completed" },
    ]);

    renderPortal();
    fireEvent.click(await screen.findByTitle("Avaliação Comportamental"));

    expect(await screen.findByText(/sua avaliação foi concluída/i)).toBeInTheDocument();
  });

  it("estado error mostra mensagem amigável quando listBehavioralAssessments falha", async () => {
    (candidatePortalService.listBehavioralAssessments as any).mockRejectedValue(new Error("network"));

    renderPortal();
    fireEvent.click(await screen.findByTitle("Avaliação Comportamental"));

    expect(await screen.findByText(/não foi possível carregar sua avaliação/i)).toBeInTheDocument();
  });

  it("timeline sidebar sempre exibe item Avaliação em qualquer estado", async () => {
    for (const assessments of [[], [{ id: "a-1", candidate_id: "cand-1", job_id: "job-1", job_title: "Analista", template_id: "t-1", template_name: "Perfil", status: "submitted", assigned_at: "2026-05-01T00:00:00Z", started_at: null, submitted_at: "2026-05-02T00:00:00Z", expires_at: null, answered_count: 1, question_count: 1, ai_evaluation_status: "completed" }]]) {
      vi.clearAllMocks();
      mockBaseOverview();
      (candidatePortalService.listBehavioralAssessments as any).mockResolvedValue(assessments);

      const { unmount } = renderPortal();
      expect(await screen.findByTitle("Avaliação Comportamental")).toBeInTheDocument();
      unmount();
    }
  });
});
