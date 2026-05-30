import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { JobAiDraftPanel, draftToFormUpdates } from "../components/JobAiDraftPanel";
import type { JobAiDraftFields } from "../services/jobAiDraftService";
import { generateJobAiDraft } from "../services/jobAiDraftService";

// ── Service mock ──────────────────────────────────────────────────────────────

vi.mock("../services/jobAiDraftService", () => ({
  extractJobTextFromImage: vi.fn(),
  generateJobAiDraft: vi.fn(),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FULL_DRAFT: JobAiDraftFields = {
  title: "Operador de Caixa",
  area: "Atendimento",
  seniority: "junior",
  work_model: "onsite",
  unit: "Goiânia, GO",
  salary_min: 1400,
  salary_max: 1800,
  description: "Atendimento ao cliente em loja de varejo.",
  responsibilities: ["Operar caixa registradora", "Atender clientes"],
  requirements: ["Ensino médio completo"],
  mandatory_skills: ["Atendimento ao cliente", "Operação de caixa"],
  nice_to_have_skills: ["Experiência anterior em caixa"],
  benefits: ["Vale refeição", "Plano de saúde"],
  working_hours: "6x1, turno integral",
  screening_questions: ["Tem disponibilidade para turno integral?"],
  pipeline_steps: [],
  matching_criteria: [],
  requires_manager_review: true,
  requires_behavioral_assessment: false,
};

function makeMockResponse(draft: Partial<JobAiDraftFields> = {}) {
  return {
    draft: { ...FULL_DRAFT, ...draft },
    needs_review: [],
    source: { text_used: true, ocr_used: false, input_character_count: 20 },
    usage: {
      provider: "google",
      model: "gemini-2.5-flash",
      input_tokens: 100,
      output_tokens: 80,
      total_tokens: 180,
      estimated_cost: null,
    },
  };
}

// ── Unit tests: draftToFormUpdates ────────────────────────────────────────────

describe("draftToFormUpdates — mapeamento de campos ricos", () => {
  it("aplica campos básicos já existentes", () => {
    const result = draftToFormUpdates(FULL_DRAFT);
    expect(result.title).toBe("Operador de Caixa");
    expect(result.description).toBe("Atendimento ao cliente em loja de varejo.");
    expect(result.job_area).toBe("Atendimento");
    expect(result.work_model).toBe("onsite");
    expect(result.location).toBe("Goiânia, GO");
    expect(result.salary_min).toBe(1400);
    expect(result.salary_max).toBe(1800);
    expect(result.requires_manager_review).toBe(true);
    expect(result.requires_behavioral_assessment).toBe(false);
  });

  it("une responsabilidades e requisitos com newline", () => {
    const result = draftToFormUpdates(FULL_DRAFT);
    expect(result.responsibilities).toBe("Operar caixa registradora\nAtender clientes");
    expect(result.requirements).toBe("Ensino médio completo");
  });

  it("aplica seniority_level quando draft.seniority existe", () => {
    const result = draftToFormUpdates(FULL_DRAFT);
    expect(result.seniority_level).toBe("junior");
  });

  it("não define seniority_level quando draft.seniority é null", () => {
    const result = draftToFormUpdates({ ...FULL_DRAFT, seniority: null });
    expect(result.seniority_level).toBeUndefined();
  });

  it("não sobrescreve experience_context com working_hours (campo dedicado existe)", () => {
    const result = draftToFormUpdates(FULL_DRAFT);
    expect(result.experience_context).toBeUndefined();
  });

  it("aplica mandatory_skills no campo mandatory_skills dedicado", () => {
    const result = draftToFormUpdates(FULL_DRAFT);
    expect(result.mandatory_skills).toContain("Atendimento ao cliente");
    expect(result.mandatory_skills).toContain("Operação de caixa");
  });

  it("aplica nice_to_have_skills no campo nice_to_have_skills dedicado", () => {
    const result = draftToFormUpdates(FULL_DRAFT);
    expect(result.nice_to_have_skills).toContain("Experiência anterior em caixa");
  });

  it("aplica screening_questions no campo screening_questions dedicado", () => {
    const result = draftToFormUpdates(FULL_DRAFT);
    expect(result.screening_questions).toContain(
      "Tem disponibilidade para turno integral?",
    );
  });

  it("aplica benefits no campo benefits dedicado", () => {
    const result = draftToFormUpdates(FULL_DRAFT);
    expect(result.benefits).toContain("Vale refeição");
    expect(result.benefits).toContain("Plano de saúde");
  });

  it("aplica working_hours no campo working_hours dedicado (não experience_context)", () => {
    const result = draftToFormUpdates(FULL_DRAFT);
    expect(result.working_hours).toBe("6x1, turno integral");
    // experience_context permanece intocado pelo draft (era preenchido por working_hours antes)
    expect(result.experience_context).toBeUndefined();
  });

  it("NÃO mistura nice_to_have_skills em behavioral_requirements", () => {
    const result = draftToFormUpdates(FULL_DRAFT);
    // behavioral_requirements not populated by draft AI — only manual entries
    expect(result.behavioral_requirements).toBeUndefined();
  });

  it("NÃO mistura screening_questions em behavioral_requirements", () => {
    const result = draftToFormUpdates(FULL_DRAFT);
    expect(result.behavioral_requirements).toBeUndefined();
  });

  it("NÃO mistura mandatory_skills em behavioral_requirements (campo dedicado existe)", () => {
    const result = draftToFormUpdates(FULL_DRAFT);
    expect(result.behavioral_requirements).toBeUndefined();
  });

  it("remove duplicatas (case-insensitive) em mandatory_skills", () => {
    const draft: JobAiDraftFields = {
      ...FULL_DRAFT,
      mandatory_skills: ["Atendimento ao cliente", "ATENDIMENTO AO CLIENTE", "Operação de caixa"],
    };
    const result = draftToFormUpdates(draft);
    const count = result.mandatory_skills?.filter(
      (s) => s.toLowerCase() === "atendimento ao cliente",
    ).length;
    expect(count).toBe(1);
  });

  it("remove strings vazias de mandatory_skills", () => {
    const draft: JobAiDraftFields = {
      ...FULL_DRAFT,
      mandatory_skills: ["", "Operação de caixa", "  "],
    };
    const result = draftToFormUpdates(draft);
    expect(result.mandatory_skills?.every((s) => s.trim().length > 0)).toBe(true);
  });

  it("remove vazios/duplicatas em nice_to_have_skills", () => {
    const draft: JobAiDraftFields = {
      ...FULL_DRAFT,
      nice_to_have_skills: ["", "Excel", "EXCEL", "  "],
    };
    const result = draftToFormUpdates(draft);
    expect(result.nice_to_have_skills).toEqual(["Excel"]);
  });

  it("remove vazios/duplicatas em screening_questions", () => {
    const draft: JobAiDraftFields = {
      ...FULL_DRAFT,
      screening_questions: ["  Tem CNH?", "tem cnh?", "Pode viajar?"],
    };
    const result = draftToFormUpdates(draft);
    const len = result.screening_questions?.length;
    expect(len).toBe(2);
  });

  it("remove vazios/duplicatas em benefits", () => {
    const draft: JobAiDraftFields = {
      ...FULL_DRAFT,
      benefits: ["", "Vale refeição", "VALE REFEIÇÃO"],
    };
    const result = draftToFormUpdates(draft);
    expect(result.benefits).toEqual(["Vale refeição"]);
  });

  it("não define mandatory_skills quando lista está vazia", () => {
    const draft: JobAiDraftFields = { ...FULL_DRAFT, mandatory_skills: [] };
    const result = draftToFormUpdates(draft);
    expect(result.mandatory_skills).toBeUndefined();
  });

  it("não define nice_to_have_skills quando lista está vazia", () => {
    const draft: JobAiDraftFields = { ...FULL_DRAFT, nice_to_have_skills: [] };
    const result = draftToFormUpdates(draft);
    expect(result.nice_to_have_skills).toBeUndefined();
  });

  it("não define screening_questions quando lista está vazia", () => {
    const draft: JobAiDraftFields = { ...FULL_DRAFT, screening_questions: [] };
    const result = draftToFormUpdates(draft);
    expect(result.screening_questions).toBeUndefined();
  });

  it("não define benefits quando lista está vazia", () => {
    const draft: JobAiDraftFields = { ...FULL_DRAFT, benefits: [] };
    const result = draftToFormUpdates(draft);
    expect(result.benefits).toBeUndefined();
  });

  it("não define working_hours quando draft.working_hours é null", () => {
    const draft: JobAiDraftFields = { ...FULL_DRAFT, working_hours: null };
    const result = draftToFormUpdates(draft);
    expect(result.working_hours).toBeUndefined();
  });

  it("não define working_hours quando draft.working_hours é só espaços", () => {
    const draft: JobAiDraftFields = { ...FULL_DRAFT, working_hours: "   " };
    const result = draftToFormUpdates(draft);
    expect(result.working_hours).toBeUndefined();
  });

  it("não define responsibilities quando lista está vazia", () => {
    const result = draftToFormUpdates({ ...FULL_DRAFT, responsibilities: [] });
    expect(result.responsibilities).toBeUndefined();
  });

  it("não define requirements quando lista está vazia", () => {
    const result = draftToFormUpdates({ ...FULL_DRAFT, requirements: [] });
    expect(result.requirements).toBeUndefined();
  });
});

// ── Integration tests: JobAiDraftPanel component ──────────────────────────────

describe("JobAiDraftPanel — Aplicar ao formulário", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generateJobAiDraft).mockResolvedValue(makeMockResponse());
  });

  async function renderAndGenerate(onApply = vi.fn()) {
    render(<JobAiDraftPanel formHasData={false} onApply={onApply} />);
    const textarea = screen.getByLabelText(/Descrição da vaga para IA/i);
    fireEvent.change(textarea, { target: { value: "Operador de Caixa" } });
    fireEvent.click(screen.getByRole("button", { name: /Gerar rascunho com IA/i }));
    await screen.findByTestId("ai-draft-result");
    return onApply;
  }

  it("botão 'Aplicar ao formulário' aparece após gerar rascunho", async () => {
    await renderAndGenerate();
    expect(
      screen.getByRole("button", { name: /Aplicar ao formulário/i }),
    ).toBeInTheDocument();
  });

  it("onApply recebe seniority_level do draft", async () => {
    const spy = vi.fn();
    await renderAndGenerate(spy);
    fireEvent.click(screen.getByRole("button", { name: /Aplicar ao formulário/i }));
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ seniority_level: "junior" }),
      expect.anything(),
    );
  });

  it("onApply recebe working_hours dedicado a partir do draft", async () => {
    const spy = vi.fn();
    await renderAndGenerate(spy);
    fireEvent.click(screen.getByRole("button", { name: /Aplicar ao formulário/i }));
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ working_hours: "6x1, turno integral" }),
      expect.anything(),
    );
  });

  it("onApply NÃO sobrescreve experience_context com working_hours", async () => {
    const spy = vi.fn();
    await renderAndGenerate(spy);
    fireEvent.click(screen.getByRole("button", { name: /Aplicar ao formulário/i }));
    const call = spy.mock.calls[0][0] as Record<string, unknown>;
    expect(call.experience_context).toBeUndefined();
  });

  it("onApply recebe mandatory_skills no campo dedicado mandatory_skills", async () => {
    const spy = vi.fn();
    await renderAndGenerate(spy);
    fireEvent.click(screen.getByRole("button", { name: /Aplicar ao formulário/i }));
    const call = spy.mock.calls[0][0] as Record<string, unknown>;
    const ms = call.mandatory_skills as string[];
    expect(ms).toContain("Atendimento ao cliente");
    expect(ms).toContain("Operação de caixa");
  });

  it("onApply recebe nice_to_have_skills no campo dedicado nice_to_have_skills", async () => {
    const spy = vi.fn();
    await renderAndGenerate(spy);
    fireEvent.click(screen.getByRole("button", { name: /Aplicar ao formulário/i }));
    const call = spy.mock.calls[0][0] as Record<string, unknown>;
    const nh = call.nice_to_have_skills as string[];
    expect(nh).toContain("Experiência anterior em caixa");
  });

  it("onApply recebe screening_questions no campo dedicado screening_questions", async () => {
    const spy = vi.fn();
    await renderAndGenerate(spy);
    fireEvent.click(screen.getByRole("button", { name: /Aplicar ao formulário/i }));
    const call = spy.mock.calls[0][0] as Record<string, unknown>;
    const sq = call.screening_questions as string[];
    expect(sq).toContain("Tem disponibilidade para turno integral?");
  });

  it("onApply recebe benefits no campo dedicado benefits", async () => {
    const spy = vi.fn();
    await renderAndGenerate(spy);
    fireEvent.click(screen.getByRole("button", { name: /Aplicar ao formulário/i }));
    const call = spy.mock.calls[0][0] as Record<string, unknown>;
    const bn = call.benefits as string[];
    expect(bn).toContain("Vale refeição");
  });

  it("onApply NÃO inclui mandatory_skills em behavioral_requirements (campo dedicado existe)", async () => {
    const spy = vi.fn();
    await renderAndGenerate(spy);
    fireEvent.click(screen.getByRole("button", { name: /Aplicar ao formulário/i }));
    const call = spy.mock.calls[0][0] as Record<string, unknown>;
    expect(call.behavioral_requirements).toBeUndefined();
  });

  it("onApply NÃO mistura nice_to_have_skills em behavioral_requirements", async () => {
    const spy = vi.fn();
    await renderAndGenerate(spy);
    fireEvent.click(screen.getByRole("button", { name: /Aplicar ao formulário/i }));
    const call = spy.mock.calls[0][0] as Record<string, unknown>;
    expect(call.behavioral_requirements).toBeUndefined();
  });

  it("onApply NÃO mistura screening_questions em behavioral_requirements", async () => {
    const spy = vi.fn();
    await renderAndGenerate(spy);
    fireEvent.click(screen.getByRole("button", { name: /Aplicar ao formulário/i }));
    const call = spy.mock.calls[0][0] as Record<string, unknown>;
    expect(call.behavioral_requirements).toBeUndefined();
  });

  it("onApply NÃO mistura benefits em behavioral_requirements", async () => {
    const spy = vi.fn();
    await renderAndGenerate(spy);
    fireEvent.click(screen.getByRole("button", { name: /Aplicar ao formulário/i }));
    const call = spy.mock.calls[0][0] as Record<string, unknown>;
    expect(call.behavioral_requirements).toBeUndefined();
  });

  it("onApply ainda recebe campos básicos existentes (title, description, work_model)", async () => {
    const spy = vi.fn();
    await renderAndGenerate(spy);
    fireEvent.click(screen.getByRole("button", { name: /Aplicar ao formulário/i }));
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Operador de Caixa",
        description: "Atendimento ao cliente em loja de varejo.",
        work_model: "onsite",
        location: "Goiânia, GO",
      }),
      expect.anything(),
    );
  });

  it("onApply passa mandatory_skills como skillSuggestions.mandatory", async () => {
    const spy = vi.fn();
    await renderAndGenerate(spy);
    fireEvent.click(screen.getByRole("button", { name: /Aplicar ao formulário/i }));
    const [, skillSuggestions] = spy.mock.calls[0] as [unknown, { mandatory: string[]; optional: string[] }];
    expect(skillSuggestions.mandatory).toContain("Atendimento ao cliente");
    expect(skillSuggestions.mandatory).toContain("Operação de caixa");
  });

  it("onApply passa nice_to_have_skills como skillSuggestions.optional", async () => {
    const spy = vi.fn();
    await renderAndGenerate(spy);
    fireEvent.click(screen.getByRole("button", { name: /Aplicar ao formulário/i }));
    const [, skillSuggestions] = spy.mock.calls[0] as [unknown, { mandatory: string[]; optional: string[] }];
    expect(skillSuggestions.optional).toContain("Experiência anterior em caixa");
  });

  it("onApply passa skillSuggestions vazias quando draft não tem skills", async () => {
    vi.mocked(generateJobAiDraft).mockResolvedValue(
      makeMockResponse({ mandatory_skills: [], nice_to_have_skills: [] }),
    );
    const spy = vi.fn();
    await renderAndGenerate(spy);
    fireEvent.click(screen.getByRole("button", { name: /Aplicar ao formulário/i }));
    const [, skillSuggestions] = spy.mock.calls[0] as [unknown, { mandatory: string[]; optional: string[] }];
    expect(skillSuggestions.mandatory).toHaveLength(0);
    expect(skillSuggestions.optional).toHaveLength(0);
  });

  it("onApply não é chamado quando draft não existe", () => {
    const spy = vi.fn();
    render(<JobAiDraftPanel formHasData={false} onApply={spy} />);
    // No draft generated — button doesn't exist yet
    expect(
      screen.queryByRole("button", { name: /Aplicar ao formulário/i }),
    ).not.toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it("draft sem working_hours não inclui working_hours no onApply", async () => {
    vi.mocked(generateJobAiDraft).mockResolvedValue(
      makeMockResponse({ working_hours: null }),
    );
    const spy = vi.fn();
    await renderAndGenerate(spy);
    fireEvent.click(screen.getByRole("button", { name: /Aplicar ao formulário/i }));
    const call = spy.mock.calls[0][0] as Record<string, unknown>;
    expect(call.working_hours).toBeUndefined();
  });

  it("draft sem seniority não inclui seniority_level no onApply", async () => {
    vi.mocked(generateJobAiDraft).mockResolvedValue(
      makeMockResponse({ seniority: null }),
    );
    const spy = vi.fn();
    await renderAndGenerate(spy);
    fireEvent.click(screen.getByRole("button", { name: /Aplicar ao formulário/i }));
    const call = spy.mock.calls[0][0] as Record<string, unknown>;
    expect(call.seniority_level).toBeUndefined();
  });

  it("confirmação aparece quando formHasData=true e cancela corretamente", async () => {
    const spy = vi.fn();
    render(<JobAiDraftPanel formHasData={true} onApply={spy} />);
    const textarea = screen.getByLabelText(/Descrição da vaga para IA/i);
    fireEvent.change(textarea, { target: { value: "Vaga teste" } });
    fireEvent.click(screen.getByRole("button", { name: /Gerar rascunho com IA/i }));
    await screen.findByTestId("ai-draft-result");

    fireEvent.click(screen.getByRole("button", { name: /Aplicar ao formulário/i }));

    // Confirmation dialog appears
    expect(
      screen.getByRole("dialog", { name: /Confirmar substituição/i }),
    ).toBeInTheDocument();

    // Cancel — onApply NOT called
    fireEvent.click(screen.getByRole("button", { name: /Cancelar/i }));
    expect(spy).not.toHaveBeenCalled();
  });

  it("confirmação quando formHasData=true chama onApply com dados ricos ao confirmar", async () => {
    const spy = vi.fn();
    render(<JobAiDraftPanel formHasData={true} onApply={spy} />);
    const textarea = screen.getByLabelText(/Descrição da vaga para IA/i);
    fireEvent.change(textarea, { target: { value: "Vaga teste" } });
    fireEvent.click(screen.getByRole("button", { name: /Gerar rascunho com IA/i }));
    await screen.findByTestId("ai-draft-result");

    fireEvent.click(screen.getByRole("button", { name: /Aplicar ao formulário/i }));
    fireEvent.click(screen.getByRole("button", { name: /Confirmar e aplicar/i }));

    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        seniority_level: "junior",
        working_hours: "6x1, turno integral",
      }),
      expect.anything(),
    );
  });
});
