import { describe, expect, it } from "vitest";

import {
  maskCpf,
  maskEmail,
  maskPhone,
  redactSensitivePayload,
  summarizeSensitiveValue,
} from "../sensitiveDataMasking";

describe("sensitiveDataMasking", () => {
  it("masks direct CPF, email, phone and salary values", () => {
    const redacted = redactSensitivePayload({
      cpf: "123.456.789-90",
      email: "candidate@example.com",
      telefone: "(11) 99999-1234",
      salary_offer: 8500,
    });

    expect(redacted).toEqual({
      cpf: "***.***.***-90",
      email: "c***@example.com",
      telefone: "Telefone ***34",
      salary_offer: "Informado",
    });
  });

  it("redacts nested payloads and arrays", () => {
    const redacted = redactSensitivePayload({
      candidate: {
        contact: {
          email: "nested@example.com",
          cpf: "98765432100",
        },
        documents: [
          { type: "PIS", pis: "12345678901" },
          { type: "CTPS", ctps: "998877" },
        ],
      },
      bank_data: [{ banco: "001", agencia: "1234", conta: "000123-4" }],
    });

    expect(redacted).toEqual({
      candidate: {
        contact: {
          email: "n***@example.com",
          cpf: "***.***.***-00",
        },
        documents: [
          { type: "PIS", pis: "Informado" },
          { type: "CTPS", ctps: "Informado" },
        ],
      },
      bank_data: [{ banco: "Informado", agencia: "Informado", conta: "Informado" }],
    });
  });

  it("redacts address, RG and parent names by key", () => {
    const redacted = redactSensitivePayload({
      rg: "12.345.678-9",
      endereco_completo: "Rua A, 123",
      nome_mae: "Maria Silva",
      father_name: "Jose Silva",
    });

    expect(redacted).toEqual({
      rg: "Informado",
      endereco_completo: "Informado",
      nome_mae: "Informado",
      father_name: "Informado",
    });
  });

  it("preserves safe unknown fields", () => {
    const redacted = redactSensitivePayload({
      provider: "protheus",
      mode: "dry_run",
      job: { title: "Backend Engineer", department: "Engineering" },
      documents: [{ title: "CPF", status: "approved", document_id: "doc-1" }],
    });

    expect(redacted).toEqual({
      provider: "protheus",
      mode: "dry_run",
      job: { title: "Backend Engineer", department: "Engineering" },
      documents: [{ title: "CPF", status: "approved", document_id: "doc-1" }],
    });
  });

  it("redacts CPF and email embedded in free text", () => {
    const redacted = redactSensitivePayload({
      message: "Erro para candidate@example.com com CPF 123.456.789-90",
    });

    expect(redacted).toEqual({
      message: "Erro para c***@example.com com CPF ***.***.***-90",
    });
  });

  it("does not mutate the original object", () => {
    const original = {
      candidate: { email: "candidate@example.com", cpf: "123.456.789-90" },
      admission: { salary_offer: 8500 },
    };

    const redacted = redactSensitivePayload(original);

    expect(redacted).not.toBe(original);
    expect(redacted.candidate).not.toBe(original.candidate);
    expect(original).toEqual({
      candidate: { email: "candidate@example.com", cpf: "123.456.789-90" },
      admission: { salary_offer: 8500 },
    });
  });

  it("keeps standalone masking helpers stable", () => {
    expect(maskEmail("candidate@example.com")).toBe("c***@example.com");
    expect(maskCpf("390")).toBe("***.***.***-90");
    expect(maskPhone("+55 11 99999-1234")).toBe("Telefone ***34");
    expect(summarizeSensitiveValue(8500)).toBe("Informado");
    expect(summarizeSensitiveValue(null)).toBe("-");
  });
});
