export type JobAiDraft = {
  title: string;
  area: string;
  work_model: string;
  location: string;
  description: string;
  responsibilities: string[];
  requirements: string[];
  mandatory_skills: string[];
  nice_to_have_skills: string[];
  screening_questions: string[];
  pipeline_steps: string[];
  needs_review: string[];
};

export const MOCK_JOB_AI_DRAFT: JobAiDraft = {
  title: "Operador de Caixa",
  area: "Atendimento / Operação",
  work_model: "on_site",
  location: "Marajó Centro",
  description:
    "Atendimento ao cliente, operação de caixa, recebimentos e apoio ao fechamento de turno.",
  responsibilities: [
    "Atender clientes com cordialidade.",
    "Operar caixa e registrar pagamentos.",
    "Lidar com dinheiro, cartões e comprovantes.",
    "Apoiar fechamento de turno.",
    "Manter organização do ambiente de atendimento.",
  ],
  requirements: [
    "Ensino médio completo.",
    "Boa comunicação.",
    "Disponibilidade para finais de semana.",
    "Atenção e responsabilidade com valores.",
  ],
  mandatory_skills: [
    "Atendimento ao cliente",
    "Operação de caixa",
    "Responsabilidade com dinheiro",
  ],
  nice_to_have_skills: ["Experiência anterior com caixa", "Experiência em varejo"],
  screening_questions: [
    "Você tem disponibilidade para trabalhar em escala 6x1?",
    "Já trabalhou operando caixa?",
    "Tem experiência com atendimento ao cliente?",
    "Tem disponibilidade aos finais de semana?",
  ],
  pipeline_steps: [
    "Triagem",
    "Entrevista RH",
    "Entrevista com gestor",
    "Decisão",
    "Pré-admissão",
  ],
  needs_review: ["salary_range", "unit"],
};

export const MOCK_AI_PROMPT_EXAMPLE =
  "Operador de Caixa para loja de varejo, turno integral, necessário experiência com atendimento ao cliente e operação de caixa.";
