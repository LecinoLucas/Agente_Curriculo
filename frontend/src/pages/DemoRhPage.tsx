import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Eye,
  FlaskConical,
  MessageCircle,
  RefreshCcw,
  Sparkles,
  ThumbsDown,
  UserCheck,
  Users,
} from "lucide-react";

import { PageHeader } from "../components/common/PageHeader";
import {
  createLocalScenario,
  generateBatchForJob,
  selectDemoJob,
} from "@/features/demo-rh/demoScenarioOrchestrator";
import { DemoScenario } from "@/features/demo-rh/types";
import { toast } from "@/shared/utils/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type DemoJobId = "frentista" | "operador-caixa" | "analista-dados";
type DemoStepKey = "vaga" | "candidatos" | "analise" | "ranking" | "decisao";

type CandidateAction = "Ver análise" | "Marcar entrevista" | "Copiar WhatsApp" | "Reprovar" | "Ir para decisão";

interface DemoCandidateView {
  id: string;
  name: string;
  phone: string;
  adherence: number;
  recommendation: string;
  strengths: string[];
  concerns: string[];
  recommendedAction: string;
}

interface DemoJobDraft {
  title: string;
  summary: string;
  responsibilities: string[];
  required: string[];
  niceToHave: string[];
  screeningQuestions: string[];
  suggestedStages: string[];
}

interface DemoJobDefinition {
  id: DemoJobId;
  orchestratorJobId: string;
  title: string;
  shortDescription: string;
  defaultDescription: string;
  draft: DemoJobDraft;
  candidates: DemoCandidateView[];
  extraCandidates: DemoCandidateView[];
}

const DEMO_JOBS: DemoJobDefinition[] = [
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

const DEMO_STEPS: Array<{ key: DemoStepKey; label: string; icon: typeof Briefcase }> = [
  { key: "vaga", label: "Criar vaga com IA", icon: Briefcase },
  { key: "candidatos", label: "Carregar candidatos", icon: Users },
  { key: "analise", label: "Analisar com IA", icon: Sparkles },
  { key: "ranking", label: "Ranking", icon: ClipboardList },
  { key: "decisao", label: "Entrevista/decisão", icon: UserCheck },
];

function getStepIndex(step: DemoStepKey) {
  return DEMO_STEPS.findIndex((item) => item.key === step);
}

function getNextStep(generated: boolean, loaded: boolean, analyzed: boolean): DemoStepKey {
  if (!generated) return "vaga";
  if (!loaded) return "candidatos";
  if (!analyzed) return "analise";
  return "ranking";
}

function statusClasses(status: "done" | "active" | "pending") {
  if (status === "done") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300";
  if (status === "active") return "border-[hsl(var(--primary))/0.35] bg-[hsl(var(--primary-soft))/0.7] text-[hsl(var(--primary))]";
  return "border-border bg-surface text-text-muted";
}

function byAdherenceDesc(a: DemoCandidateView, b: DemoCandidateView) {
  return b.adherence - a.adherence;
}

function demoToast(message: string) {
  toast.success(message, { key: "demo-rh" });
}

export function DemoRhPage() {
  const navigate = useNavigate();
  const [scenario, setScenario] = useState<DemoScenario | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<DemoJobId | null>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [generated, setGenerated] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadedExtra, setLoadedExtra] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [decisionCandidateId, setDecisionCandidateId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("Escolha uma vaga para iniciar uma demo local e sem persistência.");

  const selectedJob = useMemo(
    () => DEMO_JOBS.find((job) => job.id === selectedJobId) ?? null,
    [selectedJobId],
  );

  const activeStep = decisionCandidateId ? "decisao" : getNextStep(generated, loaded, analyzed);
  const visibleCandidates = useMemo(() => {
    if (!selectedJob || !loaded) return [];
    const candidates = loadedExtra ? [...selectedJob.candidates, ...selectedJob.extraCandidates] : selectedJob.candidates;
    return analyzed ? [...candidates].sort(byAdherenceDesc) : candidates;
  }, [analyzed, loaded, loadedExtra, selectedJob]);

  const selectedAnalysis = visibleCandidates.find((candidate) => candidate.id === selectedAnalysisId) ?? null;

  function resetFlowForJob(job: DemoJobDefinition) {
    const nextScenario = selectDemoJob(createLocalScenario(), job.orchestratorJobId);
    setScenario(nextScenario);
    setSelectedJobId(job.id);
    setJobDescription(job.defaultDescription);
    setGenerated(false);
    setLoaded(false);
    setLoadedExtra(false);
    setAnalyzed(false);
    setSelectedAnalysisId(null);
    setDecisionCandidateId(null);
    setFeedback(`Demo iniciada para ${job.title}.`);
    demoToast("Demo da vaga iniciada.");
  }

  function handleChangeJob() {
    setSelectedJobId(null);
    setJobDescription("");
    setGenerated(false);
    setLoaded(false);
    setLoadedExtra(false);
    setAnalyzed(false);
    setSelectedAnalysisId(null);
    setDecisionCandidateId(null);
    setFeedback("Escolha outra vaga para reiniciar o fluxo demo.");
  }

  function handleGenerateJob() {
    if (!selectedJob) return;
    setGenerated(true);
    setFeedback("Vaga gerada com IA simulada. Revise a estrutura e carregue candidatos exemplo.");
    demoToast("Vaga gerada com IA simulada.");
  }

  function handleLoadCandidates() {
    if (!selectedJob) return;
    setLoaded(true);
    setSelectedAnalysisId(null);
    setDecisionCandidateId(null);
    setFeedback(`${selectedJob.candidates.length} candidatos exemplo carregados para ${selectedJob.title}.`);
    demoToast("Candidatos exemplo carregados.");
  }

  function handleLoadMoreCandidates() {
    if (!selectedJob || loadedExtra) return;
    setLoadedExtra(true);
    setScenario((current) => (current ? generateBatchForJob(current, selectedJob.orchestratorJobId) : current));
    setFeedback("Mais candidatos exemplo foram adicionados ao fluxo simples.");
    demoToast("Mais candidatos exemplo carregados.");
  }

  function handleAnalyzeCandidates() {
    if (!selectedJob) return;
    setAnalyzed(true);
    setDecisionCandidateId(null);
    setFeedback("Análise simulada concluída. Ranking ordenado por aderência.");
    demoToast("Candidatos analisados com IA simulada.");
  }

  function handleCandidateAction(action: CandidateAction, candidate: DemoCandidateView) {
    if (action === "Copiar WhatsApp") {
      const message = `Olá, ${candidate.name}. Podemos falar sobre sua candidatura para ${selectedJob?.title}?`;
      void navigator.clipboard?.writeText(message);
    }

    if (action === "Ver análise") {
      setSelectedAnalysisId(candidate.id);
    }

    if (action === "Ir para decisão") {
      setDecisionCandidateId(candidate.id);
    }

    setFeedback(`${action}: ${candidate.name}.`);
    demoToast(`${action} registrado.`);
  }

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <section
        className="rounded-2xl border border-[hsl(var(--border))] bg-[linear-gradient(135deg,hsl(var(--surface))_0%,hsl(var(--surface-muted))_62%,hsl(var(--primary-soft))_100%)] p-4 shadow-sm sm:p-6"
        data-testid="demo-hero"
      >
        <PageHeader
          title="Demo RH"
          subtitle="Fluxo simples para vender a experiência: criar vaga, carregar candidatos, analisar, ranquear e decidir. Tudo local e simulado."
          actions={
            <Badge variant="secondary" className="gap-1.5 px-3 py-1 text-xs font-semibold">
              <FlaskConical className="h-3.5 w-3.5" />
              Frontend-only
            </Badge>
          }
        />

        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant="outline" className="text-xs">3 vagas demo</Badge>
          <Badge variant="outline" className="text-xs">IA simulada</Badge>
          <Badge variant="outline" className="text-xs">Sem persistência</Badge>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {selectedJob ? (
            <Button variant="outline" onClick={handleChangeJob} className="min-h-11 gap-1.5">
              <RefreshCcw className="h-4 w-4" />
              Trocar vaga demo
            </Button>
          ) : null}
          <Button variant="ghost" className="min-h-11" onClick={() => navigate("/dashboard")}>Voltar ao Dashboard</Button>
        </div>
      </section>

      <Alert className="border-[hsl(var(--primary))/0.28] bg-[hsl(var(--primary-soft))/0.55]" data-testid="scenario-feedback">
        <AlertDescription className="text-sm">
          {feedback}
          <span className="ml-2 text-xs text-text-muted">(Cenário local e simulado)</span>
        </AlertDescription>
      </Alert>

      {!selectedJob ? (
        <section className="grid gap-4 md:grid-cols-3" data-testid="job-picker">
          {DEMO_JOBS.map((job) => (
            <Card key={job.id} className="flex flex-col shadow-sm" data-testid={`job-card-${job.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-lg">{job.title}</CardTitle>
                  <Badge variant="outline" className="whitespace-nowrap text-xs">
                    {job.candidates.length + job.extraCandidates.length} candidatos
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <p className="text-sm leading-6 text-text-muted">{job.shortDescription}</p>
                <Button className="mt-auto min-h-11 w-full gap-1.5" onClick={() => resetFlowForJob(job)}>
                  Iniciar demo desta vaga
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </section>
      ) : (
        <>
          <Card className="shadow-sm" data-testid="active-demo">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-xl">{selectedJob.title}</CardTitle>
                  <p className="mt-1 text-sm text-text-muted">{selectedJob.shortDescription}</p>
                </div>
                <Badge variant="secondary" className="w-fit text-xs">{visibleCandidates.length || selectedJob.candidates.length} candidatos exemplo</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <ol className="grid gap-2 md:grid-cols-5" data-testid="demo-stepper">
                {DEMO_STEPS.map((step) => {
                  const stepIndex = getStepIndex(step.key);
                  const activeIndex = getStepIndex(activeStep);
                  const status = stepIndex < activeIndex ? "done" : step.key === activeStep ? "active" : "pending";
                  const Icon = step.icon;

                  return (
                    <li key={step.key} className={`rounded-xl border p-3 ${statusClasses(status)}`}>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        <p className="text-sm font-semibold">{stepIndex + 1}. {step.label}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <Card className="shadow-sm" data-testid="create-job-step">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Briefcase className="h-4 w-4 text-[hsl(var(--primary))]" />
                  Criar vaga com IA
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Textarea
                  aria-label="Descrição da vaga"
                  value={jobDescription}
                  onChange={(event) => setJobDescription(event.target.value)}
                  className="min-h-32 text-base"
                />
                <Button onClick={handleGenerateJob} className="min-h-11 gap-1.5">
                  <Sparkles className="h-4 w-4" />
                  Gerar vaga com IA
                </Button>

                {generated ? (
                  <div className="rounded-xl border border-border bg-[hsl(var(--surface-muted))/0.45] p-4" data-testid="ai-job-result">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <p className="font-semibold">{selectedJob.draft.title}</p>
                    </div>
                    <p className="mt-2 text-sm text-text-muted">{selectedJob.draft.summary}</p>
                    <StructuredList title="Responsabilidades" items={selectedJob.draft.responsibilities} />
                    <StructuredList title="Requisitos obrigatórios" items={selectedJob.draft.required} />
                    <StructuredList title="Diferenciais" items={selectedJob.draft.niceToHave} />
                    <StructuredList title="Perguntas de triagem" items={selectedJob.draft.screeningQuestions} />
                    <StructuredList title="Etapas sugeridas" items={selectedJob.draft.suggestedStages} />
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <div className="flex flex-col gap-4">
              <Card className="shadow-sm" data-testid="load-candidates-step">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Users className="h-4 w-4 text-[hsl(var(--primary))]" />
                    Carregar candidatos
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={handleLoadCandidates} disabled={!generated} className="min-h-11">
                      Carregar candidatos exemplo
                    </Button>
                    <Button onClick={handleLoadMoreCandidates} disabled={!loaded || loadedExtra} variant="outline" className="min-h-11">
                      Carregar mais candidatos exemplo
                    </Button>
                  </div>

                  {loaded ? (
                    <div className="grid gap-2" data-testid="candidate-list">
                      {visibleCandidates.map((candidate) => (
                        <div key={candidate.id} className="rounded-lg border border-border bg-surface p-3 text-sm">
                          <span className="font-semibold">{candidate.name}</span>
                          <span className="ml-2 text-text-muted">{candidate.recommendation}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-text-muted">Gere a vaga para liberar os candidatos exemplo desta vaga.</p>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-sm" data-testid="analyze-step">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="h-4 w-4 text-[hsl(var(--primary))]" />
                    Analisar com IA
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <Button onClick={handleAnalyzeCandidates} disabled={!loaded} className="min-h-11 w-fit">
                    Analisar candidatos com IA
                  </Button>
                  {analyzed ? (
                    <p className="text-sm text-text-muted">Ranking pronto e ordenado por aderência.</p>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </section>

          {analyzed ? (
            <Card className="shadow-sm" data-testid="ranking-section">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClipboardList className="h-4 w-4 text-[hsl(var(--primary))]" />
                  Ranking
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {visibleCandidates.map((candidate, index) => (
                  <article key={candidate.id} className="rounded-xl border border-border bg-surface p-4" data-testid="ranking-candidate">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-text-muted">#{index + 1}</p>
                        <h3 className="text-lg font-semibold">{candidate.name}</h3>
                        <p className="text-sm text-text-muted">{candidate.recommendation}</p>
                      </div>
                      <Badge variant="secondary" className="w-fit text-sm">{candidate.adherence}% aderência</Badge>
                    </div>

                    <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                      <InfoBlock title="Pontos fortes" items={candidate.strengths} />
                      <InfoBlock title="Pontos de atenção" items={candidate.concerns} />
                      <div>
                        <p className="font-semibold">Ação recomendada</p>
                        <p className="mt-1 text-text-muted">{candidate.recommendedAction}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2" aria-label={`Ações para ${candidate.name}`}>
                      <Button size="sm" variant="outline" onClick={() => handleCandidateAction("Ver análise", candidate)} className="gap-1.5">
                        <Eye className="h-3.5 w-3.5" />
                        Ver análise
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleCandidateAction("Marcar entrevista", candidate)} className="gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5" />
                        Marcar entrevista
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleCandidateAction("Copiar WhatsApp", candidate)} className="gap-1.5">
                        <MessageCircle className="h-3.5 w-3.5" />
                        Copiar WhatsApp
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleCandidateAction("Reprovar", candidate)} className="gap-1.5">
                        <ThumbsDown className="h-3.5 w-3.5" />
                        Reprovar
                      </Button>
                      <Button size="sm" onClick={() => handleCandidateAction("Ir para decisão", candidate)} className="gap-1.5">
                        <UserCheck className="h-3.5 w-3.5" />
                        Ir para decisão
                      </Button>
                    </div>
                  </article>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {selectedAnalysis ? (
            <Alert className="border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30" data-testid="analysis-detail">
              <AlertDescription className="text-sm">
                <strong>Análise de {selectedAnalysis.name}:</strong> {selectedAnalysis.adherence}% de aderência. {selectedAnalysis.recommendedAction}
              </AlertDescription>
            </Alert>
          ) : null}

          <span className="sr-only" data-testid="scenario-local-state">{scenario?.selectedJobId ?? "sem-cenario"}</span>
        </>
      )}
    </div>
  );
}

function StructuredList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-4">
      <p className="text-sm font-semibold">{title}</p>
      <ul className="mt-1 space-y-1 text-sm text-text-muted">
        {items.map((item) => (
          <li key={item}>- {item}</li>
        ))}
      </ul>
    </div>
  );
}

function InfoBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="font-semibold">{title}</p>
      <ul className="mt-1 space-y-1 text-text-muted">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
