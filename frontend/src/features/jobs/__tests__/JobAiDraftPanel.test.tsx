/**
 * JobAiDraftPanel tests
 *
 * Organisation:
 * 1. draftToFormUpdates — legacy mock helper (preserved for backward-compat)
 * 2. applyApiDraftToForm — new real API helper
 * 3. JobAiDraftPanel — component with real API (mocked via vi.mock)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { skillsService, type SkillCatalog } from "@/services/skillsService";

import { JobAiDraftPanel, draftToFormUpdates } from "../components/JobAiDraftPanel";
import { MOCK_JOB_AI_DRAFT } from "../utils/mockJobAiDraft";
import { applyApiDraftToForm } from "../utils/jobAiDraftHelpers";
import {
  extractSkillSuggestionsFromDraft,
  getSuggestedSkillAliases,
  getSuggestedSkillCategory,
  skillNamesAreEquivalent,
} from "../utils/jobAiSkillSuggestions";
import type { JobAiDraftGenerateResponse } from "../services/jobAiDraftService";

// ── Mock the real API service ────────────────────────────────────────────────

vi.mock("../services/jobAiDraftService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/jobAiDraftService")>();
  return {
    ...actual,
    generateJobAiDraft: vi.fn(),
    generateJobAiDraftFromImage: vi.fn(),
  };
});

vi.mock("@/services/skillsService", () => ({
  skillsService: {
    listSkills: vi.fn(),
  },
}));

import { generateJobAiDraft, generateJobAiDraftFromImage } from "../services/jobAiDraftService";

const mockGenerateJobAiDraft = generateJobAiDraft as ReturnType<typeof vi.fn>;
const mockGenerateJobAiDraftFromImage = generateJobAiDraftFromImage as ReturnType<typeof vi.fn>;
const mockListSkills = vi.mocked(skillsService.listSkills);

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
  skill("Suporte Protheus", "skill-protheus"),
  skill("Atendimento ERP", "skill-atendimento-erp"),
  skill("Atendimento ao cliente", "skill-atendimento"),
];

/** Minimal valid API response matching the real backend shape. */
const MOCK_API_RESPONSE: JobAiDraftGenerateResponse = {
  draft: {
    title: "Operador de Caixa",
    area: "Atendimento",
    seniority: "junior",
    work_model: "onsite",
    unit: "São Paulo, SP",
    salary_min: null,
    salary_max: null,
    minimum_education_level: "high_school",
    minimum_years_experience: 2,
    experience_context: "experiência com atendimento ao cliente",
    description: "Vaga para operador de caixa em loja de varejo.",
    responsibilities: ["Operar caixa registradora", "Atender clientes"],
    requirements: ["Ensino médio completo"],
    mandatory_skills: ["Atendimento ao cliente", "Responsabilidade com caixa"],
    nice_to_have_skills: ["Experiência em varejo"],
    benefits: ["Vale-transporte"],
    working_hours: "6x1",
    screening_questions: ["Tem disponibilidade para turno integral?"],
    pipeline_steps: ["Triagem", "Entrevista RH"],
    matching_criteria: ["Atendimento ao cliente"],
    suggested_skills: [
      {
        name: "Atendimento ao cliente",
        category: "behavioral",
        aliases: ["Atendimento ao público", "Customer service"],
        description: "Contato direto com clientes no ponto de venda.",
        importance: "essential",
        source: "ai_suggested",
        catalog_status: "existing",
        catalog_skill_id: "skill-atendimento",
        catalog_skill_name: "Atendimento ao cliente",
        catalog_matched_by: ["Atendimento ao cliente"],
        catalog_conflicts: [],
      },
      {
        name: "Suporte Protheus",
        category: "tool",
        aliases: ["TOTVS Protheus", "ERP Protheus", "Suporte TOTVS"],
        description: "Atendimento e suporte a rotinas no ERP Protheus.",
        importance: "differential",
        source: "ai_suggested",
        catalog_status: "new",
        catalog_skill_id: null,
        catalog_skill_name: null,
        catalog_matched_by: [],
        catalog_conflicts: [],
      },
      {
        name: "Suporte ERP",
        category: "business_process",
        aliases: ["Suporte de sistema", "Suporte TOTVS"],
        description: null,
        importance: "competency",
        source: "ai_suggested",
        catalog_status: "conflict",
        catalog_skill_id: null,
        catalog_skill_name: null,
        catalog_matched_by: ["Suporte TOTVS"],
        catalog_conflicts: ["Suporte Protheus", "Atendimento ERP"],
      },
    ],
    selection_flow_type: null,
    requires_manager_review: true,
    requires_behavioral_assessment: false,
  },
  needs_review: ["salary_range"],
  warnings: [],
  safety_check: null,
  source: { text_used: true, ocr_used: false, input_character_count: 42 },
  usage: {
    provider: "anthropic",
    model: "claude-sonnet-test",
    input_tokens: 150,
    output_tokens: 80,
    total_tokens: 230,
    estimated_cost: null,
  },
};

// ── 1. Legacy draftToFormUpdates (backward-compat) ───────────────────────────

describe("draftToFormUpdates (legado — backward-compat)", () => {
  it("mapeia os campos principais do rascunho para o formulário", () => {
    const result = draftToFormUpdates(MOCK_JOB_AI_DRAFT);

    expect(result).toEqual(
      expect.objectContaining({
        title: "Frentista",
        description: MOCK_JOB_AI_DRAFT.description,
        job_area: "Operação de pista",
        work_model: "onsite",
        location: "Unidade a definir",
        experience_context: MOCK_JOB_AI_DRAFT.experience_context,
        minimum_years_experience: MOCK_JOB_AI_DRAFT.minimum_years_experience,
        requires_manager_review: true,
        requires_behavioral_assessment: false,
      }),
    );
  });

  it("serializa responsabilidades e requisitos em texto de múltiplas linhas", () => {
    const result = draftToFormUpdates(MOCK_JOB_AI_DRAFT);

    expect(result.responsibilities).toContain("\n");
    expect(result.requirements).toContain("Boa comunicação");
  });

  it("preenche os campos dedicados de skills e triagem", () => {
    const result = draftToFormUpdates(MOCK_JOB_AI_DRAFT);

    expect(result.mandatory_skills).toEqual(
      expect.arrayContaining(["Atendimento ao cliente", "Responsabilidade com caixa"]),
    );
    expect(result.nice_to_have_skills).toEqual(
      expect.arrayContaining(["Experiência em posto de combustível"]),
    );
    expect(result.screening_questions).toEqual(
      expect.arrayContaining(["Você tem disponibilidade para trabalhar em escala?"]),
    );
  });

  it("não mistura o rascunho em campos manuais não relacionados", () => {
    const result = draftToFormUpdates(MOCK_JOB_AI_DRAFT);

    expect(result.behavioral_requirements).toBeUndefined();
    expect((result as any).pipeline_steps).toBeUndefined();
  });
});

// ── 2. applyApiDraftToForm — real API helper ──────────────────────────────────

describe("applyApiDraftToForm", () => {
  it("mapeia title, description, area, seniority, work_model", () => {
    const result = applyApiDraftToForm(MOCK_API_RESPONSE.draft);

    expect(result.title).toBe("Operador de Caixa");
    expect(result.description).toBe("Vaga para operador de caixa em loja de varejo.");
    expect(result.job_area).toBe("Atendimento");
    expect(result.seniority_level).toBe("junior");
    expect(result.work_model).toBe("onsite");
  });

  it("mapeia unit → location", () => {
    const result = applyApiDraftToForm(MOCK_API_RESPONSE.draft);
    expect(result.location).toBe("São Paulo, SP");
  });

  it("junta responsibilities[] com newline", () => {
    const result = applyApiDraftToForm(MOCK_API_RESPONSE.draft);
    expect(result.responsibilities).toContain("\n");
    expect(result.responsibilities).toContain("Operar caixa registradora");
    expect(result.responsibilities).toContain("Atender clientes");
  });

  it("junta requirements[] com newline", () => {
    const result = applyApiDraftToForm(MOCK_API_RESPONSE.draft);
    expect(result.requirements).toContain("Ensino médio completo");
  });

  it("preenche mandatory_skills, nice_to_have_skills, screening_questions, benefits", () => {
    const result = applyApiDraftToForm(MOCK_API_RESPONSE.draft);

    expect(result.mandatory_skills).toEqual(
      expect.arrayContaining(["Atendimento ao cliente", "Responsabilidade com caixa"]),
    );
    expect(result.nice_to_have_skills).toEqual(expect.arrayContaining(["Experiência em varejo"]));
    expect(result.screening_questions).toEqual(
      expect.arrayContaining(["Tem disponibilidade para turno integral?"]),
    );
    expect(result.benefits).toEqual(expect.arrayContaining(["Vale-transporte"]));
  });

  it("aplica experience_context", () => {
    const result = applyApiDraftToForm(MOCK_API_RESPONSE.draft);
    expect(result.experience_context).toBe("experiência com atendimento ao cliente");
  });

  it("aplica minimum_education_level", () => {
    const result = applyApiDraftToForm(MOCK_API_RESPONSE.draft);
    expect(result.minimum_education_level).toBe("high_school");
  });

  it("aplica minimum_years_experience", () => {
    const result = applyApiDraftToForm(MOCK_API_RESPONSE.draft);
    expect(result.minimum_years_experience).toBe(2);
  });

  it("não mapeia salary_min nem salary_max", () => {
    const result = applyApiDraftToForm(MOCK_API_RESPONSE.draft);
    expect(result.salary_min).toBeUndefined();
    expect(result.salary_max).toBeUndefined();
  });

  it("não mapeia pipeline_steps nem matching_criteria", () => {
    const result = applyApiDraftToForm(MOCK_API_RESPONSE.draft);
    expect((result as any).pipeline_steps).toBeUndefined();
    expect((result as any).matching_criteria).toBeUndefined();
  });

  it("omite campos ausentes (não sobrescreve formulário com undefined)", () => {
    const draftNoTitle = {
      ...MOCK_API_RESPONSE.draft,
      title: null,
      experience_context: null,
      minimum_education_level: null,
      minimum_years_experience: null,
      requires_manager_review: null,
      requires_behavioral_assessment: null,
      selection_flow_type: null,
    };
    const result = applyApiDraftToForm(draftNoTitle);
    expect(result.title).toBeUndefined();
    expect(result.experience_context).toBeUndefined();
    expect(result.minimum_education_level).toBeUndefined();
    expect(result.minimum_years_experience).toBeUndefined();
    expect(result.requires_manager_review).toBeUndefined();
    expect(result.requires_behavioral_assessment).toBeUndefined();
    expect(result.selection_flow_type).toBeUndefined();
  });

  it("omite strings vazias dos novos campos", () => {
    const draftWithEmptyStrings = {
      ...MOCK_API_RESPONSE.draft,
      experience_context: "   ",
      minimum_education_level: "",
    };
    const result = applyApiDraftToForm(draftWithEmptyStrings);
    expect(result.experience_context).toBeUndefined();
    expect(result.minimum_education_level).toBeUndefined();
  });

  it("mapeia requires_manager_review e requires_behavioral_assessment", () => {
    const result = applyApiDraftToForm(MOCK_API_RESPONSE.draft);
    expect(result.requires_manager_review).toBe(true);
    expect(result.requires_behavioral_assessment).toBe(false);
  });

  it("não aplica requires_manager_review quando ausente", () => {
    const result = applyApiDraftToForm({
      ...MOCK_API_RESPONSE.draft,
      requires_manager_review: null,
    });
    expect(result.requires_manager_review).toBeUndefined();
  });

  it("não sobrescreve booleans manuais com null", () => {
    const result = applyApiDraftToForm({
      ...MOCK_API_RESPONSE.draft,
      requires_manager_review: null,
      requires_behavioral_assessment: null,
    });
    expect(result.requires_manager_review).toBeUndefined();
    expect(result.requires_behavioral_assessment).toBeUndefined();
  });

  it("não aplica selection_flow_type vazio", () => {
    const result = applyApiDraftToForm({
      ...MOCK_API_RESPONSE.draft,
      selection_flow_type: "",
    });
    expect(result.selection_flow_type).toBeUndefined();
  });
});

describe("jobAiSkillSuggestions", () => {
  it("enriquece sugestões de skill com base em requirements, responsibilities e experience_context", () => {
    const suggestions = extractSkillSuggestionsFromDraft({
      ...MOCK_API_RESPONSE.draft,
      mandatory_skills: ["Excel", "Comunicação", "Organização"],
      nice_to_have_skills: [],
      requirements: [
        "Excel",
        "Boa comunicação",
        "Organização",
        "Atendimento interno",
        "Conferência de documentos",
        "Lançamentos",
        "Planilhas",
        "Organização de arquivos",
      ],
      responsibilities: [
        "Lançamentos",
        "Conferência de documentos",
        "Atendimento interno",
        "Planilhas",
        "Organização de arquivos",
      ],
      experience_context:
        "Rotinas com Atendimento interno, Conferência de documentos, Lançamentos, Planilhas, Organização de arquivos.",
    });

    expect(suggestions.mandatory).toEqual(
      expect.arrayContaining([
        "Excel",
        "Comunicação",
        "Organização",
        "Atendimento interno",
        "Conferência de documentos",
        "Planilhas",
      ]),
    );
    expect(suggestions.optional).toEqual(
      expect.arrayContaining([
        "Lançamentos administrativos",
        "Organização de arquivos",
        "Rotinas administrativas",
      ]),
    );
  });

  it("não sugere termos discriminatórios ou ruído operacional como skill", () => {
    const suggestions = extractSkillSuggestionsFromDraft({
      ...MOCK_API_RESPONSE.draft,
      mandatory_skills: [],
      nice_to_have_skills: [],
      requirements: [
        "Pessoa jovem",
        "Boa aparência",
        "Morar perto da empresa",
        "6x1",
        "44 horas semanais",
      ],
      responsibilities: [],
      experience_context: null,
    });

    expect(suggestions.mandatory).toEqual([]);
    expect(suggestions.optional).toEqual([]);
  });

  it("sugere aliases úteis para skill nova sem repetir o próprio nome", () => {
    expect(getSuggestedSkillAliases("Organização")).toContain("Organização administrativa");
    expect(getSuggestedSkillAliases("Organização")).not.toContain("Organização,");
    expect(getSuggestedSkillAliases("Excel")).toContain("Microsoft Excel");
  });

  it("sugere categoria compatível para skills comuns", () => {
    expect(getSuggestedSkillCategory("Excel")).toBe("tool");
    expect(getSuggestedSkillCategory("Comunicação")).toBe("behavioral");
    expect(getSuggestedSkillCategory("Conferência de documentos")).toBe("business_process");
  });

  it("reconhece equivalência entre nomes próximos", () => {
    expect(skillNamesAreEquivalent("Planilhas", "Planilha")).toBe(true);
    expect(skillNamesAreEquivalent("Excel", "Microsoft Excel")).toBe(true);
    expect(skillNamesAreEquivalent("Comunicação", "Boa comunicação")).toBe(true);
  });
});

// ── 3. JobAiDraftPanel — componente com API real (mockada) ────────────────────

describe("JobAiDraftPanel — API real", () => {
  beforeEach(() => {
    mockGenerateJobAiDraft.mockReset();
    mockGenerateJobAiDraftFromImage.mockReset();
    mockListSkills.mockReset();
    mockListSkills.mockImplementation(async ({ search }) => {
      const term = String(search ?? "").trim().toLowerCase();
      const data = MOCK_SKILL_CATALOG.filter(
        (item) => item.name.toLowerCase() === term || item.normalized_name === term,
      );
      return {
        data,
        total: data.length,
        page: 1,
        page_size: 10,
        total_pages: 1,
      };
    });
  });

  function renderPanel(
    formHasData = false,
    onApply = vi.fn(),
    currentFormSnapshot?: {
      salary_min?: number;
      salary_max?: number;
      benefits?: string[];
      working_hours?: string;
      work_model?: string;
      location?: string;
      requirements?: string;
      minimum_education_level?: string;
      minimum_years_experience?: number;
    },
    linkedSkills?: Array<{ skill_id: string; skill_name: string; priority_level: string }>,
  ) {
    render(
      <JobAiDraftPanel
        formHasData={formHasData}
        currentFormSnapshot={currentFormSnapshot}
        linkedSkills={linkedSkills as any}
        onApply={onApply}
      />,
    );
    return { onApply };
  }

  function fillAndSubmit(prompt = "Preciso de um operador de caixa.") {
    fireEvent.change(screen.getByLabelText(/Descrição da vaga para IA/i), {
      target: { value: prompt },
    });
    fireEvent.click(screen.getByRole("button", { name: /Gerar com IA/i }));
  }

  function switchToTab(name: RegExp) {
    const tab = screen.getByRole("tab", { name });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
  }

  async function generateAndWaitForDraft(
    formHasData = false,
    onApply = vi.fn(),
    currentFormSnapshot?: {
      salary_min?: number;
      salary_max?: number;
      benefits?: string[];
      working_hours?: string;
      work_model?: string;
      location?: string;
      requirements?: string;
      minimum_education_level?: string;
      minimum_years_experience?: number;
    },
    linkedSkills?: Array<{ skill_id: string; skill_name: string; priority_level: string }>,
  ) {
    mockGenerateJobAiDraft.mockResolvedValue(MOCK_API_RESPONSE);
    renderPanel(formHasData, onApply, currentFormSnapshot, linkedSkills);
    fillAndSubmit();
    await screen.findByTestId("ai-draft-result");
    return { onApply };
  }

  // ── Validação de input ────────────────────────────────────────────────────

  it("mostra erro quando tenta gerar sem descrição", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Gerar com IA/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/Informe uma descrição/i);
  });

  // ── Chamada real à API ────────────────────────────────────────────────────

  it("chama generateJobAiDraft com o prompt digitado", async () => {
    mockGenerateJobAiDraft.mockResolvedValue(MOCK_API_RESPONSE);
    renderPanel();
    fillAndSubmit("Operador de Caixa para loja.");

    await waitFor(() => expect(mockGenerateJobAiDraft).toHaveBeenCalledTimes(1));
    expect(mockGenerateJobAiDraft).toHaveBeenCalledWith(
      expect.objectContaining({ text_input: "Operador de Caixa para loja." }),
    );
  });

  it("NÃO usa generateMockJobDraft em produção", async () => {
    mockGenerateJobAiDraft.mockResolvedValue(MOCK_API_RESPONSE);
    renderPanel();
    fillAndSubmit();
    await screen.findByTestId("ai-draft-result");
    expect(mockGenerateJobAiDraft).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Usar exemplo/i })).toBeInTheDocument();
  });

  // ── Loading ───────────────────────────────────────────────────────────────

  it("mostra estado de loading durante a geração", async () => {
    // API que nunca resolve (para capturar loading)
    mockGenerateJobAiDraft.mockReturnValue(new Promise(() => {}));
    renderPanel();
    fillAndSubmit();

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Gerando rascunho.../i })).toBeDisabled();
  });

  // ── Preview ───────────────────────────────────────────────────────────────

  it("exibe preview do rascunho com dados reais da API", async () => {
    await generateAndWaitForDraft();

    expect(screen.getByTestId("draft-title-input")).toHaveValue("Operador de Caixa");
    expect(screen.getByLabelText(/Contexto de experiência/i)).toHaveValue(
      "experiência com atendimento ao cliente",
    );
    expect(screen.getByLabelText(/Escolaridade mínima/i)).toHaveValue("high_school");
    expect(screen.getByLabelText(/Anos mínimos de experiência/i)).toHaveValue(2);
    expect(screen.getByTestId("draft-responsibilities")).toBeInTheDocument();
    expect(screen.getByTestId("draft-mandatory-skills")).toBeInTheDocument();
  });

  it("exibe skills sugeridas com aliases e status de catálogo", async () => {
    await generateAndWaitForDraft();

    const block = screen.getByTestId("draft-suggested-skills");
    expect(block).toHaveTextContent(/Revisão de skills sugeridas/i);
    expect(block).toHaveTextContent(/A criação de novas skills no catálogo não é automática/i);
    expect(block).toHaveTextContent(/Atendimento ao cliente/i);
    expect(block).toHaveTextContent(/Atendimento ao público/i);
    expect(block).toHaveTextContent(/Existente no catálogo/i);
    expect(block).toHaveTextContent(/Pode ser usada com segurança no matching IA/i);
    expect(block).toHaveTextContent(/Suporte Protheus/i);
    expect(block).toHaveTextContent(/Nova sugestão/i);
    expect(block).toHaveTextContent(/Não será criada automaticamente no catálogo/i);
    expect(block).toHaveTextContent(/Suporte ERP/i);
    expect(block).toHaveTextContent(/Conflito — revisar/i);
    expect(block).toHaveTextContent(/Atendimento ERP/i);
    expect(screen.getByTestId("draft-suggested-skills-summary")).toHaveTextContent(
      /Existentes selecionadas/i,
    );
  });

  it("seleciona existing por padrão e deixa new/conflict desmarcadas de forma visual", async () => {
    await generateAndWaitForDraft();

    expect(
      screen.getByTestId("draft-suggested-skill-checkbox-existing-Atendimento ao cliente"),
    ).toBeChecked();
    expect(
      screen.getByTestId("draft-suggested-skill-checkbox-new-Suporte Protheus"),
    ).not.toBeChecked();
    expect(
      screen.getByTestId("draft-suggested-skill-checkbox-conflict-Suporte ERP"),
    ).not.toBeChecked();
    expect(screen.getByText(/Apenas sugestões `existing` selecionadas podem entrar como skills estruturadas/i)).toBeInTheDocument();
  });

  it("não quebra quando o draft não traz suggested_skills", async () => {
    mockGenerateJobAiDraft.mockResolvedValue({
      ...MOCK_API_RESPONSE,
      draft: {
        ...MOCK_API_RESPONSE.draft,
        suggested_skills: [],
      },
    });
    renderPanel();
    fillAndSubmit();

    await screen.findByTestId("ai-draft-result");
    expect(screen.queryByTestId("draft-suggested-skills")).not.toBeInTheDocument();
    expect(screen.getByTestId("ai-draft-apply-btn")).toBeInTheDocument();
  });

  it("exibe warnings novos de forma legível", async () => {
    mockGenerateJobAiDraft.mockResolvedValue({
      ...MOCK_API_RESPONSE,
      warnings: [
        "requires_manager_review_removed_no_source_evidence",
        "requires_behavioral_assessment_removed_no_source_evidence",
        "selection_flow_type_requires_manual_review",
      ],
    });
    renderPanel();
    fillAndSubmit();
    const warnings = await screen.findByTestId("ai-draft-warnings");
    expect(warnings).toHaveTextContent(/Revisão do gestor removida/i);
    expect(warnings).toHaveTextContent(/Avaliação comportamental removida/i);
    expect(warnings).toHaveTextContent(/Fluxo de seleção identificado/i);
  });

  it("exibe revisão de segurança necessária", async () => {
    mockGenerateJobAiDraft.mockResolvedValue({
      ...MOCK_API_RESPONSE,
      draft: {
        ...MOCK_API_RESPONSE.draft,
        title: null,
        description: null,
      },
      warnings: ["discriminatory_text_removed", "safety_check_requires_review"],
      safety_check: {
        status: "needs_review",
        highest_severity: "high",
        findings: [
          {
            field: "title",
            severity: "high",
            code: "discriminatory_age_requirement",
            message: "Critério de idade removido do texto.",
          },
        ],
      },
    });
    renderPanel();
    fillAndSubmit();

    const safety = await screen.findByTestId("ai-draft-safety-check");
    expect(safety).toHaveTextContent(/Revisão de segurança necessária/i);
    expect(safety).toHaveTextContent(/Severidade Alta/i);
    expect(safety).toHaveTextContent(/Título/i);
    expect(safety).toHaveTextContent(/Critério de idade removido do texto/i);
  });

  it("não mostra texto discriminatório removido no preview", async () => {
    mockGenerateJobAiDraft.mockResolvedValue({
      ...MOCK_API_RESPONSE,
      draft: {
        ...MOCK_API_RESPONSE.draft,
        description: null,
      },
      warnings: ["discriminatory_text_removed"],
      safety_check: {
        status: "needs_review",
        highest_severity: "high",
        findings: [
          {
            field: "description",
            severity: "high",
            code: "discriminatory_age_requirement",
            message: "Critério de idade removido do texto.",
          },
        ],
      },
    });
    renderPanel();
    fillAndSubmit();

    await screen.findByTestId("ai-draft-result");
    expect(screen.getByLabelText(/Resumo da vaga/i)).toHaveValue("");
    expect(screen.queryByText(/até 30 anos/i)).not.toBeInTheDocument();
  });

  it("exibe aviso de needs_review quando a API retorna campos ausentes", async () => {
    await generateAndWaitForDraft();
    // MOCK_API_RESPONSE has needs_review: ['salary_range']
    expect(screen.getByTestId("ai-draft-needs-review")).toBeInTheDocument();
    expect(screen.getByTestId("ai-draft-needs-review")).toHaveTextContent(
      /Faixa salarial não informada/i,
    );
  });

  // ── Aplicar rascunho ──────────────────────────────────────────────────────

  it("abre a modal de confirmação antes de aplicar o rascunho ao formulário", async () => {
    const { onApply } = await generateAndWaitForDraft(false);
    fireEvent.click(screen.getByTestId("ai-draft-apply-btn"));

    expect(screen.getByRole("dialog", { name: /Aplicar rascunho da IA\?/i })).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("aplica o rascunho real ao formulário após confirmação", async () => {
    const { onApply } = await generateAndWaitForDraft(false);
    fireEvent.click(screen.getByTestId("draft-suggested-skill-checkbox-new-Suporte Protheus"));
    fireEvent.click(screen.getByTestId("draft-suggested-skill-checkbox-conflict-Suporte ERP"));
    fireEvent.click(screen.getByTestId("ai-draft-apply-btn"));
    fireEvent.click(screen.getByRole("button", { name: /Aplicar rascunho/i }));

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Operador de Caixa",
        location: "São Paulo, SP",
        experience_context: "experiência com atendimento ao cliente",
        minimum_education_level: "high_school",
        minimum_years_experience: 2,
        mandatory_skills: expect.arrayContaining(["Atendimento ao cliente"]),
      }),
      expect.objectContaining({
        mandatory: expect.arrayContaining(["Atendimento ao cliente"]),
        optional: expect.arrayContaining(["Experiência em varejo"]),
      }),
      expect.arrayContaining([
        expect.objectContaining({
          skill_id: "skill-atendimento",
          name: "Atendimento ao cliente",
          priority: "priority",
        }),
      ]),
    );
  });

  it("não cria skill automaticamente nem resolve conflito ao aplicar", async () => {
    const { onApply } = await generateAndWaitForDraft(false);
    fireEvent.click(screen.getByTestId("ai-draft-apply-btn"));
    fireEvent.click(screen.getByRole("button", { name: /Aplicar rascunho/i }));

    expect(onApply).toHaveBeenCalledTimes(1);
    const [updates, skills] = onApply.mock.calls[0];
    expect(updates.mandatory_skills).toEqual(
      expect.arrayContaining(["Atendimento ao cliente", "Responsabilidade com caixa"]),
    );
    expect(skills.mandatory).not.toEqual(expect.arrayContaining(["Suporte Protheus", "Suporte ERP"]));
    expect(onApply.mock.calls[0][2]).toEqual([
      expect.objectContaining({ skill_id: "skill-atendimento", name: "Atendimento ao cliente" }),
    ]);
  });

  it("existing desmarcada não entra na aplicação estruturada", async () => {
    const { onApply } = await generateAndWaitForDraft(false);
    fireEvent.click(screen.getByTestId("draft-suggested-skill-checkbox-existing-Atendimento ao cliente"));
    fireEvent.click(screen.getByTestId("ai-draft-apply-btn"));
    fireEvent.click(screen.getByRole("button", { name: /Aplicar rascunho/i }));

    expect(onApply.mock.calls[0][2]).toEqual([]);
  });

  it("new selecionada mostra aviso de não criação automática", async () => {
    await generateAndWaitForDraft(false);
    fireEvent.click(screen.getByTestId("draft-suggested-skill-checkbox-new-Suporte Protheus"));

    expect(screen.getByText(/Nova sugestão selecionada\. A criação no catálogo exige etapa futura\./i)).toBeInTheDocument();
  });

  it("conflict selecionada mostra aviso de revisão manual", async () => {
    await generateAndWaitForDraft(false);
    fireEvent.click(screen.getByTestId("draft-suggested-skill-checkbox-conflict-Suporte ERP"));

    expect(screen.getByText(/Conflito não resolvido\. Escolha uma skill do catálogo para aplicar\./i)).toBeInTheDocument();
  });

  it("conflict mostra opções de catalog_conflicts", async () => {
    await generateAndWaitForDraft(false);

    expect(screen.getByText(/Escolha manualmente qual skill do catálogo representa esta sugestão\./i)).toBeInTheDocument();
    expect(screen.getByTestId("draft-suggested-skill-conflict-option-Suporte ERP-skill-protheus")).toBeInTheDocument();
    expect(screen.getByTestId("draft-suggested-skill-conflict-option-Suporte ERP-skill-atendimento-erp")).toBeInTheDocument();
  });

  it("escolher uma opção de conflict marca como resolvido", async () => {
    await generateAndWaitForDraft(false);
    fireEvent.click(screen.getByTestId("draft-suggested-skill-checkbox-conflict-Suporte ERP"));
    fireEvent.click(screen.getByTestId("draft-suggested-skill-conflict-option-Suporte ERP-skill-atendimento-erp"));

    expect(screen.getByText(/Conflito resolvido manualmente\. A skill escolhida poderá ser aplicada\./i)).toBeInTheDocument();
  });

  it("não duplica skill já existente no formulário", async () => {
    const { onApply } = await generateAndWaitForDraft(
      false,
      vi.fn(),
      undefined,
      [{ skill_id: "skill-atendimento", skill_name: "Atendimento ao cliente", priority_level: "priority" }],
    );
    fireEvent.click(screen.getByTestId("ai-draft-apply-btn"));

    expect(screen.getByText(/Skill já estava no formulário\./i)).toBeInTheDocument();
    expect(screen.getByText(/1 skill\(s\) já estavam no formulário e não serão duplicadas\./i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Aplicar rascunho/i }));
    expect(onApply.mock.calls[0][2]).toEqual([]);
  });

  it("conflict sem escolha não entra na aplicação", async () => {
    const { onApply } = await generateAndWaitForDraft(false);
    fireEvent.click(screen.getByTestId("draft-suggested-skill-checkbox-conflict-Suporte ERP"));
    fireEvent.click(screen.getByTestId("ai-draft-apply-btn"));
    fireEvent.click(screen.getByRole("button", { name: /Aplicar rascunho/i }));

    expect(onApply.mock.calls[0][2]).toEqual([
      expect.objectContaining({ skill_id: "skill-atendimento" }),
    ]);
    expect(onApply.mock.calls[0][2]).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Atendimento ERP" })]),
    );
  });

  it("confirmar aplica conflict resolvido como ApplicableSkill", async () => {
    const { onApply } = await generateAndWaitForDraft(false);
    fireEvent.click(screen.getByTestId("draft-suggested-skill-checkbox-conflict-Suporte ERP"));
    fireEvent.click(screen.getByTestId("draft-suggested-skill-conflict-option-Suporte ERP-skill-atendimento-erp"));
    fireEvent.click(screen.getByTestId("ai-draft-apply-btn"));
    fireEvent.click(screen.getByRole("button", { name: /Aplicar rascunho/i }));

    expect(onApply.mock.calls[0][2]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          skill_id: "skill-atendimento-erp",
          name: "Atendimento ERP",
          priority: "priority",
        }),
      ]),
    );
  });

  it("conflict desmarcado não aplica", async () => {
    const { onApply } = await generateAndWaitForDraft(false);
    fireEvent.click(screen.getByTestId("draft-suggested-skill-checkbox-conflict-Suporte ERP"));
    fireEvent.click(screen.getByTestId("draft-suggested-skill-conflict-option-Suporte ERP-skill-atendimento-erp"));
    fireEvent.click(screen.getByTestId("draft-suggested-skill-checkbox-conflict-Suporte ERP"));
    fireEvent.click(screen.getByTestId("ai-draft-apply-btn"));
    fireEvent.click(screen.getByRole("button", { name: /Aplicar rascunho/i }));

    expect(onApply.mock.calls[0][2]).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ skill_id: "skill-atendimento-erp" })]),
    );
  });

  it("não mapeia salary para o formulário", async () => {
    const { onApply } = await generateAndWaitForDraft(false);
    fireEvent.click(screen.getByTestId("ai-draft-apply-btn"));
    fireEvent.click(screen.getByRole("button", { name: /Aplicar rascunho/i }));

    const formUpdates = onApply.mock.calls[0][0];
    expect(formUpdates.salary_min).toBeUndefined();
    expect(formUpdates.salary_max).toBeUndefined();
  });

  // ── Confirmação de substituição ───────────────────────────────────────────

  it("mostra o título e o microcopy obrigatórios na modal", async () => {
    await generateAndWaitForDraft(false);
    fireEvent.click(screen.getByTestId("ai-draft-apply-btn"));

    expect(screen.getByText("Aplicar rascunho da IA?")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Campos com valor atual diferente serão substituídos apenas após sua confirmação\./i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Revise com atenção salário e benefícios antes de aplicar\./i)).toBeInTheDocument();
    expect(screen.getByText(/O rascunho da IA não salva nem publica a vaga automaticamente\./i)).toBeInTheDocument();
  });

  it("mostra benefícios quando o draft possui benefits", async () => {
    await generateAndWaitForDraft(false);
    fireEvent.click(screen.getByTestId("ai-draft-apply-btn"));

    expect(within(screen.getByTestId("compare-benefits")).getAllByText(/Vale-transporte/i).length).toBeGreaterThan(0);
  });

  it("mostra skills, perguntas e aviso informativo de suggested skills", async () => {
    await generateAndWaitForDraft(false);
    fireEvent.click(screen.getByTestId("ai-draft-apply-btn"));
    const dialog = screen.getByRole("dialog", { name: /Aplicar rascunho da IA\?/i });

    expect(within(dialog).getByText(/Mandatory skills/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/Atendimento ao cliente, Responsabilidade com caixa/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/Tem disponibilidade para turno integral\?/i)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Skills sugeridas revisadas não serão aplicadas como catálogo nesta fase\./i),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/1 skills existentes serão aplicadas\./i)).toBeInTheDocument();
    expect(within(dialog).getByText(/0 novas sugestões não serão criadas automaticamente\./i)).toBeInTheDocument();
    expect(within(dialog).getByText(/0 conflitos resolvidos manualmente serão aplicados\./i)).toBeInTheDocument();
    expect(within(dialog).getByText(/0 conflitos ainda exigem revisão\./i)).toBeInTheDocument();
  });

  it("conflict resolvido aparece no resumo da modal", async () => {
    await generateAndWaitForDraft(false);
    fireEvent.click(screen.getByTestId("draft-suggested-skill-checkbox-conflict-Suporte ERP"));
    fireEvent.click(screen.getByTestId("draft-suggested-skill-conflict-option-Suporte ERP-skill-atendimento-erp"));
    fireEvent.click(screen.getByTestId("ai-draft-apply-btn"));

    const dialog = screen.getByRole("dialog", { name: /Aplicar rascunho da IA\?/i });
    expect(within(dialog).getByText(/1 conflitos resolvidos manualmente serão aplicados\./i)).toBeInTheDocument();
    expect(within(dialog).getByText(/0 conflitos ainda exigem revisão\./i)).toBeInTheDocument();
    expect(within(dialog).getByText(/Suporte ERP -> Atendimento ERP/i)).toBeInTheDocument();
  });

  it("mostra comparação Atual x IA e status 'Será preenchido' quando o campo atual está vazio", async () => {
    await generateAndWaitForDraft(false);
    fireEvent.click(screen.getByTestId("ai-draft-apply-btn"));

    const workingHoursCard = screen.getByTestId("compare-working-hours");
    expect(within(workingHoursCard).getByText(/Atual/i)).toBeInTheDocument();
    expect(within(workingHoursCard).getByText(/IA/i)).toBeInTheDocument();
    expect(within(workingHoursCard).getByText(/Será preenchido/i)).toBeInTheDocument();
    expect(within(workingHoursCard).getByText("Não informado")).toBeInTheDocument();
    expect(within(workingHoursCard).getByText("6x1")).toBeInTheDocument();
  });

  it("mostra status 'Será alterado' quando o valor atual é diferente do sugerido", async () => {
    mockGenerateJobAiDraft.mockResolvedValue({
      ...MOCK_API_RESPONSE,
      draft: {
        ...MOCK_API_RESPONSE.draft,
        salary_min: 4000,
        salary_max: null,
      },
    });
    renderPanel(false, vi.fn(), {
      salary_min: 3000,
      benefits: ["Vale-alimentação"],
      working_hours: "5x2",
      work_model: "hybrid",
      location: "Campinas, SP",
      requirements: "Conhecimento básico em atendimento",
      minimum_education_level: "elementary",
      minimum_years_experience: 1,
    });
    fillAndSubmit();
    await screen.findByTestId("ai-draft-result");
    fireEvent.click(screen.getByTestId("ai-draft-apply-btn"));

    const salaryCard = screen.getByTestId("compare-salary");
    const benefitsCard = screen.getByTestId("compare-benefits");
    expect(within(salaryCard).getByText(/Será alterado/i)).toBeInTheDocument();
    expect(within(benefitsCard).getByText(/Será alterado/i)).toBeInTheDocument();
    expect(within(benefitsCard).getByText(/Adicionados: Vale-transporte/i)).toBeInTheDocument();
    expect(within(benefitsCard).getByText(/Removidos: Vale-alimentação/i)).toBeInTheDocument();
  });

  it("quando valor atual e IA são iguais mostra 'Sem alteração'", async () => {
    await generateAndWaitForDraft(false, vi.fn(), {
      working_hours: "6x1",
      work_model: "onsite",
      location: "São Paulo, SP",
      benefits: ["Vale-transporte"],
    });
    fireEvent.click(screen.getByTestId("ai-draft-apply-btn"));

    expect(within(screen.getByTestId("compare-working-hours")).getByText(/Sem alteração/i)).toBeInTheDocument();
    expect(within(screen.getByTestId("compare-work-model")).getByText(/Sem alteração/i)).toBeInTheDocument();
    expect(within(screen.getByTestId("compare-location")).getByText(/Sem alteração/i)).toBeInTheDocument();
  });

  it("sem currentFormSnapshot a modal continua funcionando", async () => {
    await generateAndWaitForDraft(false, vi.fn(), undefined);
    fireEvent.click(screen.getByTestId("ai-draft-apply-btn"));

    expect(screen.getByRole("dialog", { name: /Aplicar rascunho da IA\?/i })).toBeInTheDocument();
    expect(within(screen.getByTestId("compare-salary")).getByText(/Sem sugestão da IA/i)).toBeInTheDocument();
  });

  it("sem suggested_skills mantém comportamento antigo", async () => {
    mockGenerateJobAiDraft.mockResolvedValue({
      ...MOCK_API_RESPONSE,
      draft: {
        ...MOCK_API_RESPONSE.draft,
        suggested_skills: [],
      },
    });
    const { onApply } = renderPanel(false, vi.fn());
    fillAndSubmit();
    await screen.findByTestId("ai-draft-result");
    fireEvent.click(screen.getByTestId("ai-draft-apply-btn"));
    fireEvent.click(screen.getByRole("button", { name: /Aplicar rascunho/i }));

    expect(onApply).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        mandatory: expect.arrayContaining(["Atendimento ao cliente"]),
      }),
      [],
    );
  });

  it("abrir, cancelar ou confirmar a modal não dispara novas chamadas de backend/API", async () => {
    await generateAndWaitForDraft(false);
    expect(mockGenerateJobAiDraft).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("ai-draft-apply-btn"));
    fireEvent.click(screen.getByRole("button", { name: /Cancelar/i }));
    fireEvent.click(screen.getByTestId("ai-draft-apply-btn"));
    fireEvent.click(screen.getByRole("button", { name: /Aplicar rascunho/i }));

    expect(mockGenerateJobAiDraft).toHaveBeenCalledTimes(1);
    expect(mockGenerateJobAiDraftFromImage).not.toHaveBeenCalled();
  });

  it("substitui a confirmação antiga e não empilha duas confirmações", async () => {
    await generateAndWaitForDraft(true);
    fireEvent.click(screen.getByTestId("ai-draft-apply-btn"));

    expect(screen.queryByText(/Confirmar substituição/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("cancela a confirmação sem chamar onApply", async () => {
    const { onApply } = await generateAndWaitForDraft(true);
    fireEvent.click(screen.getByTestId("ai-draft-apply-btn"));
    fireEvent.click(screen.getByRole("button", { name: /Cancelar/i }));

    expect(onApply).not.toHaveBeenCalled();
  });

  it("confirma e aplica quando o usuário aceita a revisão", async () => {
    const { onApply } = await generateAndWaitForDraft(true);
    fireEvent.click(screen.getByTestId("ai-draft-apply-btn"));
    fireEvent.click(screen.getByRole("button", { name: /Aplicar rascunho/i }));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Operador de Caixa" }),
      expect.any(Object),
      expect.any(Array),
    );
  });

  it("sem benefits no draft mostra a mensagem de nenhum salário ou benefício", async () => {
    mockGenerateJobAiDraft.mockResolvedValue({
      ...MOCK_API_RESPONSE,
      draft: {
        ...MOCK_API_RESPONSE.draft,
        benefits: [],
        salary_min: null,
        salary_max: null,
      },
    });
    renderPanel(false, vi.fn());
    fillAndSubmit();
    await screen.findByTestId("ai-draft-result");

    fireEvent.click(screen.getByTestId("ai-draft-apply-btn"));

    const benefitsCard = screen.getByTestId("compare-benefits");
    expect(within(benefitsCard).getAllByText("Não informado").length).toBeGreaterThan(0);
    expect(within(benefitsCard).getByText(/Sem sugestão da IA/i)).toBeInTheDocument();
  });

  it("mostra salário atual do formulário quando existir, sem aplicar salary do draft", async () => {
    await generateAndWaitForDraft(false, vi.fn(), { salary_min: 3000, salary_max: 4500, benefits: [] });
    fireEvent.click(screen.getByTestId("ai-draft-apply-btn"));

    const salaryCard = screen.getByTestId("compare-salary");
    expect(within(salaryCard).getByText(/Sem sugestão da IA/i)).toBeInTheDocument();
    expect(within(salaryCard).getByText(/R\$ 3\.000 a R\$ 4\.500/i)).toBeInTheDocument();
  });

  // ── Descartar rascunho ────────────────────────────────────────────────────

  it("descarta o rascunho e volta ao estado inicial", async () => {
    await generateAndWaitForDraft();

    fireEvent.click(screen.getByTestId("ai-draft-discard-btn"));

    expect(screen.queryByTestId("ai-draft-result")).not.toBeInTheDocument();
    // botão gerar deve estar disponível novamente
    expect(screen.getByRole("button", { name: /Gerar com IA/i })).toBeInTheDocument();
  });

  // ── Erro da API ───────────────────────────────────────────────────────────

  it("mostra mensagem de erro quando a API falha", async () => {
    mockGenerateJobAiDraft.mockRejectedValue(new Error("Provedor de IA indisponível."));
    renderPanel();
    fillAndSubmit();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Provedor de IA indisponível/i);
    expect(screen.queryByTestId("ai-draft-result")).not.toBeInTheDocument();
  });

  it("mostra erro genérico quando a API falha sem mensagem", async () => {
    mockGenerateJobAiDraft.mockRejectedValue({});
    renderPanel();
    fillAndSubmit();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Não foi possível gerar o rascunho/i);
  });

  it("renderiza a opção 'Enviar imagem' no painel", () => {
    renderPanel();
    expect(screen.getByRole("tab", { name: /Enviar imagem/i })).toBeInTheDocument();
  });

  it("abre no modo 'Colar descrição' mostrando textarea e botão principal", () => {
    renderPanel();

    expect(screen.getByLabelText(/Descrição da vaga para IA/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Gerar com IA/i })).toBeInTheDocument();
    expect(screen.queryByText(/Selecionar imagem/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Cole a descrição da vaga e gere um rascunho revisável/i),
    ).toBeInTheDocument();
  });

  it("no modo 'Enviar imagem' mostra upload e oculta o textarea", () => {
    renderPanel();
    switchToTab(/Enviar imagem/i);

    expect(screen.getByText(/Selecionar imagem/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Extrair e gerar rascunho/i }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Descrição da vaga para IA/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Gerar com IA/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Usar exemplo/i })).not.toBeInTheDocument();
    expect(
      screen.getByText(/Envie uma arte da vaga\. A IA extrai as informações e gera um rascunho revisável/i),
    ).toBeInTheDocument();
  });

  it("preserva texto, imagem e contexto ao trocar de abas", async () => {
    renderPanel();

    fireEvent.change(screen.getByLabelText(/Descrição da vaga para IA/i), {
      target: { value: "Texto preservado" },
    });

    switchToTab(/Enviar imagem/i);

    const image = new File(["binary"], "vaga.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByTestId("ai-draft-image-input"), {
      target: { files: [image] },
    });
    fireEvent.change(screen.getByLabelText(/Contexto adicional opcional/i), {
      target: { value: "Contexto preservado" },
    });

    expect(screen.getByTestId("ai-draft-image-filename")).toHaveTextContent("vaga.jpg");

    switchToTab(/Colar descrição/i);
    expect(screen.getByLabelText(/Descrição da vaga para IA/i)).toHaveValue("Texto preservado");

    switchToTab(/Enviar imagem/i);
    expect(screen.getByLabelText(/Contexto adicional opcional/i)).toHaveValue("Contexto preservado");
    expect(screen.getByTestId("ai-draft-image-filename")).toHaveTextContent("vaga.jpg");
    expect(mockGenerateJobAiDraft).not.toHaveBeenCalled();
    expect(mockGenerateJobAiDraftFromImage).not.toHaveBeenCalled();
  });

  it("bloqueia arquivo inválido antes de chamar o endpoint", async () => {
    renderPanel();
    switchToTab(/Enviar imagem/i);

    const input = screen.getByTestId("ai-draft-image-input") as HTMLInputElement;
    const invalidFile = new File(["<svg></svg>"], "vaga.svg", { type: "image/svg+xml" });
    fireEvent.change(input, { target: { files: [invalidFile] } });

    expect(await screen.findByRole("alert")).toHaveTextContent(/PNG ou JPG\/JPEG/i);
    expect(mockGenerateJobAiDraftFromImage).not.toHaveBeenCalled();
  });

  it("chama o endpoint multipart correto ao enviar imagem", async () => {
    mockGenerateJobAiDraftFromImage.mockResolvedValue({
      ...MOCK_API_RESPONSE,
      extracted_text: "OPERADOR DE CAIXA 6x1 VALE-TRANSPORTE",
      warnings: ["image_text_extraction_requires_review"],
    });
    renderPanel();
    switchToTab(/Enviar imagem/i);

    const image = new File(["binary"], "vaga.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByTestId("ai-draft-image-input"), {
      target: { files: [image] },
    });
    fireEvent.click(screen.getByRole("button", { name: /Extrair e gerar rascunho/i }));

    await waitFor(() => expect(mockGenerateJobAiDraftFromImage).toHaveBeenCalledTimes(1));
    expect(mockGenerateJobAiDraftFromImage).toHaveBeenCalledWith(image, "");
    expect(await screen.findByTestId("ai-draft-extracted-text")).toHaveTextContent(
      /OPERADOR DE CAIXA/i,
    );
  });

  it("mostra loading e warnings no fluxo por imagem", async () => {
    let resolvePromise!: (value: JobAiDraftGenerateResponse) => void;
    mockGenerateJobAiDraftFromImage.mockReturnValueOnce(
      new Promise<JobAiDraftGenerateResponse>((resolve) => {
        resolvePromise = resolve;
      }),
    );
    renderPanel();
    switchToTab(/Enviar imagem/i);

    const image = new File(["binary"], "vaga.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByTestId("ai-draft-image-input"), {
      target: { files: [image] },
    });
    fireEvent.click(screen.getByRole("button", { name: /Extrair e gerar rascunho/i }));

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Extraindo e gerando/i })).toBeDisabled();

    resolvePromise({
      ...MOCK_API_RESPONSE,
      extracted_text: "Titulo, beneficios, jornada",
      warnings: ["image_text_extraction_requires_review", "ocr_text_may_be_incomplete"],
    });

    const warnings = await screen.findByTestId("ai-draft-warnings");
    expect(warnings).toHaveTextContent(/OCR imperfeito/i);
    expect(warnings).toHaveTextContent(/extração da imagem parece parcial/i);
  });

  it("mostra erro amigável quando a extração por imagem falha", async () => {
    mockGenerateJobAiDraftFromImage.mockRejectedValue(
      new Error("Nao foi possivel extrair texto util da imagem enviada."),
    );
    renderPanel();
    switchToTab(/Enviar imagem/i);

    const image = new File(["binary"], "vaga.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByTestId("ai-draft-image-input"), {
      target: { files: [image] },
    });
    fireEvent.click(screen.getByRole("button", { name: /Extrair e gerar rascunho/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/extrair texto util/i);
    expect(screen.queryByTestId("ai-draft-result")).not.toBeInTheDocument();
  });

  // ── Fechar painel ─────────────────────────────────────────────────────────

  it("chama onClose quando o botão fechar é clicado", () => {
    const onClose = vi.fn();
    render(<JobAiDraftPanel formHasData={false} onApply={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /Fechar painel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── Botão Usar exemplo ────────────────────────────────────────────────────

  it("preenche o textarea com o exemplo quando o usuário clica em 'Usar exemplo'", () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /Usar exemplo/i }));

    const textarea = screen.getByLabelText(/Descrição da vaga para IA/i);
    expect((textarea as HTMLTextAreaElement).value.length).toBeGreaterThan(20);
    // deve conter parte do texto do exemplo (sem depender do valor exato)
    expect((textarea as HTMLTextAreaElement).value).toMatch(/frentista|posto|caixa|atendimento/i);
  });
});
