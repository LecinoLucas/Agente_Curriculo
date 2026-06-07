import type { AiAssistantLocalNextAction } from "../types";

export type AssistantScreenDefinition = {
  id: string;
  label: string;
  path: string;
  domain:
    | "dashboard"
    | "job"
    | "candidate"
    | "pipeline"
    | "admission"
    | "admin"
    | "knowledge"
    | "ai"
    | "import"
    | "profile"
    | "audit"
    | "bi"
    | "settings"
    | "generic";
  description: string;
  aliases: string[];
  capabilities: Array<{
    id: string;
    label: string;
    description: string;
  }>;
  safetyNotes?: string[];
};

export const AI_SITE_MAP: AssistantScreenDefinition[] = [
  {
    id: "home-dashboard",
    label: "Dashboard Operacional",
    path: "/rh",
    domain: "dashboard",
    description: "Visão geral operacional e indicadores principais do RH.",
    aliases: ["dashboard", "home", "rh", "inicio", "inicial", "tela inicial", "central", "central rh"],
    capabilities: [
      { id: "view_metrics", label: "Ver indicadores", description: "Visualizar resumo de vagas e candidatos" }
    ]
  },
  {
    id: "job-list",
    label: "Vagas",
    path: "/vagas",
    domain: "job",
    description: "Lista completa de vagas abertas e fechadas.",
    aliases: ["vagas", "vaga", "lista de vagas", "oportunidades", "oportunidade"],
    capabilities: [
      { id: "view_jobs", label: "Ver vagas", description: "Visualizar todas as vagas" }
    ]
  },
  {
    id: "job-create",
    label: "Nova vaga",
    path: "/vagas/nova",
    domain: "job",
    description: "Tela para criação e edição de vagas, com suporte a preenchimento por IA.",
    aliases: ["nova vaga", "criar vaga", "cadastrar vaga", "cadastro de vaga", "criacao de vaga", "crio vaga", "cadastrar", "criar", "crio"],
    capabilities: [
      { id: "create_job", label: "Criar vaga", description: "Preencher formulário de nova vaga" }
    ],
    safetyNotes: ["O assistente não cria nem publica vagas automaticamente. Ele apenas orienta e abre a tela correta."]
  },
  {
    id: "pipeline-board",
    label: "Pipeline",
    path: "/pipeline",
    domain: "pipeline",
    description: "Visão kanban do andamento dos candidatos nas etapas da vaga.",
    aliases: ["pipeline", "funil", "kanban", "etapas", "processo seletivo", "processo da vaga"],
    capabilities: [
      { id: "view_pipeline", label: "Ver funil", description: "Acompanhar candidatos no processo" }
    ]
  },
  {
    id: "candidates-list",
    label: "Candidatos",
    path: "/candidatos",
    domain: "candidate",
    description: "Base completa de talentos e candidatos.",
    aliases: ["candidatos", "candidato", "curriculos", "curriculo", "cv", "talentos", "banco de talentos"],
    capabilities: [
      { id: "view_candidates", label: "Ver candidatos", description: "Buscar na base de talentos" }
    ]
  },
  {
    id: "candidates-import",
    label: "Importar CV",
    path: "/importar",
    domain: "import",
    description: "Importação de currículos em lote via arquivos PDF/DOCX.",
    aliases: ["importar cv", "importacao", "importar curriculo", "importar curriculos", "subir cv", "upload de cv", "importar", "importo"],
    capabilities: [
      { id: "import_cv", label: "Importar arquivos", description: "Fazer upload de currículos" }
    ]
  },
  {
    id: "candidates-import-google",
    label: "Importação por formulário",
    path: "/importar-formulario",
    domain: "import",
    description: "Integração para importar candidatos respondentes de formulários Google Forms.",
    aliases: ["importar formulario", "formulario do google", "google forms", "planilha"],
    capabilities: [
      { id: "import_forms", label: "Importar do Google Forms", description: "Puxar dados de planilhas de formulário" }
    ]
  },
  {
    id: "admission-list",
    label: "Admitidos",
    path: "/admitidos",
    domain: "admission",
    description: "Lista de candidatos em processo admissional ou já admitidos.",
    aliases: ["admitidos", "admissao", "admissoes", "pre admissao", "pre-admissao"],
    capabilities: [
      { id: "view_admissions", label: "Ver admissões", description: "Acompanhar fluxo admissional" }
    ]
  },
  {
    id: "admission-checklists",
    label: "Checklists admissionais",
    path: "/admissao/checklists",
    domain: "admission",
    description: "Gerenciamento de modelos de documentos exigidos por tipo de contratação.",
    aliases: ["checklists", "documentos admissionais", "modelos admissionais", "documentos admissao"],
    capabilities: [
      { id: "manage_checklists", label: "Gerenciar checklists", description: "Configurar documentos obrigatórios" }
    ]
  },
  {
    id: "admin-panel",
    label: "Painel Admin",
    path: "/admin",
    domain: "admin",
    description: "Área administrativa central para configurações do sistema.",
    aliases: ["admin", "painel admin", "configuracoes", "administracao", "configuracao"],
    capabilities: [
      { id: "admin_system", label: "Configurar sistema", description: "Acessar configurações gerais" }
    ]
  },
  {
    id: "admin-users",
    label: "Usuários",
    path: "/admin/usuarios",
    domain: "admin",
    description: "Gerenciamento de acessos, recrutadores e gestores do sistema.",
    aliases: ["usuarios", "acessos", "permissoes", "recrutadores", "gestores"],
    capabilities: [
      { id: "manage_users", label: "Gerenciar usuários", description: "Adicionar ou remover acessos" }
    ]
  },
  {
    id: "admin-cadastros",
    label: "Cadastros Base",
    path: "/admin/cadastros",
    domain: "admin",
    description: "Tabelas básicas como filiais, departamentos, skills e motivos de recusa.",
    aliases: ["cadastros", "tabelas", "departamentos", "filiais", "motivos"],
    capabilities: [
      { id: "manage_basics", label: "Gerenciar cadastros", description: "Configurar tabelas do sistema" }
    ]
  },
  {
    id: "admin-audit",
    label: "Auditoria",
    path: "/admin/auditoria",
    domain: "audit",
    description: "Logs de auditoria e rastreabilidade de ações críticas.",
    aliases: ["auditoria", "logs", "rastreabilidade", "historico do sistema"],
    capabilities: [
      { id: "view_logs", label: "Ver logs", description: "Consultar auditoria" }
    ]
  },
  {
    id: "admin-health",
    label: "Saúde do sistema",
    path: "/admin/health",
    domain: "admin",
    description: "Monitoramento de disponibilidade, filas, banco de dados e APIs.",
    aliases: ["saude", "health", "monitoramento", "status do sistema", "disponibilidade", "filas"],
    capabilities: [
      { id: "view_health", label: "Ver saúde", description: "Monitorar sistema" }
    ]
  },
  {
    id: "admin-ia",
    label: "Governança de IA",
    path: "/admin/ia",
    domain: "ai",
    description: "Laboratório e configurações de ativação das funcionalidades de IA.",
    aliases: ["ia", "inteligencia artificial", "laboratorio ia", "governanca ia", "configuracoes ia"],
    capabilities: [
      { id: "manage_ai", label: "Gerenciar IA", description: "Configurar comportamento da IA" }
    ]
  },
  {
    id: "admin-ai-credentials",
    label: "Credenciais IA",
    path: "/admin/ai-provider-credentials",
    domain: "ai",
    description: "Gerenciamento seguro de chaves de API para provedores (Gemini, OpenAI, etc).",
    aliases: ["credenciais ia", "chaves ia", "api keys", "provider", "provedor ia", "gemini", "openai"],
    capabilities: [
      { id: "manage_keys", label: "Gerenciar chaves", description: "Configurar API keys de IA" }
    ]
  },
  {
    id: "admin-knowledge",
    label: "Base de Conhecimento",
    path: "/admin/conhecimento",
    domain: "knowledge",
    description: "Gerenciamento dos documentos e diretrizes que alimentam as respostas do RAG.",
    aliases: ["base de conhecimento", "conhecimento", "rag", "documentos ia", "diretrizes"],
    capabilities: [
      { id: "manage_knowledge", label: "Gerenciar RAG", description: "Alimentar o assistente" }
    ]
  },
  {
    id: "admin-bi",
    label: "BI e Métricas",
    path: "/admin/bi",
    domain: "bi",
    description: "Painéis analíticos, relatórios e métricas de uso, incluindo consumo de IA.",
    aliases: ["bi", "metricas", "relatorios", "dashboard admin", "consumo", "custos", "tokens"],
    capabilities: [
      { id: "view_bi", label: "Ver métricas", description: "Consultar uso de tokens e SLAs" }
    ]
  },
  {
    id: "profile",
    label: "Meu Perfil",
    path: "/perfil",
    domain: "profile",
    description: "Configurações da sua conta de usuário e preferências.",
    aliases: ["perfil", "minha conta", "meus dados", "senha", "preferencias"],
    capabilities: [
      { id: "manage_profile", label: "Editar perfil", description: "Alterar dados da conta" }
    ]
  }
];

export function normalizeSiteMapInput(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .toLowerCase()
    .replace(/[^\w\s]/g, "") // remove pontuacao
    .trim();
}

export function searchSiteMap(input: string): AssistantScreenDefinition[] {
  let normalized = normalizeSiteMapInput(input);

  const synonyms: Record<string, string[]> = {
    "vaga": ["oportunidade", "oportunidades", "vagas"],
    "candidato": ["curriculo", "curriculos", "cv", "candidatos", "talento", "talentos"],
    "pipeline": ["funil", "kanban", "etapas"],
    "admissao": ["pre-admissao", "pre admissao", "admitidos", "admissoes"],
    "conhecimento": ["base de conhecimento", "rag"],
    "ia": ["inteligencia artificial", "gemini", "openai", "gpt", "claude"],
    "tokens": ["consumo", "custos"],
    "saude": ["health", "status", "disponibilidade"],
    "auditoria": ["logs", "rastreabilidade"],
    "admin": ["administracao", "configuracoes", "configuracao"]
  };

  const plurals: Record<string, string> = {
    "vagas": "vaga",
    "candidatos": "candidato",
    "curriculos": "curriculo",
    "admissoes": "admissao",
    "configuracoes": "configuracao",
    "telas": "tela"
  };

  // Simplificacao de plurais
  for (const [plural, singular] of Object.entries(plurals)) {
    normalized = normalized.replace(new RegExp(`\\b${plural}\\b`, "g"), singular);
  }

  const generics = [
    "tela", "pagina", "menu", "sistema", "tenho", "tem", "existe", "existem",
    "onde", "fica", "vejo", "qual", "quais", "uso", "para", "eu", "como",
    "acessar", "acesso", "ir", "navegar", "posso", "fazer", "no", "na",
    "relacionada", "relacionadas", "sobre", "o", "a", "os", "as", "um", "uma", "do", "da", "dos", "das", "de", "que"
  ];
  
  const words = normalized.split(/\s+/).filter(w => !generics.includes(w) && w.length > 0);
  const joinedInput = words.join(" ");

  if (joinedInput === "") {
    if (normalized.includes("quais telas") || normalized.includes("tela existem") || normalized.includes("o que posso fazer")) {
      return AI_SITE_MAP; // Vision general requested
    }
    return [];
  }

  // Se o usuário explicitamente pedir "criar vaga"
  if (normalized.includes("criar vaga") || normalized.includes("nova vaga") || normalized.includes("crio vaga") || normalized.includes("cadastrar vaga")) {
    const jobCreate = AI_SITE_MAP.find(s => s.id === "job-create");
    return jobCreate ? [jobCreate] : [];
  }

  const searchTerms = new Set<string>(words);
  for (const w of words) {
    for (const [key, syns] of Object.entries(synonyms)) {
      if (w === key || syns.includes(w)) {
        searchTerms.add(key);
        syns.forEach(s => searchTerms.add(s));
      }
    }
  }

  // Gather matches
  const matches = new Set<AssistantScreenDefinition>();

  // 1. Exact alias match or synonym match
  for (const screen of AI_SITE_MAP) {
    const screenAliases = screen.aliases.map(normalizeSiteMapInput);
    if (screenAliases.includes(joinedInput)) {
      matches.add(screen);
    }
  }

  // 2. Contains term match
  if (matches.size === 0) {
    for (const screen of AI_SITE_MAP) {
      const screenAliases = screen.aliases.map(normalizeSiteMapInput);
      const hasTermMatch = screenAliases.some(alias => 
        Array.from(searchTerms).some(term => {
          const aliasWords = alias.split(/\s+/);
          return aliasWords.includes(term);
        })
      );
      
      if (hasTermMatch) {
        matches.add(screen);
      }
    }
  }
  
  // Prioritize list views if asking broadly, or include both
  let results = Array.from(matches);
  
  if (results.some(r => r.domain === "job")) {
     if (words.includes("vaga")) {
       const jobList = AI_SITE_MAP.find(s => s.id === "job-list")!;
       const jobCreate = AI_SITE_MAP.find(s => s.id === "job-create")!;
       if (!results.includes(jobList)) results.push(jobList);
       if (!results.includes(jobCreate)) results.push(jobCreate);
     }
  }

  if (words.includes("candidato") || words.includes("curriculo") || words.includes("talento")) {
     const candList = AI_SITE_MAP.find(s => s.id === "candidates-list")!;
     const candImport = AI_SITE_MAP.find(s => s.id === "candidates-import")!;
     const candForms = AI_SITE_MAP.find(s => s.id === "candidates-import-google")!;
     if (!results.includes(candList)) results.push(candList);
     if (!results.includes(candImport)) results.push(candImport);
     if (!results.includes(candForms)) results.push(candForms);
  }

  // De-duplicate
  results = Array.from(new Set(results));
  
  return results;
}
