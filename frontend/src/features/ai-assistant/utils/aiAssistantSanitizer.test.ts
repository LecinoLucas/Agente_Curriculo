import { describe, expect, it } from "vitest";

import {
  containsSensitiveAssistantText,
  filterSensitiveKeys,
  sanitizeAssistantPayload,
  sanitizeAssistantText,
  sanitizeResponse,
} from "./aiAssistantSanitizer";

describe("aiAssistantSanitizer", () => {
  it("removes formatted cpf", () => {
    expect(sanitizeAssistantText("CPF 123.456.789-00 localizado.")).toBe(
      "CPF [cpf_removido] localizado.",
    );
  });

  it("removes plain cpf", () => {
    expect(sanitizeAssistantText("CPF 12345678900 localizado.")).toBe(
      "CPF [cpf_removido] localizado.",
    );
  });

  it("removes brazilian mobile phone", () => {
    expect(sanitizeAssistantText("Telefone (11) 91234-5678")).toBe(
      "Telefone [telefone_removido]",
    );
  });

  it("removes brazilian landline phone", () => {
    expect(sanitizeAssistantText("Telefone (11) 3333-4444")).toBe(
      "Telefone [telefone_removido]",
    );
  });

  it("removes email", () => {
    expect(sanitizeAssistantText("Contato qa@example.test")).toBe("Contato [email_removido]");
  });

  it("removes api key token and secret in text", () => {
    const sanitized = sanitizeAssistantText(
      'api_key: AIzaSyExampleToken1234567890 Bearer abc.def.ghi secret="abc123456"',
    );

    expect(sanitized).not.toContain("AIza");
    expect(sanitized).not.toContain("abc.def.ghi");
    expect(sanitized).not.toContain("abc123456");
    expect(sanitized).toContain("[segredo_removido]");
  });

  it("removes stack trace", () => {
    expect(sanitizeAssistantText("Error\n    at render (/tmp/app.js:10:2)")).toBe(
      "Detalhes técnicos internos foram ocultados.",
    );
  });

  it("removes traceback", () => {
    expect(
      sanitizeAssistantText(
        'Traceback (most recent call last):\n  File "/app/main.py", line 10, in <module>',
      ),
    ).toBe("Detalhes técnicos internos foram ocultados.");
  });

  it("removes payload_json", () => {
    expect(sanitizeAssistantText('payload_json: {"cpf":"12345678900"}')).toBe(
      "[segredo_removido]",
    );
  });

  it("removes vector_json", () => {
    expect(sanitizeAssistantText("vector_json: [0.1, 0.2]")).toBe("[segredo_removido]");
  });

  it("removes content_hash", () => {
    expect(sanitizeAssistantText("content_hash: abc123")).toBe("[segredo_removido]");
  });

  it("removes embedding", () => {
    expect(sanitizeAssistantText("embedding: [0.12, 0.98]")).toBe("[segredo_removido]");
  });

  it("removes embeddings", () => {
    expect(sanitizeAssistantText("embeddings: [0.12, 0.98]")).toBe("[segredo_removido]");
  });

  it("removes review_notes", () => {
    expect(sanitizeAssistantText("review_notes: candidato aprovado")).toBe(
      "[segredo_removido]",
    );
  });

  it("removes internal_notes", () => {
    expect(sanitizeAssistantText("internal_notes: observacao interna")).toBe(
      "[segredo_removido]",
    );
  });

  it("sanitizes arrays recursively", () => {
    expect(
      sanitizeAssistantPayload(["CPF 12345678900", { email: "qa@example.test" }]),
    ).toEqual(["CPF [cpf_removido]", { email: "[email_removido]" }]);
  });

  it("sanitizes objects recursively", () => {
    expect(
      sanitizeAssistantPayload({
        answer: "Telefone (11) 91234-5678",
        nested: { payload_json: "{}", content: "CPF 123.456.789-00" },
      }),
    ).toEqual({
      answer: "Telefone [telefone_removido]",
      nested: { content: "CPF [cpf_removido]" },
    });
  });

  it("does not break with null", () => {
    expect(sanitizeAssistantPayload(null)).toBeNull();
  });

  it("does not break with empty string", () => {
    expect(sanitizeAssistantText("")).toBe("");
  });

  it("does not alter safe text", () => {
    expect(sanitizeAssistantText("Use o checklist antes de exportar.")).toBe(
      "Use o checklist antes de exportar.",
    );
  });

  it("filters sensitive keys case-insensitively", () => {
    expect(
      filterSensitiveKeys({
        Content_Hash: "abc",
        safe: "ok",
        nested_payload_json: "{}",
      }),
    ).toEqual({ safe: "ok" });
  });

  it("sanitizes nested response content and warnings", () => {
    const response = sanitizeResponse({
      ok: true,
      intent: "knowledge.search",
      tool_name: "search_knowledge",
      data: {
        chunks: [
          {
            source_title: "Documento com CPF",
            content: "CPF 123.456.789-00 email qa@example.test",
            vector_json: [1, 2, 3],
          },
        ],
      },
      error_code: null,
      message: "payload_json: {\"cpf\":\"12345678900\"}",
      requires_approval: false,
      warnings: ["Traceback (most recent call last)"],
    });

    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain("123.456.789-00");
    expect(serialized).not.toContain("qa@example.test");
    expect(serialized).not.toContain("vector_json");
    expect(serialized).not.toContain("payload_json");
    expect(response.warnings).toEqual(["Detalhes técnicos internos foram ocultados."]);
  });

  it("detects sensitive queries for history blocking", () => {
    expect(containsSensitiveAssistantText("Qual o CPF do candidato?")).toBe(true);
    expect(containsSensitiveAssistantText("Quais documentos faltam para exportar?")).toBe(false);
  });
});
