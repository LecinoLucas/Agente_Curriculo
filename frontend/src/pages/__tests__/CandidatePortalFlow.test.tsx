import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

import { CandidateEntryPage } from "../CandidateEntryPage";

import { CandidatePortalPage } from "../CandidatePortalPage";
import { candidatePortalService } from "../../services/candidatePortalService";
import { communicationService } from "../../services/communicationService";
import { HttpError } from "../../services/http";
import { VisualThemeProvider } from "../../hooks/useVisualTheme";
import { AuthProvider } from "../../features/auth/AuthContext";

vi.mock("../../services/candidatePortalService", () => ({
  candidatePortalService: {
    login: vi.fn(),
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

describe("Candidate portal flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (candidatePortalService.listBehavioralAssessments as any).mockResolvedValue([]);
    (candidatePortalService.getPreAdmission as any).mockResolvedValue({ case: null });
    (communicationService.getCandidateCommunications as any).mockResolvedValue({
      communications: [],
    });
    (communicationService.markCommunicationRead as any).mockResolvedValue({
      message: "Communication marked as read",
    });
    (communicationService.requestCandidateContact as any).mockResolvedValue({});
  });

  it("renderiza entrada única do candidato com acesso para login e cadastro", () => {
    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidato"]}>
        <CandidateEntryPage />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: /criar cadastro/i })).toHaveAttribute(
      "href",
      "/candidato/cadastro"
    );
    expect(screen.getByRole("button", { name: /entrar no portal/i })).toBeInTheDocument();
  });

  it("renderiza login e valida e-mail e senha obrigatórios", async () => {
    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidato"]}>
        <CandidateEntryPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "Entrar no portal" }));
    expect(await screen.findByText("E-mail é obrigatório.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "maria.portal@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Entrar no portal" }));
    expect(await screen.findByText("Senha é obrigatória.")).toBeInTheDocument();
  });

  it("login com e-mail/senha redireciona para portal", async () => {
    (candidatePortalService.login as any).mockResolvedValue({
      message: "Login realizado com sucesso.",
      redirect_to: "/candidato/portal",
      session_expires_at: "2026-05-12T10:00:00Z",
    });

    render(
      <VisualThemeProvider>
        <MemoryRouter future={routerFuture} initialEntries={["/candidato"]}>
          <Routes>
            <Route path="/candidato" element={
              <AuthProvider>
                <CandidateEntryPage />
              </AuthProvider>
            } />
            <Route path="/candidato/portal" element={<div>Portal destino</div>} />
          </Routes>
        </MemoryRouter>
      </VisualThemeProvider>
    );

    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "maria.portal@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Senha"), {
      target: { value: "SenhaSegura123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Entrar no portal" }));

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
        current_step_key: "resume_analysis",
        current_step_label: "Currículo em análise",
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
            status: "current",
            description: "Seu currículo foi recebido e avaliado.",
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
    });

    render(
      <VisualThemeProvider>
        <MemoryRouter future={routerFuture} initialEntries={["/candidato/portal"]}>
          <Routes>
            <Route path="/candidato/portal" element={<CandidatePortalPage />} />
            <Route path="/candidato" element={<div>Login candidato</div>} />
          </Routes>
        </MemoryRouter>
      </VisualThemeProvider>
    );

    // Verify portal loads and displays candidate information (name contains Maria)
    expect((await screen.findAllByText(/Maria/i)).length).toBeGreaterThan(0);
    // Verify no internal scores are shown to public candidates
    expect(screen.queryByText(/score de ia/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/internal_notes/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Observações")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Essas observações são internas e não ficam visíveis para o candidato."),
    ).not.toBeInTheDocument();
  });

  it("redireciona candidato incompleto para completar cadastro", async () => {
    (candidatePortalService.getOverview as any).mockRejectedValue(
      new HttpError(
        403,
        "Sem permissão para esta operação",
        undefined,
        null,
        {
          code: "candidate_profile_incomplete",
          message: "Complete seu cadastro para acessar o portal do candidato.",
          missing_fields: ["cpf", "salary_expectation", "resume", "lgpd_consent"],
          redirect_to: "/candidato/cadastro",
        }
      )
    );

    render(
      <VisualThemeProvider>
        <MemoryRouter future={routerFuture} initialEntries={["/candidato/portal"]}>
          <Routes>
            <Route path="/candidato/portal" element={<CandidatePortalPage />} />
            <Route path="/candidato/cadastro" element={<div>Cadastro candidato</div>} />
          </Routes>
        </MemoryRouter>
      </VisualThemeProvider>
    );

    expect(await screen.findByText("Cadastro candidato")).toBeInTheDocument();
  });

  it("portal mostra card e permite responder avaliação comportamental", async () => {
    const overview = {
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
        current_analysis_id: null,
        analysis_status: null,
        resume_version_id: "resume-version-1",
        resume_filename: "maria-cv.pdf",
        is_talent_pool: false,
      },
      application_history: [],
      latest_resume: null,
      talent_pool: false,
      status_public: "Currículo em análise",
      public_timeline: null,
    };
    const pendingSummary = {
      id: "assignment-1",
      candidate_id: "candidate-1",
      job_id: "job-active",
      job_title: "Analista de Dados",
      template_id: "template-1",
      template_name: "Perfil Comportamental",
      status: "pending",
      assigned_at: "2026-05-12T09:10:00Z",
      started_at: null,
      submitted_at: null,
      expires_at: null,
      ai_evaluation_status: null,
      answered_count: 0,
      question_count: 3,
    };
    const detail = {
      ...pendingSummary,
      status: "in_progress",
      started_at: "2026-05-12T09:11:00Z",
      competencies: [
        {
          id: "competency-1",
          name: "Comunicação",
          description: null,
          display_order: 1,
          questions: [
            {
              id: "question-text",
              question_text: "Descreva uma situação de feedback.",
              answer_type: "text",
              is_required: true,
              display_order: 1,
              options_json: null,
              answer: null,
            },
            {
              id: "question-scale",
              question_text: "De 1 a 5, como você avalia sua comunicação?",
              answer_type: "scale",
              is_required: false,
              display_order: 2,
              options_json: null,
              answer: null,
            },
            {
              id: "question-choice",
              question_text: "Qual estilo combina mais com você?",
              answer_type: "multiple_choice",
              is_required: false,
              display_order: 3,
              options_json: ["Direto", "Colaborativo"],
              answer: null,
            },
          ],
        },
      ],
    };
    const detailWithAnswers = {
      ...detail,
      answered_count: 3,
      competencies: [
        {
          ...detail.competencies[0],
          questions: [
            {
              ...detail.competencies[0].questions[0],
              answer: { question_id: "question-text", answer_text: "Eu conduzi um feedback claro.", answer_value: null, selected_options_json: null },
            },
            {
              ...detail.competencies[0].questions[1],
              answer: { question_id: "question-scale", answer_text: null, answer_value: 4, selected_options_json: null },
            },
            {
              ...detail.competencies[0].questions[2],
              answer: { question_id: "question-choice", answer_text: null, answer_value: null, selected_options_json: ["Colaborativo"] },
            },
          ],
        },
      ],
    };

    (candidatePortalService.getOverview as any).mockResolvedValue(overview);
    (candidatePortalService.listBehavioralAssessments as any).mockResolvedValue([pendingSummary]);
    (candidatePortalService.startBehavioralAssessment as any).mockResolvedValue(detail);
    (candidatePortalService.saveBehavioralAnswers as any).mockResolvedValue(detailWithAnswers);
    (candidatePortalService.submitBehavioralAssessment as any).mockResolvedValue({
      ...detailWithAnswers,
      status: "submitted",
      submitted_at: "2026-05-12T09:20:00Z",
    });

    render(
      <VisualThemeProvider>
        <MemoryRouter future={routerFuture} initialEntries={["/candidato/portal"]}>
          <Routes>
            <Route path="/candidato/portal" element={<CandidatePortalPage />} />
            <Route path="/candidato" element={<div>Login candidato</div>} />
          </Routes>
        </MemoryRouter>
      </VisualThemeProvider>
    );

    // Wait for behavioral assessment service to be called
    await waitFor(() => {
      expect(candidatePortalService.listBehavioralAssessments).toHaveBeenCalled();
    });

    expect(screen.getByText(/avaliação comportamental pendente/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /responder avaliação/i }).length).toBeGreaterThan(0);

    // 1. Click redirect button on Home tab to go to "avaliacoes" tab
    fireEvent.click(screen.getAllByRole("button", { name: /responder avaliação/i })[0]);

    // 2. Wait for the tab to change and render the assessment card button
    const cardButton = await screen.findByRole("button", { name: /responder avaliação/i });

    // 3. Click the assessment card button to start the assessment
    fireEvent.click(cardButton);

    await waitFor(() => {
      expect(candidatePortalService.startBehavioralAssessment).toHaveBeenCalledWith("assignment-1");
    });

    const textAnswer = screen.getByLabelText(/descreva uma situação de feedback\./i);
    fireEvent.change(textAnswer, { target: { value: "Eu conduzi um feedback claro." } });

    fireEvent.click(screen.getByRole("button", { name: /enviar avaliação/i }));
    await waitFor(() => {
      expect(candidatePortalService.submitBehavioralAssessment).toHaveBeenCalled();
    });
  });
});
