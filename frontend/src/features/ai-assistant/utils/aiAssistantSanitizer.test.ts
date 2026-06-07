import { describe, expect, it } from "vitest";

import { sanitizeResponse, sanitizeText } from "./aiAssistantSanitizer";

describe("aiAssistantSanitizer", () => {
  it("redacts sensitive assistant keywords from free text", () => {
    const sanitized = sanitizeText(
      "CPF, phone, payload_json, review_notes, internal_notes, vector_json, embedding, api_key e traceback.",
    );

    expect(sanitized.toLowerCase()).not.toContain("cpf");
    expect(sanitized.toLowerCase()).not.toContain("phone");
    expect(sanitized.toLowerCase()).not.toContain("payload_json");
    expect(sanitized.toLowerCase()).not.toContain("review_notes");
    expect(sanitized.toLowerCase()).not.toContain("internal_notes");
    expect(sanitized.toLowerCase()).not.toContain("vector_json");
    expect(sanitized.toLowerCase()).not.toContain("embedding");
    expect(sanitized.toLowerCase()).not.toContain("api_key");
    expect(sanitized.toLowerCase()).not.toContain("traceback");
    expect(sanitized).toContain("[redacted-sensitive-term]");
  });

  it("removes sensitive keywords from nested response content", () => {
    const response = sanitizeResponse({
      ok: true,
      intent: "knowledge.search",
      tool_name: "search_knowledge",
      data: {
        chunks: [
          {
            source_title: "Regras",
            content: "CPF e payload_json nunca devem aparecer.",
          },
        ],
      },
      error_code: null,
      message: null,
      requires_approval: false,
      warnings: [],
    });

    const serialized = JSON.stringify(response).toLowerCase();
    expect(serialized).not.toContain("cpf");
    expect(serialized).not.toContain("payload_json");
  });
});
