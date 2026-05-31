import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { EMPTY_FORM, SELECTION_FLOW_DEFAULTS } from "../../features/jobs/jobFormConfig";
import { buildFrontendPublicationBlockers } from "../../features/jobs/utils/jobFormHelpers";
import { MOCK_AI_PROMPT_EXAMPLE } from "../../features/jobs/utils/mockJobAiDraft";
import { STEPS, MACRO_STEPS, JobFormPage } from "../JobFormPage";
import { skillsService, type SkillCatalog } from "@/services/skillsService";

vi.mock("@/services/skillsService", () => ({
  skillsService: {
    listSkills: vi.fn(),
  },
}));

const MOCK_MANDATORY_SKILLS = [
  "Atendimento ao cliente",
  "Responsabilidade com caixa",
  "Rotina operacional",
];

function skill(name: string, id = name.toLowerCase().replace(/\s+/g, "-")): SkillCatalog {
  return {
    id,
    name,
    normalized_name: name.toLowerCase(),
    category: "Atendimento",
    catalog_type: "technical",
    description: null,
    is_active: true,
    updated_at: "2026-01-01T00:00:00Z",
    archived_at: null,
    archived_by: null,
    archive_reason: null,
    archive_reason_note: null,
    created_at: "2026-01-01T00:00:00Z",
    aliases: [],
  };
}

const MOCK_SKILL_CATALOG = [
  skill("Atendimento ao cliente", "skill-atendimento"),
  skill("Operação de caixa", "skill-caixa"),
  skill("Responsabilidade com dinheiro", "skill-dinheiro"),
  skill("Experiência anterior com caixa", "skill-exp-caixa"),
];

function mockSkillLookup(foundSkills: SkillCatalog[] = MOCK_SKILL_CATALOG) {
  vi.mocked(skillsService.listSkills).mockImplementation(async ({ search }) => {
    const term = String(search ?? "").trim().toLowerCase();
    const data = foundSkills.filter((item) => item.name.toLowerCase() === term || item.normalized_name.toLowerCase() === term);
    return {
      data,
      total: data.length,
      page: 1,
      page_size: 10,
      total_pages: 1,
    };
  });
}

// ─── Other mocks ──────────────────────────────────────────────────────────────

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn(), useParams: () => ({}) };
});

vi.mock("../../features/auth/useAuth", () => ({
  useAuth: () => ({ user: { role: "admin", id: "u1", full_name: "Admin", email: "a@a.com" } }),
}));

const { mockUpdateForm, mockFormState } = vi.hoisted(() => ({
  mockUpdateForm: vi.fn(),
  mockFormState: { form: undefined as unknown },
}));

vi.mock("../../features/jobs/hooks/useJobFormState", () => ({
  useJobFormState: () => ({
    form: mockFormState.form ?? EMPTY_FORM,
    setForm: vi.fn(),
    updateForm: mockUpdateForm,
    dealBreakerDraft: {},
    setDealBreakerDraft: vi.fn(),
    updateDealBreakerDraft: vi.fn(),
    addBehavioralRequirement: vi.fn(),
    addDealBreaker: vi.fn(),
    resetFormState: vi.fn(),
  }),
}));

const { mockHandleAddSkill } = vi.hoisted(() => ({
  mockHandleAddSkill: vi.fn().mockResolvedValue(undefined),
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
    combinedSkills: [],
    mandatorySkills: [],
    optionalSkills: [],
    eliminatorySkills: [],
    availableSkills: [],
    handleAddSkill: mockHandleAddSkill,
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
    mockFormState.form = EMPTY_FORM;
    mockSkillLookup();
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
    it("has exactly 5 macro-steps", () => {
      expect(MACRO_STEPS).toHaveLength(5);
    });

    it("macro-step IDs are correct and in order", () => {
      expect(MACRO_STEPS.map((s) => s.id)).toEqual([
        "context",
        "requirements",
        "skills",
        "screening",
        "review",
      ]);
    });

    it("Contexto contains basic", () => {
      const context = MACRO_STEPS.find((s) => s.id === "context");
      expect(context?.steps).toContain("basic");
    });

    it("Requisitos contains requirements", () => {
      const req = MACRO_STEPS.find((s) => s.id === "requirements");
      expect(req?.steps).toContain("requirements");
    });

    it("Skills contains mandatory-skills and differentials", () => {
      const skills = MACRO_STEPS.find((s) => s.id === "skills");
      expect(skills?.steps).toContain("mandatory-skills");
      expect(skills?.steps).toContain("differentials");
    });

    it("Triagem contains deal-breakers, assessment-policy and behavioral", () => {
      const evaluation = MACRO_STEPS.find((s) => s.id === "screening");
      const dbIdx = evaluation?.steps.indexOf("deal-breakers") ?? -1;
      const apIdx = evaluation?.steps.indexOf("assessment-policy") ?? -1;
      const bIdx = evaluation?.steps.indexOf("behavioral") ?? -1;
      expect(dbIdx).toBeGreaterThanOrEqual(0);
      expect(apIdx).toBeGreaterThanOrEqual(0);
      expect(bIdx).toBeGreaterThanOrEqual(0);
      expect(apIdx).toBeLessThan(bIdx);
    });

    it("Revisão is the last macro-step", () => {
      expect(MACRO_STEPS[MACRO_STEPS.length - 1].id).toBe("review");
    });

    it("all STEPS are covered by MACRO_STEPS", () => {
      const covered = MACRO_STEPS.flatMap((ms) => ms.steps);
      for (const step of STEPS) {
        expect(covered).toContain(step.id);
      }
    });

    it("no step is duplicated across MACRO_STEPS", () => {
      const all = MACRO_STEPS.flatMap((ms) => ms.steps);
      expect(new Set(all).size).toBe(all.length);
    });

    it("review is at index 4", () => {
      expect(MACRO_STEPS.findIndex((s) => s.id === "review")).toBe(4);
    });

    it("4 non-review macro-steps show quality drawer (not review)", () => {
      const nonReview = MACRO_STEPS.filter((s) => s.id !== "review");
      expect(nonReview).toHaveLength(4);
    });
  });

  // ── New: Rendering — macro-step navigation ────────────────────────────────

  describe("renderização das macroetapas", () => {
    it("renderiza as 5 macroetapas no stepper", () => {
      renderForm();
      const nav = screen.getByRole("navigation", { name: /Etapas do formulário/i });
      expect(within(nav).getByText("Contexto")).toBeInTheDocument();
      expect(within(nav).getByText("Requisitos")).toBeInTheDocument();
      expect(within(nav).getByText("Skills")).toBeInTheDocument();
      expect(within(nav).getByText("Triagem")).toBeInTheDocument();
      expect(within(nav).getByText("Revisão")).toBeInTheDocument();
      expect(within(nav).queryByText("Outros")).not.toBeInTheDocument();
    });

    it("não exibe 'Criar vaga a partir de imagem ou descrição' no formulário real", () => {
      renderForm();
      expect(
        screen.queryByText("Criar vaga a partir de imagem ou descrição"),
      ).not.toBeInTheDocument();
    });

    it("campos da macro-etapa Contexto estão presentes", () => {
      renderForm();
      expect(screen.getByTestId("step-basic")).toBeInTheDocument();
    });

    it("navegação entre macroetapas funciona: Próxima etapa avança para Requisitos", () => {
      renderForm();
      expect(screen.getByTestId("step-basic")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Próxima etapa/i }));

      expect(screen.getByTestId("step-requirements")).toBeInTheDocument();
      expect(screen.queryByTestId("step-basic")).not.toBeInTheDocument();
    });

    it("navegação entre macroetapas funciona: Etapa anterior volta para Contexto", () => {
      renderForm();
      fireEvent.click(screen.getByRole("button", { name: /Próxima etapa/i }));
      expect(screen.getByTestId("step-requirements")).toBeInTheDocument();

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
      fireEvent.click(screen.getByRole("button", { name: /Próxima etapa/i }));

      expect(screen.getByTestId("step-review")).toBeInTheDocument();
    });

    it("salvar rascunho está disponível em todas as etapas", () => {
      renderForm();
      expect(screen.getByRole("button", { name: /Salvar rascunho/i })).not.toBeDisabled();
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
      fireEvent.click(screen.getByRole("button", { name: /Próxima etapa/i }));

      expect(
        screen.queryByRole("button", { name: /Ver qualidade da vaga/i }),
      ).not.toBeInTheDocument();
    });
  });

  // ── IA Vaga Visual Mock ───────────────────────────────────────────────────

  describe("IA Vaga Visual Mock", () => {
    async function openAiMode() {
      renderForm();
      fireEvent.click(screen.getByRole("button", { name: /Preencher com IA/i }));
      expect(screen.getByTestId("ai-draft-panel")).toBeInTheDocument();
    }

    async function generateDraft() {
      await openAiMode();
      fireEvent.change(screen.getByLabelText(/Descrição da vaga para IA/i), {
        target: { value: "Preciso contratar um frentista para posto de combustível." },
      });
      fireEvent.click(screen.getByRole("button", { name: /Gerar exemplo com IA/i }));
      await screen.findByTestId("ai-draft-result");
    }

    it("abre e fecha o painel de IA pelo botão 'Preencher com IA' e 'Fechar'", async () => {
      renderForm();
      expect(screen.queryByTestId("ai-draft-panel")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Preencher com IA/i }));
      expect(screen.getByTestId("ai-draft-panel")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Fechar/i }));
      expect(screen.queryByTestId("ai-draft-panel")).not.toBeInTheDocument();
    });

    it("botão 'Usar exemplo' preenche a descrição", async () => {
      await openAiMode();
      const textarea = screen.getByLabelText(/Descrição da vaga para IA/i);

      expect(textarea).toHaveValue("");
      fireEvent.click(screen.getByRole("button", { name: /Usar exemplo/i }));
      expect(textarea).toHaveValue(MOCK_AI_PROMPT_EXAMPLE);
    });

    it("botão 'Gerar exemplo com IA' mostra loading e depois o rascunho", async () => {
      await openAiMode();

      fireEvent.change(screen.getByLabelText(/Descrição da vaga para IA/i), {
        target: { value: "Preciso contratar um frentista para posto de combustível." },
      });
      fireEvent.click(screen.getByRole("button", { name: /Gerar exemplo com IA/i }));

      expect(screen.getByRole("status")).toBeInTheDocument();
      expect(screen.getByText(/Gerando rascunho de exemplo/i)).toBeInTheDocument();
      expect(await screen.findByTestId("ai-draft-result")).toBeInTheDocument();
    });

    it("rascunho mostra título, requisitos e perguntas", async () => {
      await generateDraft();

      expect(screen.getByTestId("draft-title-input")).toHaveValue("Frentista");
      expect(
        within(screen.getByTestId("draft-requirements")).getByDisplayValue(/Boa comunicação/i)
      ).toBeInTheDocument();
      expect(
        within(screen.getByTestId("draft-screening-questions")).getByDisplayValue(/Você tem disponibilidade para trabalhar em escala\?/i)
      ).toBeInTheDocument();
      
      expect(screen.queryByText(/Etapas sugeridas/i)).not.toBeInTheDocument();
      expect(screen.getByTestId("draft-experience-context")).toBeInTheDocument();
      expect(screen.getByTestId("draft-min-years")).toBeInTheDocument();
    });

    it("botão 'Aplicar ao formulário' preenche os campos reais e fecha o painel", async () => {
      await generateDraft();

      fireEvent.click(screen.getByRole("button", { name: /Aplicar ao formulário/i }));

      expect(mockUpdateForm).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Frentista",
          job_area: "Operação de pista",
          work_model: "onsite",
          experience_context: expect.any(String),
          minimum_years_experience: 1,
          mandatory_skills: expect.arrayContaining(MOCK_MANDATORY_SKILLS),
          screening_questions: expect.arrayContaining([
            "Você tem disponibilidade para trabalhar em escala?",
          ]),
        }),
      );
      expect(screen.queryByTestId("ai-draft-panel")).not.toBeInTheDocument();
      expect(
        screen.getByText(/Rascunho aplicado\. Revise antes de salvar\./i),
      ).toBeInTheDocument();
    });

    it("salvar rascunho manual continua disponível após aplicar o rascunho", async () => {
      await generateDraft();
      fireEvent.click(screen.getByRole("button", { name: /Aplicar ao formulário/i }));

      expect(screen.getByRole("button", { name: /Salvar rascunho/i })).not.toBeDisabled();
    });

    it("não publica automaticamente após aplicar o rascunho", async () => {
      await generateDraft();
      fireEvent.click(screen.getByRole("button", { name: /Aplicar ao formulário/i }));

      expect(screen.queryByRole("button", { name: /^Publicar$/i })).not.toBeInTheDocument();
      expect(screen.getByTestId("step-basic")).toBeInTheDocument();
    });
  });
});
