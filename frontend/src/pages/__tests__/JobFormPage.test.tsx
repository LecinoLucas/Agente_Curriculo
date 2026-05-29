import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { EMPTY_FORM, SELECTION_FLOW_DEFAULTS } from "../../features/jobs/jobFormConfig";
import { buildFrontendPublicationBlockers } from "../../features/jobs/utils/jobFormHelpers";
import { STEPS, MACRO_STEPS, JobFormPage } from "../JobFormPage";

// ─── Mocks for rendering tests ────────────────────────────────────────────────

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

// Mock sub-step sections (each has its own tests; here we just verify page structure)
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
    <div>{label}: {value}</div>
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
      // Not on review yet
      expect(
        screen.queryByRole("button", { name: /^Publicar$/i }),
      ).not.toBeInTheDocument();

      // Navigate to review (3 clicks)
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
      // Navigate to review (3 Próxima clicks)
      fireEvent.click(screen.getByRole("button", { name: /Próxima etapa/i }));
      fireEvent.click(screen.getByRole("button", { name: /Próxima etapa/i }));
      fireEvent.click(screen.getByRole("button", { name: /Próxima etapa/i }));

      expect(screen.getByTestId("step-review")).toBeInTheDocument();
      // Inline quality section header exists
      expect(screen.getByText(/Painel de qualidade/i)).toBeInTheDocument();
    });

    it("salvar rascunho está disponível em todas as etapas", () => {
      renderForm();
      expect(screen.getByRole("button", { name: /Salvar rascunho/i })).not.toBeDisabled();
    });

    it("publicar continua bloqueado no frontend quando qualidade/regras não permitem", () => {
      renderForm();
      // Navigate to review
      fireEvent.click(screen.getByRole("button", { name: /Próxima etapa/i }));
      fireEvent.click(screen.getByRole("button", { name: /Próxima etapa/i }));
      fireEvent.click(screen.getByRole("button", { name: /Próxima etapa/i }));

      // Bloqueios ativos (frontendBlockers mock returns 2 blockers)
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
      // Contexto da vaga — first step
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
});
