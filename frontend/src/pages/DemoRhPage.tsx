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
import { JobImageMockFillPanel } from "../features/demo-rh/components/JobImageMockFillPanel";
import { DEMO_MOCK_SKILLS } from "../features/demo-rh/data/demoJobImageFill";
import {
  DEMO_JOBS,
  type DemoJobId,
  type DemoStepKey,
  type CandidateAction,
  type DemoCandidateView,
  type DemoJobDefinition,
} from "../features/demo-rh/data/demoJobs";
import type { JobFormValues } from "../features/jobs/jobFormConfig";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

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
  const [imageJobApplied, setImageJobApplied] = useState(false);
  const [imageJobData, setImageJobData] = useState<Partial<JobFormValues> | null>(null);

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

  function handleImageDemoApply(data: Partial<JobFormValues>) {
    setImageJobData(data);
    setImageJobApplied(true);
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

      <section data-testid="image-draft-section" className="space-y-4">
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-[hsl(var(--text))]">
            Criar vaga por imagem ou descrição
          </h2>
          <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
            Simule como um cartaz ou texto vira uma vaga estruturada.
          </p>
        </div>

        {imageJobApplied && imageJobData ? (
          <div
            data-testid="demo-job-filled-summary"
            className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950/30"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <h3 className="text-lg font-semibold text-emerald-900 dark:text-emerald-200">
                Vaga demo preenchida
              </h3>
            </div>
            <dl className="mt-4 grid gap-2 sm:grid-cols-2 text-sm">
              <div>
                <dt className="font-semibold text-emerald-800 dark:text-emerald-300">Cargo</dt>
                <dd className="text-emerald-700 dark:text-emerald-400">{imageJobData.title ?? "—"}</dd>
              </div>
              <div>
                <dt className="font-semibold text-emerald-800 dark:text-emerald-300">Área</dt>
                <dd className="text-emerald-700 dark:text-emerald-400">{imageJobData.job_area ?? "—"}</dd>
              </div>
              <div>
                <dt className="font-semibold text-emerald-800 dark:text-emerald-300">Local</dt>
                <dd className="text-emerald-700 dark:text-emerald-400">{imageJobData.location ?? "—"}</dd>
              </div>
            </dl>
            <div className="mt-4">
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                Skills sugeridas
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {DEMO_MOCK_SKILLS.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full border border-emerald-300 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900 dark:text-emerald-300"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-emerald-200 bg-white px-4 py-3 dark:border-emerald-800 dark:bg-emerald-900/40">
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                Próximo passo
              </p>
              <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-400">
                Ver candidatos demo
              </p>
            </div>
          </div>
        ) : (
          <JobImageMockFillPanel mode="demo" onDemoApply={handleImageDemoApply} />
        )}
      </section>
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
