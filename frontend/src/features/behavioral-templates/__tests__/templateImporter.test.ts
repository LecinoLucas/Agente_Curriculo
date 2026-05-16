import { describe, it, expect, vi } from "vitest";
import {
  validateTemplate,
  importTemplateToApi,
  countTemplateQuestions,
  TemplateValidationError,
  type RawTemplate,
} from "../templateImporter";

const MINIMAL_TEMPLATE: RawTemplate = {
  name: "Test Template",
  description: "Test description",
  version: 1,
  status: "draft",
  competencies: [
    {
      key: "comp_1",
      name: "Competency 1",
      description: "Desc",
      weight: 50,
      questions: [
        {
          key: "q_1",
          type: "text",
          required: true,
          weight: 10,
          prompt: "Tell me about yourself",
        },
      ],
    },
  ],
};

const MULTI_CHOICE_TEMPLATE: RawTemplate = {
  ...MINIMAL_TEMPLATE,
  competencies: [
    {
      ...MINIMAL_TEMPLATE.competencies[0],
      questions: [
        {
          key: "q_mc",
          type: "multiple_choice",
          required: true,
          weight: 10,
          prompt: "Choose one",
          options: [
            { key: "a", label: "Option A", score: 1 },
            { key: "b", label: "Option B", score: 5 },
          ],
        },
      ],
    },
  ],
};

describe("validateTemplate", () => {
  it("aceita template JSON válido mínimo", () => {
    const result = validateTemplate(MINIMAL_TEMPLATE);
    expect(result.name).toBe("Test Template");
    expect(result.competencies).toHaveLength(1);
  });

  it("rejeita template sem nome", () => {
    const bad = { ...MINIMAL_TEMPLATE, name: "" };
    expect(() => validateTemplate(bad)).toThrow(TemplateValidationError);
    expect(() => validateTemplate(bad)).toThrow("'name'");
  });

  it("rejeita template sem competências", () => {
    const bad = { ...MINIMAL_TEMPLATE, competencies: [] };
    expect(() => validateTemplate(bad)).toThrow(TemplateValidationError);
    expect(() => validateTemplate(bad)).toThrow("competência");
  });

  it("rejeita múltipla escolha com menos de 2 opções", () => {
    const bad: RawTemplate = {
      ...MINIMAL_TEMPLATE,
      competencies: [
        {
          ...MINIMAL_TEMPLATE.competencies[0],
          questions: [
            {
              key: "q_bad_mc",
              type: "multiple_choice",
              required: true,
              weight: 10,
              prompt: "Just one option",
              options: [{ key: "a", label: "Only A", score: 1 }],
            },
          ],
        },
      ],
    };
    expect(() => validateTemplate(bad)).toThrow(TemplateValidationError);
    expect(() => validateTemplate(bad)).toThrow("2 opções");
  });

  it("rejeita competência com peso zero", () => {
    const bad: RawTemplate = {
      ...MINIMAL_TEMPLATE,
      competencies: [{ ...MINIMAL_TEMPLATE.competencies[0], weight: 0 }],
    };
    expect(() => validateTemplate(bad)).toThrow(TemplateValidationError);
    expect(() => validateTemplate(bad)).toThrow("peso");
  });

  it("rejeita pergunta com peso zero", () => {
    const bad: RawTemplate = {
      ...MINIMAL_TEMPLATE,
      competencies: [
        {
          ...MINIMAL_TEMPLATE.competencies[0],
          questions: [{ ...MINIMAL_TEMPLATE.competencies[0].questions[0], weight: 0 }],
        },
      ],
    };
    expect(() => validateTemplate(bad)).toThrow(TemplateValidationError);
    expect(() => validateTemplate(bad)).toThrow("peso");
  });

  it("rejeita valor não-objeto", () => {
    expect(() => validateTemplate(null)).toThrow(TemplateValidationError);
    expect(() => validateTemplate("string")).toThrow(TemplateValidationError);
    expect(() => validateTemplate([])).toThrow(TemplateValidationError);
  });
});

describe("importTemplateToApi", () => {
  it("cria template, competências e perguntas em sequência via API", async () => {
    const service = {
      createTemplate: vi.fn().mockResolvedValue({ id: "tmpl-1" }),
      createCompetency: vi.fn().mockResolvedValue({ id: "comp-1" }),
      createQuestion: vi.fn().mockResolvedValue({}),
    };

    const result = await importTemplateToApi(MINIMAL_TEMPLATE, service);

    expect(result).toEqual({ id: "tmpl-1" });
    expect(service.createTemplate).toHaveBeenCalledOnce();
    expect(service.createTemplate).toHaveBeenCalledWith({
      name: "Test Template",
      description: "Test description",
    });
    expect(service.createCompetency).toHaveBeenCalledOnce();
    expect(service.createQuestion).toHaveBeenCalledOnce();
  });

  it("mapeia opções de múltipla escolha para options_json", async () => {
    const service = {
      createTemplate: vi.fn().mockResolvedValue({ id: "tmpl-2" }),
      createCompetency: vi.fn().mockResolvedValue({ id: "comp-2" }),
      createQuestion: vi.fn().mockResolvedValue({}),
    };

    await importTemplateToApi(MULTI_CHOICE_TEMPLATE, service);

    expect(service.createQuestion).toHaveBeenCalledWith(
      "tmpl-2",
      "comp-2",
      expect.objectContaining({
        answer_type: "multiple_choice",
        options_json: ["Option A", "Option B"],
      }),
    );
  });

  it("envia options_json null para perguntas text e scale", async () => {
    const service = {
      createTemplate: vi.fn().mockResolvedValue({ id: "tmpl-3" }),
      createCompetency: vi.fn().mockResolvedValue({ id: "comp-3" }),
      createQuestion: vi.fn().mockResolvedValue({}),
    };

    await importTemplateToApi(MINIMAL_TEMPLATE, service);

    expect(service.createQuestion).toHaveBeenCalledWith(
      "tmpl-3",
      "comp-3",
      expect.objectContaining({ options_json: null }),
    );
  });

  it("propaga erro do service sem criar template duplicado", async () => {
    const service = {
      createTemplate: vi.fn().mockRejectedValue(new Error("Name already exists")),
      createCompetency: vi.fn(),
      createQuestion: vi.fn(),
    };

    await expect(importTemplateToApi(MINIMAL_TEMPLATE, service)).rejects.toThrow("Name already exists");
    expect(service.createCompetency).not.toHaveBeenCalled();
    expect(service.createQuestion).not.toHaveBeenCalled();
  });
});

describe("countTemplateQuestions", () => {
  it("soma perguntas de todas as competências", () => {
    const template: RawTemplate = {
      ...MINIMAL_TEMPLATE,
      competencies: [
        { ...MINIMAL_TEMPLATE.competencies[0], questions: [MINIMAL_TEMPLATE.competencies[0].questions[0], MINIMAL_TEMPLATE.competencies[0].questions[0]] },
        { ...MINIMAL_TEMPLATE.competencies[0], key: "comp_2", questions: [MINIMAL_TEMPLATE.competencies[0].questions[0]] },
      ],
    };
    expect(countTemplateQuestions(template)).toBe(3);
  });

  it("retorna 0 para template sem perguntas", () => {
    const template: RawTemplate = {
      ...MINIMAL_TEMPLATE,
      competencies: [{ ...MINIMAL_TEMPLATE.competencies[0], questions: [] }],
    };
    expect(countTemplateQuestions(template)).toBe(0);
  });
});
