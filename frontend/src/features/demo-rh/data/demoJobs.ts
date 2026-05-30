export type DemoJobId = "frentista" | "operador-caixa" | "analista-dados";

export type DemoStepKey = "vaga" | "candidatos" | "analise" | "ranking" | "decisao";

export type CandidateAction =
  | "Ver análise"
  | "Marcar entrevista"
  | "Copiar WhatsApp"
  | "Reprovar"
  | "Ir para decisão";

export interface DemoCandidateView {
  id: string;
  name: string;
  phone: string;
  adherence: number;
  recommendation: string;
  strengths: string[];
  concerns: string[];
  recommendedAction: string;
}

export interface DemoJobDraft {
  title: string;
  summary: string;
  responsibilities: string[];
  required: string[];
  niceToHave: string[];
  screeningQuestions: string[];
  suggestedStages: string[];
}

export interface DemoJobDefinition {
  id: DemoJobId;
  orchestratorJobId: string;
  title: string;
  shortDescription: string;
  defaultDescription: string;
  draft: DemoJobDraft;
  candidates: DemoCandidateView[];
  extraCandidates: DemoCandidateView[];
}

export const DEMO_JOBS: DemoJobDefinition[] = [
  {
    id: "frentista",
    orchestratorJobId: "job-frentista",
    title: "Frentista",
    shortDescription: "Atendimento em pista, abastecimento, venda consultiva e rotina operacional de posto.",
    defaultDescription:
      "Precisamos contratar frentistas para atendimento em pista, com foco em segurança, simpatia no atendimento, disponibilidade de escala e venda de produtos adicionais.",
    draft: {
      title: "Frentista",
      summary: "Profissional para atendimento ao cliente em pista, abastecimento seguro e apoio comercial no posto.",
      responsibilities: [
        "Realizar abastecimento seguindo normas de segurança.",
        "Atender clientes com agilidade e cordialidade.",
        "Oferecer produtos e serviços complementares.",
        "Manter organização básica da ilha de atendimento.",
      ],
      required: ["Ensino médio completo ou em andamento.", "Disponibilidade para escala.", "Boa comunicação com clientes."],
      niceToHave: ["Experiência em atendimento presencial.", "Vivência em metas de venda."],
      screeningQuestions: [
        "Você tem disponibilidade para trabalhar em escala?",
        "Já atuou com atendimento direto ao público?",
        "Tem facilidade para oferecer produtos adicionais?",
      ],
      suggestedStages: ["Triagem rápida", "Entrevista RH", "Teste prático em pista", "Decisão"],
    },
    candidates: [
      {
        id: "frentista-ana",
        name: "Ana Souza",
        phone: "+55 11 98888-0101",
        adherence: 94,
        recommendation: "Priorizar entrevista",
        strengths: ["Experiência em posto", "Boa comunicação", "Disponibilidade imediata"],
        concerns: ["Confirmar escala noturna"],
        recommendedAction: "Marcar entrevista ainda hoje.",
      },
      {
        id: "frentista-carla",
        name: "Carla Mendes",
        phone: "+55 11 97777-0202",
        adherence: 87,
        recommendation: "Avançar",
        strengths: ["Atendimento ao cliente", "Histórico em vendas", "Perfil cordial"],
        concerns: ["Pouca experiência com rotina de pista"],
        recommendedAction: "Entrevista RH com foco em segurança operacional.",
      },
      {
        id: "frentista-joao",
        name: "João Lima",
        phone: "+55 11 96666-0303",
        adherence: 73,
        recommendation: "Avaliar com cautela",
        strengths: ["Disponibilidade de horário", "Aprendizado rápido"],
        concerns: ["Sem experiência no setor", "Comunicação objetiva demais"],
        recommendedAction: "Manter como reserva após triagem.",
      },
    ],
    extraCandidates: [
      {
        id: "frentista-talita",
        name: "Talita Maia",
        phone: "+55 11 95555-0404",
        adherence: 81,
        recommendation: "Avançar se houver vaga",
        strengths: ["Atendimento presencial", "Boa estabilidade profissional"],
        concerns: ["Precisa ajustar disponibilidade"],
        recommendedAction: "Confirmar escala antes de entrevista.",
      },
    ],
  },
  {
    id: "operador-caixa",
    orchestratorJobId: "job-frentista",
    title: "Operador de Caixa",
    shortDescription: "Caixa de loja de conveniência com atendimento, fechamento e controle básico de valores.",
    defaultDescription:
      "Buscamos operador de caixa para loja de conveniência, com atenção a valores, atendimento cordial, organização e disponibilidade para escala.",
    draft: {
      title: "Operador de Caixa",
      summary: "Responsável pelo atendimento no caixa, registro de compras, conferência de valores e suporte à loja.",
      responsibilities: [
        "Registrar vendas e receber pagamentos.",
        "Conferir abertura e fechamento de caixa.",
        "Apoiar organização da loja e atendimento ao cliente.",
        "Sinalizar divergências de valores ou estoque.",
      ],
      required: ["Atenção a detalhes.", "Noções básicas de informática.", "Disponibilidade para escala."],
      niceToHave: ["Experiência com caixa.", "Vivência em loja de conveniência ou varejo."],
      screeningQuestions: [
        "Você já trabalhou com fechamento de caixa?",
        "Tem disponibilidade para fins de semana?",
        "Como lida com divergência de valores?",
      ],
      suggestedStages: ["Triagem", "Entrevista RH", "Teste de atenção", "Decisão"],
    },
    candidates: [
      {
        id: "caixa-maria",
        name: "Maria Oliveira",
        phone: "+55 11 94444-0505",
        adherence: 91,
        recommendation: "Priorizar entrevista",
        strengths: ["Experiência em caixa", "Fechamento diário", "Perfil atento"],
        concerns: ["Confirmar disponibilidade aos domingos"],
        recommendedAction: "Marcar entrevista e validar escala.",
      },
      {
        id: "caixa-lucas",
        name: "Lucas Pereira",
        phone: "+55 11 93333-0606",
        adherence: 84,
        recommendation: "Avançar",
        strengths: ["Varejo alimentar", "Boa postura de atendimento"],
        concerns: ["Pouca vivência com alto volume"],
        recommendedAction: "Aplicar teste simples de atenção.",
      },
      {
        id: "caixa-renata",
        name: "Renata Bello",
        phone: "+55 11 92222-0707",
        adherence: 76,
        recommendation: "Banco de talentos",
        strengths: ["Organização", "Disponibilidade imediata"],
        concerns: ["Sem experiência formal em caixa"],
        recommendedAction: "Reavaliar se faltar candidato com experiência.",
      },
    ],
    extraCandidates: [
      {
        id: "caixa-paulo",
        name: "Paulo Madeira",
        phone: "+55 11 91111-0808",
        adherence: 79,
        recommendation: "Avaliar",
        strengths: ["Experiência em atendimento", "Boa comunicação"],
        concerns: ["Precisa treinar operação de caixa"],
        recommendedAction: "Triagem rápida por telefone.",
      },
    ],
  },
  {
    id: "analista-dados",
    orchestratorJobId: "job-analista-dados-senior",
    title: "Analista de Dados",
    shortDescription: "Análise de indicadores, SQL, dashboards e apoio a decisões de negócio.",
    defaultDescription:
      "Contratar analista de dados para estruturar indicadores, consultar bases SQL, construir dashboards e apoiar áreas de negócio com análises recorrentes.",
    draft: {
      title: "Analista de Dados",
      summary: "Profissional para transformar dados operacionais em indicadores, dashboards e recomendações acionáveis.",
      responsibilities: [
        "Criar consultas SQL e validar qualidade dos dados.",
        "Construir dashboards executivos e operacionais.",
        "Apoiar áreas de negócio com análises recorrentes.",
        "Documentar métricas e critérios de cálculo.",
      ],
      required: ["SQL intermediário.", "Experiência com BI ou dashboards.", "Raciocínio analítico e comunicação clara."],
      niceToHave: ["Python para análise de dados.", "Conhecimento de métricas de RH ou varejo."],
      screeningQuestions: [
        "Conte um dashboard que você construiu do zero.",
        "Como você valida a qualidade de uma base?",
        "Qual seu nível de SQL?",
      ],
      suggestedStages: ["Triagem técnica", "Entrevista RH", "Case curto de dados", "Decisão"],
    },
    candidates: [
      {
        id: "dados-aline",
        name: "Aline Matos",
        phone: "+55 11 90000-0909",
        adherence: 96,
        recommendation: "Top match",
        strengths: ["SQL avançado", "Dashboards executivos", "Boa comunicação"],
        concerns: ["Pretensão salarial no limite"],
        recommendedAction: "Enviar case técnico curto.",
      },
      {
        id: "dados-bruno",
        name: "Bruno Leite",
        phone: "+55 11 98888-1010",
        adherence: 88,
        recommendation: "Avançar",
        strengths: ["Power BI", "Indicadores comerciais", "Boa trajetória"],
        concerns: ["Python básico"],
        recommendedAction: "Entrevista técnica focada em SQL.",
      },
      {
        id: "dados-carina",
        name: "Carina Costa",
        phone: "+55 11 97777-1111",
        adherence: 72,
        recommendation: "Avaliar como júnior",
        strengths: ["Boa base estatística", "Aprende rápido"],
        concerns: ["Pouca experiência com stakeholders"],
        recommendedAction: "Manter para vaga mais júnior.",
      },
    ],
    extraCandidates: [
      {
        id: "dados-gisele",
        name: "Gisele Araújo",
        phone: "+55 11 96666-1212",
        adherence: 90,
        recommendation: "Avançar",
        strengths: ["SQL consistente", "Experiência em automações"],
        concerns: ["Validar profundidade em BI"],
        recommendedAction: "Incluir na shortlist técnica.",
      },
    ],
  },
];
