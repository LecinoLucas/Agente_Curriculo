import { describe, it, expect } from "vitest";
import { presentResult } from "./aiAssistantPresenters";
import type { AiAssistantResponse } from "../types";

function makeResponse(overrides: Partial<AiAssistantResponse> = {}): AiAssistantResponse {
  return {
    ok: true,
    intent: "job.summary",
    tool_name: "get_job_summary",
    data: {},
    error_code: null,
    message: null,
    requires_approval: false,
    warnings: [],
    ...overrides,
  };
}

describe("aiAssistantPresenters - buildJobPresenter", () => {
  it("translates status 'published' to 'Publicada'", () => {
    const response = makeResponse({
      data: { title: "Vaga Teste", status: "published" },
    });
    const result = presentResult(response);
    expect(result.summary).toContain("Status atual: Publicada");
  });

  it("translates seniority 'senior' to 'Sênior'", () => {
    const response = makeResponse({
      data: { title: "Vaga Teste", seniority: "senior" },
    });
    const result = presentResult(response);
    const seniorityMetric = result.metrics?.find((m) => m.label === "Senioridade");
    expect(seniorityMetric?.value).toBe("Sênior");
  });

  it("translates work_model 'onsite' to 'Presencial'", () => {
    const response = makeResponse({
      data: { title: "Vaga Teste", work_model: "onsite" },
    });
    const result = presentResult(response);
    const workModelMetric = result.metrics?.find((m) => m.label === "Modelo de trabalho");
    expect(workModelMetric?.value).toBe("Presencial");
  });

  it("translates area 'data' to 'Dados'", () => {
    const response = makeResponse({
      data: { title: "Vaga Teste", area: "data" },
    });
    const result = presentResult(response);
    expect(result.summary).toContain("Área responsável: Dados");
  });

  it("shows 'Não informado' for missing fields", () => {
    const response = makeResponse({
      data: { title: "Vaga Teste" },
    });
    const result = presentResult(response);
    const locationMetric = result.metrics?.find((m) => m.label === "Localidade");
    expect(locationMetric?.value).toBe("Não informado");
  });

  it("includes honest source label", () => {
    const response = makeResponse({ data: { title: "Vaga Teste" } });
    const result = presentResult(response);
    expect(result.source).toBe("Fonte: dados atuais da vaga");
  });

  it("shows actionable pendency when skills are missing", () => {
    const response = makeResponse({
      data: { title: "Vaga Teste", mandatory_skills: [] },
    });
    const result = presentResult(response);
    expect(result.pending).toBeDefined();
    expect(result.pending?.[0]).toContain("Skills essenciais não informadas");
    expect(result.pending?.[0]).toContain("Impacto: o ranking IA e o matching ficam menos confiáveis");
    expect(result.pending?.[0]).toContain("Ação sugerida: cadastre as skills essenciais da vaga");
  });

  it("adjusts next step based on pendencies", () => {
    const responseWithPending = makeResponse({
      data: { title: "Vaga Teste", mandatory_skills: [] },
    });
    const resultWithPending = presentResult(responseWithPending);
    expect(resultWithPending.nextStep).toContain("Revise as pendências acima");

    const responseOk = makeResponse({
      data: {
        title: "Vaga Teste",
        mandatory_skills: ["SQL"],
        requirements: "Ter experiência",
        location: "SP",
        work_model: "onsite",
      },
    });
    const resultOk = presentResult(responseOk);
    expect(resultOk.nextStep).toContain("Dados consistentes");
  });

  it("handles job.requirements intent specifically", () => {
    const response = makeResponse({
      intent: "job.requirements",
      data: { title: "Vaga Teste", requirements: "Muitos requisitos" },
    });
    const result = presentResult(response);
    expect(result.title).toBe("Requisitos Detalhados");
    expect(result.summary?.[0]).toBe("Requisitos da Vaga: Vaga Teste");
  });

  it("displays enriched job data (vacancies, priority, working_hours)", () => {
    const response = makeResponse({
      data: {
        title: "Vaga Enriquecida",
        vacancies_count: 5,
        priority: "urgent",
        working_hours: "44h semanais",
        quality_score: 92,
      },
    });
    const result = presentResult(response);
    expect(result.summary).toContain("Quantidade de vagas: 5");
    
    const priorityMetric = result.metrics?.find((m) => m.label === "Prioridade");
    expect(priorityMetric?.value).toBe("Urgente");
    
    const hoursMetric = result.metrics?.find((m) => m.label === "Jornada");
    expect(hoursMetric?.value).toBe("44h semanais");
    
    const scoreMetric = result.metrics?.find((m) => m.label === "Score de qualidade");
    expect(scoreMetric?.value).toBe("92");
  });

  it("sanitizes internal fields", () => {
    const response = makeResponse({
      data: { title: "Vaga Teste", payload_json: "{}", embedding: [0.1] },
    });
    const result = presentResult(response);
    // Metrics should not include internal fields
    const internalField = result.metrics?.find((m) =>
      ["payload_json", "embedding"].includes(m.label.toLowerCase())
    );
    expect(internalField).toBeUndefined();
  });
});

describe("aiAssistantPresenters - buildJobSearchPresenter", () => {
  it("handles job.search intent with multiple results", () => {
    const response = makeResponse({
      intent: "job.search",
      data: {
        jobs: [
          { title: "Vaga A", status: "published", area: "data" },
          { title: "Vaga B", status: "draft", area: "hr" },
        ],
        total: 2,
      },
    });
    const result = presentResult(response);
    expect(result.title).toBe("Vagas encontradas");
    expect(result.summary?.[0]).toBe("Encontrei 2 vaga(s) correspondente(s).");
    expect(result.evidence).toHaveLength(2);
    expect(result.evidence?.[0].title).toBe("Vaga A");
    expect(result.evidence?.[0].description).toContain("Status: Publicada");
  });

  it("handles job.search intent with no results", () => {
    const response = makeResponse({
      intent: "job.search",
      data: { jobs: [], total: 0 },
    });
    const result = presentResult(response);
    expect(result.summary?.[0]).toBe("Nenhuma vaga encontrada para os critérios informados.");
  });
});
