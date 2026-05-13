import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CandidateEntryPage } from "../CandidateEntryPage";
import { CandidateAssessmentPage } from "../CandidateAssessmentPage";
import { CandidateLoginPage } from "../CandidateLoginPage";
import { CandidatePortalPage } from "../CandidatePortalPage";
import { candidatePortalService } from "../../services/candidatePortalService";

vi.mock("../../services/candidatePortalService", () => ({
  candidatePortalService: {
    login: vi.fn(),
    getOverview: vi.fn(),
    updateProfile: vi.fn(),
    uploadResume: vi.fn(),
    logout: vi.fn(),
    startAssessment: vi.fn(),
    submitAssessment: vi.fn(),
  },
}));

vi.mock("../../shared/utils/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Candidate portal flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza entrada única do candidato com acesso para login e cadastro", () => {
    render(
      <MemoryRouter initialEntries={["/candidato"]}>
        <CandidateEntryPage />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: /quero me candidatar/i })).toHaveAttribute(
      "href",
      "/candidato/cadastro"
    );
    expect(screen.getByRole("link", { name: /já tenho cadastro/i })).toHaveAttribute(
      "href",
      "/candidato/login"
    );
  });

  it("renderiza login e valida e-mail e senha obrigatórios", async () => {
    render(
      <MemoryRouter initialEntries={["/candidato/login"]}>
        <CandidateLoginPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText("E-mail é obrigatório.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "maria.portal@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText("Senha é obrigatória.")).toBeInTheDocument();
  });

  it("login com e-mail/senha redireciona para portal", async () => {
    (candidatePortalService.login as any).mockResolvedValue({
      message: "Login realizado com sucesso.",
      redirect_to: "/candidato/portal",
      session_expires_at: "2026-05-12T10:00:00Z",
    });

    render(
      <MemoryRouter initialEntries={["/candidato/login"]}>
        <Routes>
          <Route path="/candidato/login" element={<CandidateLoginPage />} />
          <Route path="/candidato/portal" element={<div>Portal destino</div>} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "maria.portal@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Senha"), {
      target: { value: "SenhaSegura123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Portal destino")).toBeInTheDocument();
  });

  it("portal mostra dados do candidato e não exibe score", async () => {
    (candidatePortalService.getOverview as any).mockResolvedValue({
      candidate: {
        id: "candidate-1",
        full_name: "Maria Portal",
        email: "maria.portal@example.com",
        email_masked: "ma***@example.com",
        phone: "11987654321",
        phone_masked: "*******4321",
        cpf_masked: "123.***.***-09",
        city: "São Paulo",
        state: "SP",
        application_source: "public_application",
        application_source_label: "Candidatura pública",
      },
      active_application: {
        pipeline_id: "pipeline-active",
        job_id: "job-active",
        job_title: "Analista de Dados",
        pipeline_stage: "entry",
        status_public: "Currículo em análise",
        submitted_at: "2026-05-12T09:00:00Z",
        current_analysis_id: "analysis-active",
        analysis_status: "pending",
        resume_version_id: "resume-version-1",
        resume_filename: "maria-cv.pdf",
        is_talent_pool: false,
      },
      application_history: [],
      latest_resume: {
        resume_id: "resume-1",
        resume_version_id: "resume-version-1",
        file_name: "maria-cv.pdf",
        extraction_status: "pending",
        uploaded_at: "2026-05-12T10:00:00Z",
      },
      talent_pool: false,
      status_public: "Currículo em análise",
      public_timeline: {
        current_step_key: "behavioral_test",
        current_step_label: "Teste comportamental",
        steps: [
          {
            key: "application_received",
            label: "Inscrição recebida",
            status: "completed",
            description: "Recebemos sua candidatura.",
          },
          {
            key: "resume_analysis",
            label: "Currículo em análise",
            status: "completed",
            description: "Seu currículo foi recebido e avaliado.",
          },
          {
            key: "behavioral_test",
            label: "Teste comportamental",
            status: "current",
            description: "Complete o teste para continuar no processo.",
          },
          {
            key: "behavioral_survey",
            label: "Pesquisa comportamental",
            status: "upcoming",
            description: "Responda a pesquisa para complementar sua candidatura.",
          },
          {
            key: "screening",
            label: "Em triagem",
            status: "completed",
            description: "Nossa equipe está analisando seu perfil.",
          },
          {
            key: "interview",
            label: "Entrevista",
            status: "current",
            description: "Sua entrevista foi agendada.",
            interview: {
              status: "scheduled",
              scheduled_at: "2026-05-20T14:00:00-03:00",
              interview_format: "online",
              location: null,
              meeting_url: "https://meet.example.com/maria",
              public_notes: "Entraremos em contato pelo telefone cadastrado.",
            },
          },
          {
            key: "result",
            label: "Resultado",
            status: "upcoming",
            description: "Você será atualizado sobre o andamento.",
          },
        ],
      },
      assessments: [
        {
          id: "assignment-test",
          type: "behavioral_test",
          title: "Teste comportamental",
          description: "Avaliação de perfil comportamental.",
          status: "pending",
          required: true,
          due_at: null,
          assigned_at: "2026-05-12T09:00:00Z",
          started_at: null,
          completed_at: null,
          result_summary: null,
        },
      ],
    });

    render(
      <MemoryRouter initialEntries={["/candidato/portal"]}>
        <Routes>
          <Route path="/candidato/portal" element={<CandidatePortalPage />} />
          <Route path="/candidato/login" element={<div>Login candidato</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("Maria Portal")).toBeInTheDocument();
    expect(screen.getByText("123.***.***-09")).toBeInTheDocument();
    expect(screen.getByText("Andamento da candidatura")).toBeInTheDocument();
    expect(screen.getByText("Avaliações pendentes")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /iniciar teste/i })).toHaveAttribute(
      "href",
      "/candidato/portal/avaliacoes/assignment-test"
    );
    expect(screen.getAllByText("Teste comportamental").length).toBeGreaterThan(0);
    expect(screen.getByText(/Entrevista agendada para 20\/05\/2026.*14:00/i)).toBeInTheDocument();
    expect(screen.getByText("Formato: Online.")).toBeInTheDocument();
    expect(screen.getByText("Entraremos em contato pelo telefone cadastrado.")).toBeInTheDocument();
    expect(screen.queryByText(/score de ia/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/internal_notes/i)).not.toBeInTheDocument();
  });

  it("candidato responde avaliação comportamental e volta ao portal", async () => {
    (candidatePortalService.startAssessment as any).mockResolvedValue({
      id: "assignment-test",
      type: "behavioral_test",
      title: "Teste comportamental",
      description: "Avaliação de perfil.",
      status: "in_progress",
      required: true,
      due_at: null,
      privacy_notice: "Suas respostas serão usadas exclusivamente para fins de recrutamento e seleção.",
      questions: [
        {
          id: "question-single",
          question_text: "Como você prefere trabalhar?",
          question_type: "single_choice",
          required: true,
          order_index: 1,
          metadata: null,
          options: [{ id: "option-team", option_text: "Em equipe", order_index: 1 }],
        },
        {
          id: "question-multiple",
          question_text: "Quais ambientes combinam com você?",
          question_type: "multiple_choice",
          required: true,
          order_index: 2,
          metadata: null,
          options: [{ id: "option-dynamic", option_text: "Dinâmico", order_index: 1 }],
        },
        {
          id: "question-scale",
          question_text: "Como lida com pressão?",
          question_type: "scale",
          required: true,
          order_index: 3,
          metadata: { min: 1, max: 5 },
          options: [],
        },
        {
          id: "question-text",
          question_text: "Conte sua motivação.",
          question_type: "text",
          required: true,
          order_index: 4,
          metadata: null,
          options: [],
        },
      ],
    });
    (candidatePortalService.submitAssessment as any).mockResolvedValue({
      id: "assignment-test",
      status: "completed",
      message: "Respostas enviadas com sucesso.",
    });

    render(
      <MemoryRouter initialEntries={["/candidato/portal/avaliacoes/assignment-test"]}>
        <Routes>
          <Route path="/candidato/portal/avaliacoes/:assignmentId" element={<CandidateAssessmentPage />} />
          <Route path="/candidato/portal" element={<div>Portal atualizado</div>} />
          <Route path="/candidato/login" element={<div>Login candidato</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Teste comportamental" })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Em equipe"));
    fireEvent.click(screen.getByLabelText("Dinâmico"));
    fireEvent.change(screen.getByRole("slider"), { target: { value: "4" } });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Quero crescer com o time." } });
    fireEvent.click(screen.getByRole("button", { name: /enviar respostas/i }));

    expect(await screen.findByText("Portal atualizado")).toBeInTheDocument();
    expect(candidatePortalService.submitAssessment).toHaveBeenCalledWith(
      "assignment-test",
      expect.arrayContaining([
        expect.objectContaining({ question_id: "question-single", option_id: "option-team" }),
        expect.objectContaining({ question_id: "question-multiple", option_ids: ["option-dynamic"] }),
        expect.objectContaining({ question_id: "question-scale", answer_value: 4 }),
        expect.objectContaining({ question_id: "question-text", answer_text: "Quero crescer com o time." }),
      ])
    );
  });
});
