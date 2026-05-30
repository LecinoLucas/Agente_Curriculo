import type { JobFormValues } from "../../jobs/jobFormConfig";

export const DEMO_DESCRIPTION =
  "Preciso contratar Assistente Fiscal para atuar na Central de Notas, em Jardim Goiás — Goiânia/GO. A pessoa será responsável por lançamento de notas fiscais de mercadorias e serviços, análise de retenções federais, estaduais e municipais, conferência de cálculos de ICMS e DIFAL e organização de arquivos digitais para auditoria. Requisitos: cursando Ciências Contábeis, noção básica em documentos fiscais, domínio básico de Excel e perfil organizado. Diferencial: conhecimento em Protheus e experiência com lançamento de notas fiscais. Regime CLT, salário R$ 2.258,57 + R$ 500 avaliação, horário de segunda a sexta das 08h às 18h, benefícios plano de saúde, plano odontológico, day off, TotalPass, vale-alimentação, vale-transporte e seguro de vida.";

export const MOCK_FILE_NAME = "cartaz_assistente_fiscal_marajo.png";

export const PRINCIPAL_FIELDS: [string, string][] = [
  ["Cargo", "Assistente Fiscal"],
  ["Área", "Central de Notas"],
  ["Unidade / Local", "Jardim Goiás — Goiânia/GO"],
  ["Regime", "CLT"],
  ["Faixa salarial", "R$ 2.258,57 + R$ 500 avaliação"],
  ["Horário", "Seg a Sex | 08h às 18h"],
  ["Modalidade", "Presencial"],
];

export const ACTIVITIES = [
  "Lançamento de notas fiscais de mercadorias e serviços",
  "Análise técnica de retenções federais, estaduais e municipais",
  "Conferência de cálculos de ICMS e DIFAL",
  "Organização de arquivos digitais para auditoria",
];

export const REQUIREMENTS = [
  "Ensino superior em Ciências Contábeis cursando",
  "Noção básica em documentos fiscais",
  "Domínio básico de Excel",
  "Perfil organizado e analítico",
];

export const DIFFERENTIALS = [
  "Conhecimento no sistema Protheus",
  "Experiência com lançamento de notas fiscais",
];

export const BENEFITS = [
  "Plano de Saúde",
  "Plano Odontológico",
  "Day Off",
  "TotalPass",
  "Vale-Alimentação",
  "Vale-Transporte",
  "Seguro de Vida",
];

export const DEMO_MOCK_SKILLS = [
  "Excel",
  "Documentos Fiscais",
  "ICMS",
  "DIFAL",
  "Retenções Tributárias",
  "Organização",
  "Auditoria",
  "Protheus",
  "Lançamento de Notas Fiscais",
];

export const MOCK_JOB_FILL_UPDATES: Partial<JobFormValues> = {
  title: "Assistente Fiscal",
  job_area: "Central de Notas",
  location: "Jardim Goiás — Goiânia/GO",
  work_model: "onsite",
  salary_min: 2258.57,
  description:
    "Buscamos um(a) Assistente Fiscal para atuar na Central de Notas, apoiando lançamentos fiscais, conferências tributárias e organização de documentos para auditoria. A pessoa atuará com análise de retenções, conferência de ICMS e DIFAL e suporte ao fluxo fiscal da operação, com foco em organização, atenção aos detalhes e domínio básico de Excel.",
  responsibilities: ACTIVITIES.join("\n"),
  requirements: REQUIREMENTS.join("\n"),
  experience_context: "Seg a Sex | 08h às 18h",
  behavioral_requirements: [
    "Perfil organizado e analítico",
    "Atenção aos detalhes em conferências fiscais",
    "Responsabilidade com prazos e documentação para auditoria",
  ],
};
