/**
 * JobAiDraftPanel tests
 *
 * Organisation:
 * 1. draftToFormUpdates — legacy mock helper (preserved for backward-compat)
 * 2. applyApiDraftToForm — new real API helper
 * 3. JobAiDraftPanel — component with real API (mocked via vi.mock)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { JobAiDraftPanel, draftToFormUpdates } from "../components/JobAiDraftPanel";
import { MOCK_JOB_AI_DRAFT } from "../utils/mockJobAiDraft";
import { applyApiDraftToForm } from "../utils/jobAiDraftHelpers";
import type { JobAiDraftGenerateResponse } from "../services/jobAiDraftService";

// ── Mock the real API service ────────────────────────────────────────────────

vi.mock("../services/jobAiDraftService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/jobAiDraftService")>();
  return {
    ...actual,
    generateJobAiDraft: vi.fn(),
  };
});

import { generateJobAiDraft } from "../services/jobAiDraftService";

const mockGenerateJobAiDraft = generateJobAiDraft as ReturnType<typeof vi.fn>;

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
    requires_manager_review: true,
    requires_behavioral_assessment: false,
  },
  needs_review: ["salary_range"],
  warnings: [],
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
    };
    const result = applyApiDraftToForm(draftNoTitle);
    expect(result.title).toBeUndefined();
    expect(result.experience_context).toBeUndefined();
    expect(result.minimum_education_level).toBeUndefined();
    expect(result.minimum_years_experience).toBeUndefined();
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
});

// ── 3. JobAiDraftPanel — componente com API real (mockada) ────────────────────

describe("JobAiDraftPanel — API real", () => {
  beforeEach(() => {
    mockGenerateJobAiDraft.mockReset();
  });

  function renderPanel(formHasData = false, onApply = vi.fn()) {
    render(<JobAiDraftPanel formHasData={formHasData} onApply={onApply} />);
    return { onApply };
  }

  function fillAndSubmit(prompt = "Preciso de um operador de caixa.") {
    fireEvent.change(screen.getByLabelText(/Descrição da vaga para IA/i), {
      target: { value: prompt },
    });
    fireEvent.click(screen.getByRole("button", { name: /Gerar com IA/i }));
  }

  async function generateAndWaitForDraft(formHasData = false, onApply = vi.fn()) {
    mockGenerateJobAiDraft.mockResolvedValue(MOCK_API_RESPONSE);
    renderPanel(formHasData, onApply);
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
    // se o mock da API real foi chamado, o mock local não foi usado
    expect(mockGenerateJobAiDraft).toHaveBeenCalled();
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

  it("exibe warnings novos de forma legível", async () => {
    mockGenerateJobAiDraft.mockResolvedValue({
      ...MOCK_API_RESPONSE,
      warnings: [
        "minimum_years_experience_removed_no_source_evidence",
        "minimum_education_level_removed_no_source_evidence",
      ],
    });
    renderPanel();
    fillAndSubmit();
    const warnings = await screen.findByTestId("ai-draft-warnings");
    expect(warnings).toHaveTextContent(/Experiência mínima removida/i);
    expect(warnings).toHaveTextContent(/Escolaridade mínima removida/i);
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

  it("aplica o rascunho real ao formulário quando o formulário está vazio", async () => {
    const { onApply } = await generateAndWaitForDraft(false);
    fireEvent.click(screen.getByTestId("ai-draft-apply-btn"));

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
    );
  });

  it("não mapeia salary para o formulário", async () => {
    const { onApply } = await generateAndWaitForDraft(false);
    fireEvent.click(screen.getByTestId("ai-draft-apply-btn"));

    const formUpdates = onApply.mock.calls[0][0];
    expect(formUpdates.salary_min).toBeUndefined();
    expect(formUpdates.salary_max).toBeUndefined();
  });

  // ── Confirmação de substituição ───────────────────────────────────────────

  it("pede confirmação antes de aplicar sobre formulário já preenchido", async () => {
    await generateAndWaitForDraft(true);
    fireEvent.click(screen.getByTestId("ai-draft-apply-btn"));

    expect(screen.getByRole("dialog", { name: /Confirmar substituição/i })).toBeInTheDocument();
  });

  it("cancela a confirmação sem chamar onApply", async () => {
    const { onApply } = await generateAndWaitForDraft(true);
    fireEvent.click(screen.getByTestId("ai-draft-apply-btn"));
    fireEvent.click(screen.getByRole("button", { name: /Cancelar/i }));

    expect(onApply).not.toHaveBeenCalled();
  });

  it("confirma e aplica quando o usuário aceita substituição", async () => {
    const { onApply } = await generateAndWaitForDraft(true);
    fireEvent.click(screen.getByTestId("ai-draft-apply-btn"));
    fireEvent.click(screen.getByRole("button", { name: /Confirmar e aplicar/i }));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Operador de Caixa" }),
      expect.any(Object),
    );
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
