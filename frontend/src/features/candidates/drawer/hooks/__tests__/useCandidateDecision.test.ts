import { describe, expect, it } from "vitest";

import { getCompatibilityGuidance } from "../useCandidateDecision";

describe("getCompatibilityGuidance", () => {
  it("não esconde o score atual quando já existe job_fit_score persistido", () => {
    const guidance = getCompatibilityGuidance({
      hasJobLink: true,
      hasResume: true,
      hasPersistedScore: true,
      analysisStatus: "processing",
    });

    expect(guidance).toBeNull();
  });

  it("mantém aguardando vaga quando não existe pipeline ativo", () => {
    const guidance = getCompatibilityGuidance({
      hasJobLink: false,
      hasResume: true,
      hasPersistedScore: false,
      analysisStatus: "completed",
    });

    expect(guidance).toEqual({
      title: "Aguardando vaga",
      description: "Associe o candidato a uma vaga para calcular a Aderência à Vaga.",
      tone: "neutral",
    });
  });

  it("mantém indisponível quando falta currículo e não existe score atual", () => {
    const guidance = getCompatibilityGuidance({
      hasJobLink: true,
      hasResume: false,
      hasPersistedScore: false,
      analysisStatus: "completed",
    });

    expect(guidance).toEqual({
      title: "Aderência à Vaga indisponível",
      description: "Envie um currículo para calcular a Aderência à Vaga.",
      tone: "neutral",
    });
  });
});
