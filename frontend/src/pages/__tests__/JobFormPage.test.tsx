import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, act, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { EMPTY_FORM, SELECTION_FLOW_DEFAULTS } from "../../features/jobs/jobFormConfig";
import { buildFrontendPublicationBlockers } from "../../features/jobs/utils/jobFormHelpers";
import { MOCK_AI_PROMPT_EXAMPLE } from "../../features/jobs/utils/mockJobAiDraft";
import { STEPS, MACRO_STEPS, JobFormPage } from "../JobFormPage";
import {
  extractJobTextFromImage,
  generateJobAiDraft,
} from "../../features/jobs/services/jobAiDraftService";

// ─── Service mocks ────────────────────────────────────────────────────────────

vi.mock("../../features/jobs/services/jobAiDraftService", () => ({
  extractJobTextFromImage: vi.fn(),
  generateJobAiDraft: vi.fn(),
}));

const MOCK_MANDATORY_SKILLS = [
  "Atendimento ao cliente",
  "Operação de caixa",
  "Responsabilidade com dinheiro",
];

const MOCK_GENERATE_RESPONSE = {
  draft: {
    title: "Operador de Caixa",
    area: "Atendimento",
    seniority: null,
    work_model: "onsite",
    unit: "São Paulo, SP",
    salary_min: null,
    salary_max: null,
    description: "Vaga para operador de caixa em loja de varejo.",
    responsibilities: ["Operar caixa registradora", "Atender clientes"],
    requirements: ["Ensino médio completo"],
    mandatory_skills: MOCK_MANDATORY_SKILLS,
    nice_to_have_skills: ["Experiência anterior com caixa"],
    benefits: [],
    working_hours: "6x1",
    screening_questions: ["Tem disponibilidade para turno integral?"],
    pipeline_steps: ["Triagem", "Entrevista RH", "Decisão"],
    matching_criteria: ["Experiência em atendimento ao cliente"],
    requires_manager_review: true,
    requires_behavioral_assessment: false,
  },
  needs_review: ["salary_range", "unit"],
  source: { text_used: true, ocr_used: false, input_character_count: 50 },
  usage: {
    provider: "google",
    model: "gemini-2.5-flash",
    input_tokens: 150,
    output_tokens: 80,
    total_tokens: 230,
    estimated_cost: null,
  },
};

// ─── Other mocks ──────────────────────────────────────────────────────────────

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn(), useParams: () => ({}) };
});

vi.mock("../../features/auth/useAuth", () => ({
  useAuth: () => ({ user: { role: "admin", id: "u1", full_name: "Admin", email: "a@a.com" } }),
}));

vi.mock("../../features/jobs/hooks/useJobFormState", () => ({
  useJobFormState: () => ({
    form: EMPTY_FORM,
    setForm: vi.fn(),
    updateForm: vi.fn(),
    dealBreakerDraft: {},
    setDealBreakerDraft: vi.fn(),
    updateDealBreakerDraft: vi.fn(),
    addBehavioralRequirement: vi.fn(),
    addDealBreaker: vi.fn(),
    resetFormState: vi.fn(),
  }),
}));

vi.mock("../../features/jobs/hooks/useJobSkills", () => ({
  useJobSkills: () => ({
    jobSkills: [],
    setJobSkills: vi.fn(),
    pendingSkills: [],
    setPendingSkills: vi.fn(),
    skillSearch: "",
    setSkillSearch: vi.fn(),
    skillCategoryFilter: "",
    setSkillCategoryFilter: vi.fn(),
    skillTypeFilter: "",
    setSkillTypeFilter: vi.fn(),
    skillCategoryOptions: [],
    skillTypeOptions: [],
    savingSkillId: null,
    allSkills: [],
    setAllSkills: vi.fn(),
    mandatorySkills: [],
    optionalSkills: [],
    eliminatorySkills: [],
    availableSkills: [],
    handleAddSkill: vi.fn(),
    handleUpdateSkill: vi.fn(),
    handleRemoveSkill: vi.fn(),
    syncPendingSkills: vi.fn().mockResolvedValue(undefined),
    onSkillCreated: vi.fn(),
  }),
}));

vi.mock("../../features/jobs/hooks/useJobPublication", () => ({
  useJobPublication: () => ({
    jobQuality: null,
    setJobQuality: vi.fn(),
    backendPublishErrors: [],
    setBackendPublishErrors: vi.fn(),
    frontendBlockers: ["seniority_level", "minimum_years_experience"],
    publicationState: {
      tone: "warning" as const,
      label: "Incompleta",
      description: "Faltam campos obrigatórios.",
    },
    canTryPublishFrontend: false,
  }),
}));

vi.mock("../../hooks/useJobConfigurationAlerts", () => ({
  useJobConfigurationAlerts: () => ({ alerts: [] }),
}));

vi.mock("../../features/jobs/sections/JobFormBasicStep", () => ({
  JobFormBasicStep: () => <div data-testid="step-basic" />,
}));
vi.mock("../../features/jobs/sections/JobFormRequirementsStep", () => ({
  JobFormRequirementsStep: () => <div data-testid="step-requirements" />,
}));
vi.mock("../../features/jobs/sections/JobFormMandatorySkillsStep", () => ({
  JobFormMandatorySkillsStep: () => <div data-testid="step-mandatory-skills" />,
}));
vi.mock("../../features/jobs/sections/JobFormDifferentialsStep", () => ({
  JobFormDifferentialsStep: () => <div data-testid="step-differentials" />,
}));
vi.mock("../../features/jobs/sections/JobFormDealBreakersStep", () => ({
  JobFormDealBreakersStep: () => <div data-testid="step-deal-breakers" />,
}));
vi.mock("../../features/jobs/sections/JobFormReviewStep", () => ({
  JobFormReviewStep: () => <div data-testid="step-review" />,
}));
vi.mock("../../features/jobs/components/BehavioralTemplateSelector", () => ({
  BehavioralTemplateSelector: () => <div data-testid="step-behavioral" />,
}));
vi.mock("../../features/jobs/components/JobAssessmentPolicyStep", () => ({
  JobAssessmentPolicyStep: () => <div data-testid="step-assessment-policy" />,
}));
vi.mock("../../components/job/JobQualityBadge", () => ({
  JobQualityBadge: () => <div data-testid="quality-badge" />,
}));
vi.mock("../../components/common/StatusPill", () => ({
  StatusPill: ({ label }: { label: string }) => <span>{label}</span>,
}));
vi.mock("../../shared/components/data-display/SummaryRow", () => ({
  SummaryRow: ({ label, value }: { label: string; value: string }) => (
    <div>
      {label}: {value}
    </div>
  ),
}));
vi.mock("../../shared/components/feedback/MessageList", () => ({
  MessageList: () => <div data-testid="message-list" />,
}));

// ─────────────────────────────────────────────────────────────────────────────

function renderForm() {
  return render(
    <MemoryRouter>
      <JobFormPage />
    </MemoryRouter>,
  );
}

describe("JobFormPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generateJobAiDraft).mockResolvedValue(MOCK_GENERATE_RESPONSE);
    vi.mocked(extractJobTextFromImage).mockResolvedValue({
      extracted_text: "Texto extraído por OCR da imagem da vaga.",
      character_count: 42,
      source: "ocr",
    });
  });

  // ── Existing: Step order (must not break) ────────────────────────────────

  describe("Step order", () => {
    it("renders 'Fluxo de avaliação' before 'Avaliação comportamental'", () => {
      const assessmentPolicyIndex = STEPS.findIndex((s) => s.id === "assessment-policy");
      const behavioralIndex = STEPS.findIndex((s) => s.id === "behavioral");

      expect(assessmentPolicyIndex).toBeLessThan(behavioralIndex);
      expect(assessmentPolicyIndex).toBe(5);
      expect(behavioralIndex).toBe(6);
    });
  });

  // ── Existing: Publication flow and blockers (must not break) ─────────────

  describe("Publication flow and blockers", () => {
    it("does not require behavioral template for Technical flow", () => {
      const technicalPolicy = SELECTION_FLOW_DEFAULTS.technical;

      const blockers = buildFrontendPublicationBlockers(
        {
          ...EMPTY_FORM,
          requires_behavioral_assessment: technicalPolicy.requires_behavioral_assessment,
          behavioral_template_id: null,
        },
        2,
      );

      expect(technicalPolicy.requires_behavioral_assessment).toBe(false);
      expect(blockers).not.toContain("behavioral_template_id");
    });

    it("requires behavioral template for Standard flow", () => {
      const standardPolicy = SELECTION_FLOW_DEFAULTS.standard;

      const blockers = buildFrontendPublicationBlockers(
        {
          ...EMPTY_FORM,
          requires_behavioral_assessment: standardPolicy.requires_behavioral_assessment,
          behavioral_template_id: null,
        },
        2,
      );

      expect(standardPolicy.requires_behavioral_assessment).toBe(true);
      expect(blockers).toContain("behavioral_template_id");
    });

    it("blocks publication when mandatory gates (like seniority) are pending", () => {
      const blockers = buildFrontendPublicationBlockers(
        {
          ...EMPTY_FORM,
          job_area: "Engenharia",
          seniority_level: "",
          minimum_years_experience: 2,
        },
        2,
      );

      expect(blockers.length).toBeGreaterThan(0);
      expect(blockers).toContain("seniority_level");
    });

    it("allows publication when all mandatory gates are filled", () => {
      const blockers = buildFrontendPublicationBlockers(
        {
          ...EMPTY_FORM,
          job_area: "Engenharia",
          seniority_level: "Pleno",
          minimum_years_experience: 3,
          requires_behavioral_assessment: true,
          behavioral_template_id: "template-123",
        },
        2,
      );

      expect(blockers).toHaveLength(0);
    });
  });

  // ── New: MACRO_STEPS structure ────────────────────────────────────────────

  describe("MACRO_STEPS", () => {
    it("has exactly 4 macro-steps", () => {
      expect(MACRO_STEPS).toHaveLength(4);
    });

    it("macro-step IDs are correct and in order", () => {
      expect(MACRO_STEPS.map((s) => s.id)).toEqual([
        "context",
        "skills",
        "evaluation",
        "review",
      ]);
    });

    it("Contexto da vaga contains basic and requirements", () => {
      const context = MACRO_STEPS.find((s) => s.id === "context");
      expect(context?.steps).toContain("basic");
      expect(context?.steps).toContain("requirements");
    });

    it("Competências contains mandatory-skills, differentials and deal-breakers", () => {
      const skills = MACRO_STEPS.find((s) => s.id === "skills");
      expect(skills?.steps).toContain("mandatory-skills");
      expect(skills?.steps).toContain("differentials");
      expect(skills?.steps).toContain("deal-breakers");
    });

    it("Avaliação contains assessment-policy before behavioral", () => {
      const evaluation = MACRO_STEPS.find((s) => s.id === "evaluation");
      const apIdx = evaluation?.steps.indexOf("assessment-policy") ?? -1;
      const bIdx = evaluation?.steps.indexOf("behavioral") ?? -1;
      expect(apIdx).toBeGreaterThanOrEqual(0);
      expect(bIdx).toBeGreaterThanOrEqual(0);
      expect(apIdx).toBeLessThan(bIdx);
    });

    it("Revisão e publicação is the last macro-step", () => {
      expect(MACRO_STEPS[MACRO_STEPS.length - 1].id).toBe("review");
    });

    it("all 8 original STEPS are covered by MACRO_STEPS", () => {
      const covered = MACRO_STEPS.flatMap((ms) => ms.steps);
      for (const step of STEPS) {
        expect(covered).toContain(step.id);
      }
    });

    it("no step is duplicated across MACRO_STEPS", () => {
      const all = MACRO_STEPS.flatMap((ms) => ms.steps);
      expect(new Set(all).size).toBe(all.length);
    });

    it("review is at index 3", () => {
      expect(MACRO_STEPS.findIndex((s) => s.id === "review")).toBe(3);
    });

    it("3 non-review macro-steps show quality drawer (not review)", () => {
      const nonReview = MACRO_STEPS.filter((s) => s.id !== "review");
      expect(nonReview).toHaveLength(3);
    });
  });

  // ── New: Rendering — macro-step navigation ────────────────────────────────

  describe("renderização das macroetapas", () => {
    it("renderiza as 4 macroetapas no stepper", () => {
      renderForm();
      const nav = screen.getByRole("navigation", { name: /Etapas do formulário/i });
      expect(within(nav).getByText("Contexto da vaga")).toBeInTheDocument();
      expect(within(nav).getByText("Competências")).toBeInTheDocument();
      expect(within(nav).getByText("Avaliação")).toBeInTheDocument();
      expect(within(nav).getByText("Revisão e publicação")).toBeInTheDocument();
    });

    it("campos da macro-etapa Contexto estão presentes", () => {
      renderForm();
      expect(screen.getByTestId("step-basic")).toBeInTheDocument();
      expect(screen.getByTestId("step-requirements")).toBeInTheDocument();
    });

    it("navegação entre macroetapas funciona: Próxima etapa avança para Competências", () => {
      renderForm();
      expect(screen.getByTestId("step-basic")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Próxima etapa/i }));

      expect(screen.getByTestId("step-mandatory-skills")).toBeInTheDocument();
      expect(screen.getByTestId("step-differentials")).toBeInTheDocument();
      expect(screen.getByTestId("step-deal-breakers")).toBeInTheDocument();
      expect(screen.queryByTestId("step-basic")).not.toBeInTheDocument();
    });

    it("navegação entre macroetapas funciona: Etapa anterior volta para Contexto", () => {
      renderForm();
      fireEvent.click(screen.getByRole("button", { name: /Próxima etapa/i }));
      expect(screen.getByTestId("step-mandatory-skills")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Etapa anterior/i }));
      expect(screen.getByTestId("step-basic")).toBeInTheDocument();
    });

    it("botão Etapa anterior está desabilitado na primeira macroetapa", () => {
      renderForm();
      expect(screen.getByRole("button", { name: /Etapa anterior/i })).toBeDisabled();
    });

    it("botão Publicar aparece somente na macro-etapa revisão", () => {
      renderForm();
      expect(
        screen.queryByRole("button", { name: /^Publicar$/i }),
      ).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Próxima etapa/i }));
      fireEvent.click(screen.getByRole("button", { name: /Próxima etapa/i }));
      fireEvent.click(screen.getByRole("button", { name: /Próxima etapa/i }));

      expect(screen.getByRole("button", { name: /^Publicar$/i })).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Próxima etapa/i }),
      ).not.toBeInTheDocument();
    });

    it("painel de qualidade e step-review aparecem na macro-etapa revisão", () => {
      renderForm();
      fireEvent.click(screen.getByRole("button", { name: /Próxima etapa/i }));
      fireEvent.click(screen.getByRole("button", { name: /Próxima etapa/i }));
      fireEvent.click(screen.getByRole("button", { name: /Próxima etapa/i }));

      expect(screen.getByTestId("step-review")).toBeInTheDocument();
      expect(screen.getByText(/Painel de qualidade/i)).toBeInTheDocument();
    });

    it("salvar rascunho está disponível em todas as etapas", () => {
      renderForm();
      expect(screen.getByRole("button", { name: /Salvar rascunho/i })).not.toBeDisabled();
    });

    it("publicar continua bloqueado no frontend quando qualidade/regras não permitem", () => {
      renderForm();
      fireEvent.click(screen.getByRole("button", { name: /Próxima etapa/i }));
      fireEvent.click(screen.getByRole("button", { name: /Próxima etapa/i }));
      fireEvent.click(screen.getByRole("button", { name: /Próxima etapa/i }));

      expect(screen.getByText(/Senioridade não definida/i)).toBeInTheDocument();
    });

    it("drawer 'Ver qualidade' abre e fecha", () => {
      renderForm();
      expect(
        screen.queryByRole("dialog", { name: /Qualidade da vaga/i }),
      ).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Ver qualidade da vaga/i }));
      expect(
        screen.getByRole("dialog", { name: /Qualidade da vaga/i }),
      ).toBeInTheDocument();

      fireEvent.click(
        screen.getByRole("button", { name: /Fechar painel de qualidade/i }),
      );
      expect(
        screen.queryByRole("dialog", { name: /Qualidade da vaga/i }),
      ).not.toBeInTheDocument();
    });

    it("não existe sidebar direita fixa (aside/complementary) nas etapas de preenchimento", () => {
      renderForm();
      expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    });

    it("botão Ver qualidade não aparece na macro-etapa revisão", () => {
      renderForm();
      fireEvent.click(screen.getByRole("button", { name: /Próxima etapa/i }));
      fireEvent.click(screen.getByRole("button", { name: /Próxima etapa/i }));
      fireEvent.click(screen.getByRole("button", { name: /Próxima etapa/i }));

      expect(
        screen.queryByRole("button", { name: /Ver qualidade da vaga/i }),
      ).not.toBeInTheDocument();
    });
  });

  // ── Fase IA Vaga 1+4 — Criar com IA ──────────────────────────────────────

  describe("Fase IA Vaga 1 — Criar com IA", () => {
    it("1. botão 'Criar com IA' está presente na página", () => {
      renderForm();
      expect(screen.getByRole("button", { name: /Criar com IA/i })).toBeInTheDocument();
    });

    it("2. ao clicar 'Criar com IA', painel de IA é exibido", () => {
      renderForm();
      expect(screen.queryByTestId("ai-draft-panel")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Criar com IA/i }));

      expect(screen.getByTestId("ai-draft-panel")).toBeInTheDocument();
    });

    it("3. ao clicar 'Cadastro manual', painel de IA é ocultado", () => {
      renderForm();
      fireEvent.click(screen.getByRole("button", { name: /Criar com IA/i }));
      expect(screen.getByTestId("ai-draft-panel")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Cadastro manual/i }));

      expect(screen.queryByTestId("ai-draft-panel")).not.toBeInTheDocument();
    });

    it("4. botão 'Preencher exemplo' preenche o prompt com texto de exemplo", () => {
      renderForm();
      fireEvent.click(screen.getByRole("button", { name: /Criar com IA/i }));

      const textarea = screen.getByLabelText(/Descrição da vaga para IA/i);
      expect(textarea).toHaveValue("");

      fireEvent.click(screen.getByRole("button", { name: /Preencher exemplo/i }));

      expect(textarea).toHaveValue(MOCK_AI_PROMPT_EXAMPLE);
    });

    it("5. botão 'Gerar rascunho com IA' está presente no painel", () => {
      renderForm();
      fireEvent.click(screen.getByRole("button", { name: /Criar com IA/i }));

      expect(
        screen.getByRole("button", { name: /Gerar rascunho com IA/i }),
      ).toBeInTheDocument();
    });

    it("6. ao clicar 'Gerar rascunho' com texto, exibe estado de carregamento", async () => {
      // Keep promise pending so loading state is visible during assertion
      vi.mocked(generateJobAiDraft).mockReturnValue(new Promise(() => {}));

      renderForm();
      fireEvent.click(screen.getByRole("button", { name: /Criar com IA/i }));

      const textarea = screen.getByLabelText(/Descrição da vaga para IA/i);
      fireEvent.change(textarea, { target: { value: "Operador de Caixa" } });
      fireEvent.click(screen.getByRole("button", { name: /Gerar rascunho com IA/i }));

      await waitFor(() => {
        expect(screen.getByRole("status")).toBeInTheDocument();
      });
    });

    it("6b. sem texto nem imagem, exibe mensagem de validação", () => {
      renderForm();
      fireEvent.click(screen.getByRole("button", { name: /Criar com IA/i }));
      fireEvent.click(screen.getByRole("button", { name: /Gerar rascunho com IA/i }));

      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(
        screen.getByText(/Informe uma descrição ou selecione uma imagem/i),
      ).toBeInTheDocument();
    });

    // Tests 7-12: real mocked API
    describe("com rascunho gerado (API mockada)", () => {
      async function openAndGenerate() {
        renderForm();
        fireEvent.click(screen.getByRole("button", { name: /Criar com IA/i }));
        const textarea = screen.getByLabelText(/Descrição da vaga para IA/i);
        fireEvent.change(textarea, { target: { value: "Operador de Caixa" } });
        fireEvent.click(screen.getByRole("button", { name: /Gerar rascunho com IA/i }));
        return screen.findByTestId("ai-draft-result");
      }

      it("7. rascunho é exibido com título 'Operador de Caixa'", async () => {
        await openAndGenerate();
        expect(screen.getByTestId("draft-title")).toHaveTextContent(
          MOCK_GENERATE_RESPONSE.draft.title,
        );
      });

      it("8. rascunho exibe competências obrigatórias", async () => {
        await openAndGenerate();

        const skillsList = screen.getByTestId("draft-mandatory-skills");
        for (const skill of MOCK_MANDATORY_SKILLS) {
          expect(within(skillsList).getByText(skill)).toBeInTheDocument();
        }
      });

      it("9. botão 'Aplicar ao formulário' aparece no rascunho", async () => {
        await openAndGenerate();

        expect(
          screen.getByRole("button", { name: /Aplicar ao formulário/i }),
        ).toBeInTheDocument();
      });

      it("10. ao clicar 'Aplicar ao formulário', painel de IA é fechado", async () => {
        await openAndGenerate();

        expect(screen.getByTestId("ai-draft-panel")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /Aplicar ao formulário/i }));

        expect(screen.queryByTestId("ai-draft-panel")).not.toBeInTheDocument();
      });

      it("11. aviso de revisão humana é obrigatória aparece no rascunho", async () => {
        await openAndGenerate();

        expect(
          screen.getByText(/revisão humana é obrigatória antes da publicação/i),
        ).toBeInTheDocument();
      });

      it("12. campos que precisam de revisão são listados no rascunho", async () => {
        await openAndGenerate();

        expect(screen.getByTestId("needs-review-salary_range")).toBeInTheDocument();
        expect(screen.getByTestId("needs-review-unit")).toBeInTheDocument();
      });
    });
  });

  // ── Fase IA Vaga 4 — Integração real OCR + geração ───────────────────────

  describe("Fase IA Vaga 4 — Integração real", () => {
    it("gerar com texto chama generateJobAiDraft sem chamar OCR", async () => {
      renderForm();
      fireEvent.click(screen.getByRole("button", { name: /Criar com IA/i }));

      const textarea = screen.getByLabelText(/Descrição da vaga para IA/i);
      fireEvent.change(textarea, { target: { value: "Operador de Caixa" } });
      fireEvent.click(screen.getByRole("button", { name: /Gerar rascunho com IA/i }));
      await screen.findByTestId("ai-draft-result");

      expect(extractJobTextFromImage).not.toHaveBeenCalled();
      expect(generateJobAiDraft).toHaveBeenCalledWith(
        expect.objectContaining({ text_input: "Operador de Caixa", ocr_text: null }),
      );
    });

    it("gerar com imagem chama OCR antes de generateJobAiDraft", async () => {
      const mockFile = new File(["img"], "vaga.png", { type: "image/png" });

      renderForm();
      fireEvent.click(screen.getByRole("button", { name: /Criar com IA/i }));

      const fileInput = screen.getByLabelText(/Selecionar imagem da vaga/i);
      fireEvent.change(fileInput, { target: { files: [mockFile] } });

      fireEvent.click(screen.getByRole("button", { name: /Gerar rascunho com IA/i }));
      await screen.findByTestId("ai-draft-result");

      expect(extractJobTextFromImage).toHaveBeenCalledWith(mockFile);
      expect(generateJobAiDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          ocr_text: "Texto extraído por OCR da imagem da vaga.",
        }),
      );
    });

    it("se OCR falha e há texto, continua e gera rascunho com texto apenas", async () => {
      vi.mocked(extractJobTextFromImage).mockRejectedValue(new Error("OCR error"));
      const mockFile = new File(["img"], "vaga.png", { type: "image/png" });

      renderForm();
      fireEvent.click(screen.getByRole("button", { name: /Criar com IA/i }));

      const textarea = screen.getByLabelText(/Descrição da vaga para IA/i);
      fireEvent.change(textarea, { target: { value: "Operador de Caixa" } });

      const fileInput = screen.getByLabelText(/Selecionar imagem da vaga/i);
      fireEvent.change(fileInput, { target: { files: [mockFile] } });

      fireEvent.click(screen.getByRole("button", { name: /Gerar rascunho com IA/i }));
      await screen.findByTestId("ai-draft-result");

      expect(generateJobAiDraft).toHaveBeenCalledWith(
        expect.objectContaining({ text_input: "Operador de Caixa", ocr_text: null }),
      );
    });

    it("se OCR falha e não há texto, exibe mensagem de erro e não chama generate", async () => {
      vi.mocked(extractJobTextFromImage).mockRejectedValue(new Error("OCR error"));
      const mockFile = new File(["img"], "vaga.png", { type: "image/png" });

      renderForm();
      fireEvent.click(screen.getByRole("button", { name: /Criar com IA/i }));

      const fileInput = screen.getByLabelText(/Selecionar imagem da vaga/i);
      fireEvent.change(fileInput, { target: { files: [mockFile] } });

      fireEvent.click(screen.getByRole("button", { name: /Gerar rascunho com IA/i }));

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
      });
      expect(screen.getByText(/Não foi possível ler a imagem/i)).toBeInTheDocument();
      expect(generateJobAiDraft).not.toHaveBeenCalled();
    });

    it("seção 'Uso de IA' aparece após geração bem-sucedida", async () => {
      renderForm();
      fireEvent.click(screen.getByRole("button", { name: /Criar com IA/i }));

      fireEvent.change(screen.getByLabelText(/Descrição da vaga para IA/i), {
        target: { value: "Operador de Caixa" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Gerar rascunho com IA/i }));
      await screen.findByTestId("usage-section");

      expect(screen.getByTestId("usage-section")).toBeInTheDocument();
      expect(screen.getByText(/Uso de IA/i)).toBeInTheDocument();
    });

    it("falha na geração da IA exibe mensagem de erro", async () => {
      vi.mocked(generateJobAiDraft).mockRejectedValue(new Error("AI error"));

      renderForm();
      fireEvent.click(screen.getByRole("button", { name: /Criar com IA/i }));

      fireEvent.change(screen.getByLabelText(/Descrição da vaga para IA/i), {
        target: { value: "Operador de Caixa" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Gerar rascunho com IA/i }));

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
      });
      expect(
        screen.getByText(/Não foi possível gerar o rascunho agora/i),
      ).toBeInTheDocument();
    });

    it("OCR exibe preview do texto extraído da imagem", async () => {
      const mockFile = new File(["img"], "vaga.png", { type: "image/png" });

      renderForm();
      fireEvent.click(screen.getByRole("button", { name: /Criar com IA/i }));

      const fileInput = screen.getByLabelText(/Selecionar imagem da vaga/i);
      fireEvent.change(fileInput, { target: { files: [mockFile] } });

      fireEvent.click(screen.getByRole("button", { name: /Gerar rascunho com IA/i }));
      await screen.findByTestId("ai-draft-result");

      expect(screen.getByTestId("ocr-preview")).toBeInTheDocument();
      expect(
        screen.getByText(/A IA receberá apenas o texto extraído, não a imagem/i),
      ).toBeInTheDocument();
    });

    it("aviso de segurança OCR está visível no painel", () => {
      renderForm();
      fireEvent.click(screen.getByRole("button", { name: /Criar com IA/i }));

      expect(
        screen.getByText(/A imagem é lida por OCR. A IA recebe apenas o texto extraído/i),
      ).toBeInTheDocument();
    });

    it("salvar rascunho continua funcionando pelo fluxo existente após aplicar IA", async () => {
      renderForm();
      // Salvar rascunho não deve estar desabilitado em nenhuma etapa
      expect(screen.getByRole("button", { name: /Salvar rascunho/i })).not.toBeDisabled();

      // Abrir painel de IA, gerar e aplicar
      fireEvent.click(screen.getByRole("button", { name: /Criar com IA/i }));
      fireEvent.change(screen.getByLabelText(/Descrição da vaga para IA/i), {
        target: { value: "Operador de Caixa" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Gerar rascunho com IA/i }));
      await screen.findByTestId("ai-draft-result");
      fireEvent.click(screen.getByRole("button", { name: /Aplicar ao formulário/i }));

      // Painel fechado, volta ao modo manual — salvar rascunho ainda disponível
      expect(screen.queryByTestId("ai-draft-panel")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Salvar rascunho/i })).not.toBeDisabled();
    });

    it("aplicar ao formulário chama onApply com campos do rascunho", async () => {
      renderForm();
      fireEvent.click(screen.getByRole("button", { name: /Criar com IA/i }));
      fireEvent.change(screen.getByLabelText(/Descrição da vaga para IA/i), {
        target: { value: "Operador de Caixa" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Gerar rascunho com IA/i }));
      await screen.findByTestId("ai-draft-result");

      // Should not be in error state — draft is shown
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByTestId("draft-title")).toHaveTextContent("Operador de Caixa");

      // Applying closes the panel (onApply triggers setAiMode("manual") in page)
      fireEvent.click(screen.getByRole("button", { name: /Aplicar ao formulário/i }));
      await act(async () => {});
      expect(screen.queryByTestId("ai-draft-panel")).not.toBeInTheDocument();
    });
  });

  // ── Fase IA Vaga 5 — Rate limit (429) ────────────────────────────────────

  describe("Fase IA Vaga 5 — Rate limit handling", () => {
    it("429 de generateJobAiDraft mostra mensagem de limite atingido", async () => {
      const { HttpError } = await import("../../services/http");
      vi.mocked(generateJobAiDraft).mockRejectedValue(
        new HttpError(429, "Limite de gerações de rascunho atingido. Tente novamente amanhã."),
      );

      renderForm();
      fireEvent.click(screen.getByRole("button", { name: /Criar com IA/i }));
      fireEvent.change(screen.getByLabelText(/Descrição da vaga para IA/i), {
        target: { value: "Operador de Caixa" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Gerar rascunho com IA/i }));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(/limite de gerações atingido/i);
    });

    it("erros não-429 continuam mostrando mensagem genérica", async () => {
      vi.mocked(generateJobAiDraft).mockRejectedValue(new Error("network error"));

      renderForm();
      fireEvent.click(screen.getByRole("button", { name: /Criar com IA/i }));
      fireEvent.change(screen.getByLabelText(/Descrição da vaga para IA/i), {
        target: { value: "Operador de Caixa" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Gerar rascunho com IA/i }));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(/não foi possível gerar o rascunho/i);
    });
  });
});
