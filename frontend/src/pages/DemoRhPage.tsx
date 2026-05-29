import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FlaskConical,
  Briefcase,
  Users,
  BrainCircuit,
  CalendarDays,
  ClipboardCheck,
  FileCheck2,
  LayoutDashboard,
  Info,
  Loader2,
  Sparkles,
  CheckCircle2,
  ChevronRight,
  ListChecks,
  Star,
  HelpCircle,
  Layers,
  ThumbsUp,
  AlertTriangle,
  XCircle,
  Phone,
  Eye,
  MessageCircle,
  UserPlus,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import { PageHeader } from "../components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// ─── Types ───────────────────────────────────────────────────────────────────

type DemoStep = "vaga" | "candidatos" | "entrevistas" | "decisao" | "pre_admissao";
type CandidateStatus = "pending" | "analyzed" | "interview_scheduled" | "rejected";

interface DemoVaga {
  titulo: string;
  resumo: string;
  responsabilidades: string[];
  requisitos: string[];
  diferenciais: string[];
  perguntas: string[];
  etapas: string[];
}

interface DemoCandidateAnalysis {
  aderencia: number;
  label: string;
  recomendacao: string;
  pontosFOrtes: string[];
  pontosAtencao: string[];
  perguntas: string[];
}

interface DemoInterview {
  date: string;
  time: string;
  type: "rh" | "technical";
  format: "online" | "presential";
  locationOrLink: string;
}

interface DemoCandidateRow {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  resumeSummary: string;
  status: CandidateStatus;
  analysis: DemoCandidateAnalysis | null;
  interview: DemoInterview | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STEPPER: Array<{ key: DemoStep; label: string }> = [
  { key: "vaga", label: "Vaga" },
  { key: "candidatos", label: "Candidatos" },
  { key: "entrevistas", label: "Entrevistas" },
  { key: "decisao", label: "Decisão" },
  { key: "pre_admissao", label: "Pré-admissão" },
];

const EXEMPLO_DESCRICAO =
  "Preciso contratar frentista para escala 12x36, atendimento ao cliente, ensino médio completo, boa comunicação e disponibilidade para trabalhar aos fins de semana.";

const RESULTADO_FRENTISTA: DemoVaga = {
  titulo: "Frentista",
  resumo:
    "Atendimento ao cliente, abastecimento de veículos e apoio nas rotinas operacionais do posto.",
  responsabilidades: [
    "Atender clientes com cordialidade.",
    "Realizar abastecimento de veículos.",
    "Apoiar a organização da pista.",
    "Seguir normas de segurança.",
    "Comunicar ocorrências ao responsável.",
  ],
  requisitos: [
    "Ensino médio completo.",
    "Boa comunicação.",
    "Disponibilidade para escala.",
    "Comprometimento com atendimento ao cliente.",
  ],
  diferenciais: [
    "Experiência em posto de combustível.",
    "Experiência com caixa ou atendimento.",
    "Facilidade para trabalhar em equipe.",
  ],
  perguntas: [
    "Você tem disponibilidade para escala 12x36?",
    "Já trabalhou com atendimento ao público?",
    "Possui experiência em posto de combustível?",
    "Tem facilidade para lidar com clientes?",
  ],
  etapas: ["Triagem", "Entrevista RH", "Entrevista com gestor", "Decisão", "Pré-admissão"],
};

const CANDIDATOS_EXEMPLO: DemoCandidateRow[] = [
  {
    id: "c1",
    fullName: "Ana Souza",
    phone: "(62) 99999-0000",
    email: "ana@email.com",
    resumeSummary:
      "Experiência de 2 anos com atendimento ao cliente, caixa e rotinas administrativas. Ensino médio completo. Disponibilidade para escala 12x36.",
    status: "pending",
    analysis: null,
    interview: null,
  },
  {
    id: "c2",
    fullName: "Carla Mendes",
    phone: "(62) 98888-1111",
    email: "carla@email.com",
    resumeSummary:
      "Experiência em posto de combustível, atendimento ao cliente, caixa e fechamento de turno.",
    status: "pending",
    analysis: null,
    interview: null,
  },
  {
    id: "c3",
    fullName: "João Lima",
    phone: "(62) 97777-2222",
    email: "joao@email.com",
    resumeSummary:
      "Experiência com vendas em loja, boa comunicação e disponibilidade de horário.",
    status: "pending",
    analysis: null,
    interview: null,
  },
  {
    id: "c4",
    fullName: "Pedro Alves",
    phone: "(62) 96666-3333",
    email: "pedro@email.com",
    resumeSummary:
      "Experiência em estoque e carga/descarga, sem atendimento ao público.",
    status: "pending",
    analysis: null,
    interview: null,
  },
  {
    id: "c5",
    fullName: "Marina Rocha",
    phone: "(62) 95555-4444",
    email: "marina@email.com",
    resumeSummary:
      "Atendimento ao cliente, rotinas administrativas e disponibilidade para fins de semana.",
    status: "pending",
    analysis: null,
    interview: null,
  },
];

const ANALISES_DEMO: Record<string, DemoCandidateAnalysis> = {
  c2: {
    aderencia: 91,
    label: "Forte aderência",
    recomendacao: "Avançar",
    pontosFOrtes: [
      "Experiência direta em posto de combustível.",
      "Atendimento ao cliente e caixa.",
      "Fechamento de turno.",
      "Disponibilidade para escala.",
    ],
    pontosAtencao: [
      "Confirmar disponibilidade de escala 12x36.",
      "Verificar experiência com diferentes tipos de veículo.",
    ],
    perguntas: [
      "Você tem experiência com caixa em posto de combustível?",
      "Conhece as normas de segurança em postos?",
      "Tem disponibilidade para todos os turnos?",
    ],
  },
  c1: {
    aderencia: 82,
    label: "Boa aderência",
    recomendacao: "Avançar",
    pontosFOrtes: [
      "Experiência com atendimento ao cliente.",
      "Vivência com caixa e rotinas administrativas.",
      "Ensino médio completo.",
      "Disponibilidade compatível com a escala.",
    ],
    pontosAtencao: [
      "Confirmar experiência específica em posto de combustível.",
      "Validar disponibilidade para finais de semana.",
    ],
    perguntas: [
      "Você já trabalhou em posto de combustível?",
      "Tem disponibilidade para escala 12x36?",
      "Como você lida com atendimento em horários de pico?",
    ],
  },
  c5: {
    aderencia: 76,
    label: "Avaliar com atenção",
    recomendacao: "Avaliar com atenção",
    pontosFOrtes: [
      "Atendimento ao cliente.",
      "Disponibilidade para fins de semana.",
      "Rotinas administrativas.",
    ],
    pontosAtencao: [
      "Sem experiência específica em posto de combustível.",
      "Perfil mais administrativo.",
    ],
    perguntas: [
      "Tem experiência com abastecimento de veículos?",
      "Como é sua disponibilidade de horário?",
    ],
  },
  c3: {
    aderencia: 64,
    label: "Avaliar com atenção",
    recomendacao: "Avaliar com atenção",
    pontosFOrtes: ["Boa comunicação.", "Disponibilidade de horário."],
    pontosAtencao: [
      "Sem experiência em posto de combustível.",
      "Vendas em loja é diferente de atendimento em posto.",
    ],
    perguntas: [
      "Tem disponibilidade para escala 12x36?",
      "Já trabalhou em ambiente semelhante a posto?",
    ],
  },
  c4: {
    aderencia: 42,
    label: "Não recomendado",
    recomendacao: "Não recomendado",
    pontosFOrtes: ["Ensino médio."],
    pontosAtencao: [
      "Sem experiência com atendimento ao cliente.",
      "Perfil operacional sem vivência com clientes.",
      "Pode não se adaptar ao ritmo de atendimento.",
    ],
    perguntas: [
      "Tem interesse em atendimento ao cliente?",
      "Disponibilidade para treinamento?",
    ],
  },
};

const PLACEHOLDER_STEPS = [
  {
    number: 1,
    icon: Briefcase,
    label: "Criar vaga com IA",
    description: "Descreva a vaga e gere os requisitos com IA.",
  },
  {
    number: 2,
    icon: Users,
    label: "Triagem de candidatos",
    description: "Receba e analise currículos em lote com IA.",
  },
  {
    number: 3,
    icon: CalendarDays,
    label: "Entrevistas",
    description: "Marque entrevistas e envie mensagem via WhatsApp.",
  },
  {
    number: 4,
    icon: ClipboardCheck,
    label: "Decisão",
    description: "Registre a decisão de contratação.",
  },
  {
    number: 5,
    icon: FileCheck2,
    label: "Pré-admissão",
    description: "Envie checklist de documentos ao candidato.",
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function aderenciaColor(pct: number) {
  if (pct >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-red-500 dark:text-red-400";
}

function statusLabel(s: CandidateStatus) {
  const map: Record<CandidateStatus, string> = {
    pending: "Aguardando análise",
    analyzed: "Analisado",
    interview_scheduled: "Entrevista marcada",
    rejected: "Reprovado",
  };
  return map[s];
}

function generateWhatsappMsg(name: string, vagaTitulo: string) {
  return `Olá, ${name}! Tudo bem? Somos do RH da Rede de Postos Marajó. Gostaríamos de agendar sua entrevista para a vaga de ${vagaTitulo}. Podemos confirmar por aqui?`;
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function DemoWarning() {
  return (
    <div
      className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300"
      role="note"
      aria-label="Aviso de demonstração"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>Esta tela é demonstrativa e não cria dados reais.</span>
    </div>
  );
}

function BulletList({ items, color }: { items: string[]; color: string }) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-sm text-text">
          <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${color}`} aria-hidden="true" />
          {item}
        </li>
      ))}
    </ul>
  );
}

function FormField({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-sm font-medium text-text">{label}</Label>
      {children}
    </div>
  );
}

// ─── DemoStepper ─────────────────────────────────────────────────────────────

function DemoStepper({ currentStep }: { currentStep: DemoStep }) {
  const currentIndex = STEPPER.findIndex((s) => s.key === currentStep);
  return (
    <nav aria-label="Etapas da demo" className="flex items-center gap-1 overflow-x-auto pb-1">
      {STEPPER.map((step, i) => {
        const isDone = i < currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <div key={step.key} className="flex items-center gap-1 shrink-0">
            <div
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                isDone
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                  : isCurrent
                    ? "bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] ring-1 ring-[hsl(var(--primary))]/30"
                    : "bg-[hsl(var(--surface))] text-text-muted border border-border"
              }`}
              aria-current={isCurrent ? "step" : undefined}
            >
              {isDone ? (
                <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
              ) : (
                <span aria-hidden="true">{i + 1}</span>
              )}
              {step.label}
            </div>
            {i < STEPPER.length - 1 && (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-muted/40" aria-hidden="true" />
            )}
          </div>
        );
      })}
    </nav>
  );
}

// ─── DemoSidebar ─────────────────────────────────────────────────────────────

function DemoSidebar({
  savedVaga,
  candidates,
  currentStep,
}: {
  savedVaga: DemoVaga | null;
  candidates: DemoCandidateRow[];
  currentStep: DemoStep;
}) {
  const total = candidates.length;
  const analisados = candidates.filter((c) => c.analysis !== null).length;
  const recomendados = candidates.filter((c) => c.analysis?.recomendacao === "Avançar").length;
  const entrevistas = candidates.filter((c) => c.status === "interview_scheduled").length;

  let proximaAcao = "Gerar e usar a vaga";
  if (savedVaga && total === 0) proximaAcao = "Carregar ou adicionar candidatos";
  else if (total > 0 && analisados === 0) proximaAcao = "Analisar candidatos com IA";
  else if (analisados > 0 && entrevistas === 0) proximaAcao = "Marcar entrevistas";
  else if (entrevistas > 0) proximaAcao = "Registrar decisão";

  let status = "Criando vaga";
  if (currentStep === "candidatos" && analisados > 0) status = "Triagem concluída";
  else if (currentStep === "candidatos") status = "Triagem de candidatos";
  else if (currentStep === "entrevistas") status = "Entrevistas";
  else if (currentStep === "decisao") status = "Decisão";
  else if (savedVaga && currentStep === "vaga") status = "Vaga criada";

  return (
    <aside aria-label="Resumo da demo" className="flex flex-col gap-3">
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-text">Resumo</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-text-muted uppercase tracking-wide">Vaga</span>
            <span
              className={savedVaga ? "font-semibold text-text" : "text-text-muted italic"}
              data-testid="sidebar-vaga"
            >
              {savedVaga ? savedVaga.titulo : "Nenhuma vaga criada"}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-text-muted uppercase tracking-wide">Total candidatos</span>
            <span className="font-semibold text-text" data-testid="sidebar-total">{total}</span>
          </div>
          {total > 0 && (
            <>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-text-muted uppercase tracking-wide">Analisados</span>
                <span className="font-semibold text-text" data-testid="sidebar-analisados">{analisados}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-text-muted uppercase tracking-wide">Recomendados</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400" data-testid="sidebar-recomendados">{recomendados}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-text-muted uppercase tracking-wide">Entrevistas marcadas</span>
                <span className="font-semibold text-text" data-testid="sidebar-entrevistas">{entrevistas}</span>
              </div>
            </>
          )}
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-text-muted uppercase tracking-wide">Status</span>
            <span className="font-medium text-[hsl(var(--primary))]" data-testid="sidebar-status">{status}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-text-muted uppercase tracking-wide">Próxima ação</span>
            <span className="text-text">{proximaAcao}</span>
          </div>
        </CardContent>
      </Card>
    </aside>
  );
}

// ─── VagaStep ────────────────────────────────────────────────────────────────

function VagaResultCard({ vaga, onUsar }: { vaga: DemoVaga; onUsar: () => void }) {
  return (
    <div className="flex flex-col gap-4" data-testid="vaga-result">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-text">{vaga.titulo}</h3>
          <p className="mt-0.5 text-sm text-text-muted">{vaga.resumo}</p>
        </div>
        <Badge variant="secondary" className="shrink-0 gap-1 text-xs">
          <Sparkles className="h-3 w-3" />
          IA Simulada
        </Badge>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wide">
            <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
            Responsabilidades
          </div>
          <BulletList items={vaga.responsabilidades} color="bg-[hsl(var(--primary))]" />
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wide">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            Requisitos obrigatórios
          </div>
          <BulletList items={vaga.requisitos} color="bg-emerald-500" />
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wide">
            <Star className="h-3.5 w-3.5" aria-hidden="true" />
            Diferenciais
          </div>
          <BulletList items={vaga.diferenciais} color="bg-amber-400" />
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wide">
            <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Perguntas de triagem
          </div>
          <BulletList items={vaga.perguntas} color="bg-violet-400" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wide">
          <Layers className="h-3.5 w-3.5" aria-hidden="true" />
          Etapas sugeridas
        </div>
        <div className="flex flex-wrap gap-2">
          {vaga.etapas.map((e, i) => (
            <span key={e} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs font-medium text-text">
              <span className="text-[hsl(var(--primary))] font-bold">{i + 1}.</span>
              {e}
            </span>
          ))}
        </div>
      </div>
      <Button onClick={onUsar} className="self-start gap-2">
        <CheckCircle2 className="h-4 w-4" />
        Usar esta vaga
      </Button>
    </div>
  );
}

function VagaStep({
  vagaDescription,
  onDescriptionChange,
  isGenerating,
  generatedVaga,
  validationError,
  onPreencherExemplo,
  onGerar,
  onUsar,
}: {
  vagaDescription: string;
  onDescriptionChange: (v: string) => void;
  isGenerating: boolean;
  generatedVaga: DemoVaga | null;
  validationError: string | null;
  onPreencherExemplo: () => void;
  onGerar: () => void;
  onUsar: () => void;
}) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Briefcase className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
          Criar vaga com IA
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!generatedVaga ? (
          <>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="vaga-descricao" className="text-sm font-medium text-text">
                Descreva a vaga em linguagem simples
              </label>
              <Textarea
                id="vaga-descricao"
                value={vagaDescription}
                onChange={(e) => onDescriptionChange(e.target.value)}
                placeholder="Ex.: Preciso contratar frentista para escala 12x36, atendimento ao cliente, ensino médio completo e disponibilidade aos fins de semana."
                rows={4}
                className="resize-none"
              />
              {validationError && (
                <p role="alert" className="text-xs text-red-500">{validationError}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={onPreencherExemplo}>
                Preencher exemplo
              </Button>
              <Button size="sm" onClick={onGerar} disabled={isGenerating} className="gap-2">
                {isGenerating ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Gerando vaga...</>
                ) : (
                  <><Sparkles className="h-3.5 w-3.5" aria-hidden="true" />Gerar vaga com IA</>
                )}
              </Button>
            </div>
          </>
        ) : (
          <VagaResultCard vaga={generatedVaga} onUsar={onUsar} />
        )}
      </CardContent>
    </Card>
  );
}

// ─── CandidateDetailPanel ────────────────────────────────────────────────────

function CandidateDetailPanel({
  candidate,
  vagaTitulo,
  onClose,
  onMarcarEntrevista,
  onReprovar,
}: {
  candidate: DemoCandidateRow;
  vagaTitulo: string;
  onClose: () => void;
  onMarcarEntrevista: () => void;
  onReprovar: () => void;
}) {
  const a = candidate.analysis;
  return (
    <Card className="shadow-sm border-[hsl(var(--primary))]/20" data-testid="detail-panel">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{candidate.fullName}</CardTitle>
            <p className="text-xs text-text-muted mt-0.5">Vaga: {vagaTitulo}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Fechar painel">
            <XCircle className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {a ? (
          <>
            <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
              <span className={`text-2xl font-extrabold ${aderenciaColor(a.aderencia)}`}>
                {a.aderencia}%
              </span>
              <div>
                <p className="text-sm font-semibold text-text">{a.label}</p>
                <p className="text-xs text-text-muted">{a.recomendacao}</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1 text-xs font-semibold text-emerald-600 uppercase tracking-wide">
                  <ThumbsUp className="h-3 w-3" aria-hidden="true" />
                  Pontos fortes
                </div>
                <BulletList items={a.pontosFOrtes} color="bg-emerald-500" />
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1 text-xs font-semibold text-amber-600 uppercase tracking-wide">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  Pontos de atenção
                </div>
                <BulletList items={a.pontosAtencao} color="bg-amber-400" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1 text-xs font-semibold text-text-muted uppercase tracking-wide">
                <HelpCircle className="h-3 w-3" aria-hidden="true" />
                Perguntas sugeridas
              </div>
              <BulletList items={a.perguntas} color="bg-violet-400" />
            </div>
            <p className="text-xs text-text-muted border-t border-border pt-2">
              Resultado demonstrativo. Em produção, a análise utiliza a IA configurada no sistema.
            </p>
            <div className="flex flex-wrap gap-2">
              {candidate.status !== "interview_scheduled" && (
                <Button size="sm" onClick={onMarcarEntrevista} className="gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Marcar entrevista
                </Button>
              )}
              {candidate.status !== "rejected" && (
                <Button size="sm" variant="destructive" onClick={onReprovar} className="gap-1.5">
                  <XCircle className="h-3.5 w-3.5" />
                  Reprovar
                </Button>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-text-muted">Aguardando análise IA.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── InterviewForm ────────────────────────────────────────────────────────────

function InterviewForm({
  candidateName,
  onSave,
  onCancel,
}: {
  candidateName: string;
  onSave: (interview: DemoInterview) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [type, setType] = useState<"" | "rh" | "technical">("");
  const [format, setFormat] = useState<"" | "online" | "presential">("");
  const [locationOrLink, setLocationOrLink] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    if (!date) { setError("Data é obrigatória."); return; }
    if (!time) { setError("Hora é obrigatória."); return; }
    if (!type) { setError("Tipo é obrigatório."); return; }
    if (!format) { setError("Formato é obrigatório."); return; }
    if (!locationOrLink.trim()) { setError("Local ou link é obrigatório."); return; }
    onSave({ date, time, type, format, locationOrLink: locationOrLink.trim() });
  }

  return (
    <Card className="shadow-sm" data-testid="interview-form">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-semibold">
            Marcar entrevista — {candidateName}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onCancel} aria-label="Cancelar entrevista">
            <XCircle className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField id="interview-date" label="Data">
            <Input id="interview-date" type="date" value={date} onChange={(e) => { setDate(e.target.value); setError(null); }} />
          </FormField>
          <FormField id="interview-time" label="Hora">
            <Input id="interview-time" type="time" value={time} onChange={(e) => { setTime(e.target.value); setError(null); }} />
          </FormField>
          <FormField id="interview-type" label="Tipo">
            <select
              id="interview-type"
              value={type}
              onChange={(e) => { setType(e.target.value as "rh" | "technical"); setError(null); }}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Selecione...</option>
              <option value="rh">RH</option>
              <option value="technical">Técnica</option>
            </select>
          </FormField>
          <FormField id="interview-format" label="Formato">
            <select
              id="interview-format"
              value={format}
              onChange={(e) => { setFormat(e.target.value as "online" | "presential"); setError(null); }}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Selecione...</option>
              <option value="online">Online</option>
              <option value="presential">Presencial</option>
            </select>
          </FormField>
        </div>
        <FormField id="interview-location" label="Local ou link">
          <Input
            id="interview-location"
            value={locationOrLink}
            onChange={(e) => { setLocationOrLink(e.target.value); setError(null); }}
            placeholder="https://meet.google.com/... ou endereço"
          />
        </FormField>
        {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave} className="gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Confirmar entrevista
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>Cancelar</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── AddCandidateForm ─────────────────────────────────────────────────────────

function AddCandidateForm({
  onAdd,
  onCancel,
}: {
  onAdd: (c: Omit<DemoCandidateRow, "id" | "status" | "analysis" | "interview">) => void;
  onCancel: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [resumeSummary, setResumeSummary] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    if (!fullName.trim()) { setError("Nome é obrigatório."); return; }
    if (!phone.trim()) { setError("Telefone é obrigatório."); return; }
    if (!email.trim()) { setError("E-mail é obrigatório."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("E-mail inválido."); return; }
    if (!resumeSummary.trim()) { setError("Resumo é obrigatório."); return; }
    onAdd({ fullName: fullName.trim(), phone: phone.trim(), email: email.trim(), resumeSummary: resumeSummary.trim() });
  }

  return (
    <Card className="shadow-sm" data-testid="add-candidate-form">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-semibold">Adicionar candidato manual</CardTitle>
          <Button variant="ghost" size="sm" onClick={onCancel} aria-label="Cancelar adição">
            <XCircle className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField id="add-nome" label="Nome">
            <Input id="add-nome" value={fullName} onChange={(e) => { setFullName(e.target.value); setError(null); }} placeholder="Nome completo" />
          </FormField>
          <FormField id="add-telefone" label="Telefone">
            <Input id="add-telefone" value={phone} onChange={(e) => { setPhone(e.target.value); setError(null); }} placeholder="(62) 99999-0000" />
          </FormField>
          <FormField id="add-email" label="E-mail">
            <Input id="add-email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }} placeholder="email@exemplo.com" />
          </FormField>
        </div>
        <FormField id="add-resumo" label="Resumo do currículo">
          <Textarea id="add-resumo" value={resumeSummary} onChange={(e) => { setResumeSummary(e.target.value); setError(null); }} rows={3} className="resize-none" placeholder="Descreva brevemente o perfil..." />
        </FormField>
        {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
        <div className="flex gap-2">
          <Button size="sm" onClick={handleAdd} className="gap-1.5">
            <UserPlus className="h-3.5 w-3.5" />
            Adicionar candidato
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>Cancelar</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── CandidatosStep ──────────────────────────────────────────────────────────

function CandidatosStep({
  candidates,
  isAnalyzing,
  savedVaga,
  selectedCandidateId,
  interviewTargetId,
  whatsappCopiedId,
  showAddForm,
  onCarregarExemplos,
  onAnalisarComIA,
  onVerAnalise,
  onCloseAnalise,
  onMarcarEntrevista,
  onCancelEntrevista,
  onSaveEntrevista,
  onCopiarWhatsapp,
  onReprovar,
  onAddManual,
  onCancelAddForm,
  onToggleAddForm,
  onIrParaDecisao,
}: {
  candidates: DemoCandidateRow[];
  isAnalyzing: boolean;
  savedVaga: DemoVaga;
  selectedCandidateId: string | null;
  interviewTargetId: string | null;
  whatsappCopiedId: string | null;
  showAddForm: boolean;
  onCarregarExemplos: () => void;
  onAnalisarComIA: () => void;
  onVerAnalise: (id: string) => void;
  onCloseAnalise: () => void;
  onMarcarEntrevista: (id: string) => void;
  onCancelEntrevista: () => void;
  onSaveEntrevista: (id: string, interview: DemoInterview) => void;
  onCopiarWhatsapp: (id: string) => void;
  onReprovar: (id: string) => void;
  onAddManual: (c: Omit<DemoCandidateRow, "id" | "status" | "analysis" | "interview">) => void;
  onCancelAddForm: () => void;
  onToggleAddForm: () => void;
  onIrParaDecisao: () => void;
}) {
  const anyAnalyzed = candidates.some((c) => c.analysis !== null);

  // Sort by aderência desc when analyzed
  const displayCandidates = anyAnalyzed
    ? [...candidates].sort((a, b) => (b.analysis?.aderencia ?? 0) - (a.analysis?.aderencia ?? 0))
    : candidates;

  const selectedCandidate = selectedCandidateId
    ? candidates.find((c) => c.id === selectedCandidateId) ?? null
    : null;

  const interviewTarget = interviewTargetId
    ? candidates.find((c) => c.id === interviewTargetId) ?? null
    : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Header card */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
            Candidatos recebidos
          </CardTitle>
          <p className="text-sm text-text-muted">
            Simule a triagem de currículos recebidos pelo RH.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onCarregarExemplos} disabled={candidates.length > 0}>
            Carregar candidatos exemplo
          </Button>
          <Button variant="outline" size="sm" onClick={onToggleAddForm} className="gap-1.5">
            {showAddForm ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Adicionar candidato manual
          </Button>
          <Button
            size="sm"
            onClick={onAnalisarComIA}
            disabled={isAnalyzing || candidates.length === 0 || anyAnalyzed}
            className="gap-1.5"
          >
            {isAnalyzing ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Analisando...</>
            ) : (
              <><BrainCircuit className="h-3.5 w-3.5" aria-hidden="true" />Analisar com IA</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Add form */}
      {showAddForm && (
        <AddCandidateForm
          onAdd={(data) => { onAddManual(data); }}
          onCancel={onCancelAddForm}
        />
      )}

      {/* Table */}
      {candidates.length > 0 && (
        <Card className="shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Lista de candidatos">
              <thead>
                <tr className="border-b border-border bg-surface">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wide">Candidato</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wide">Telefone</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wide">Aderência</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wide">Recomendação</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody>
                {displayCandidates.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0 hover:bg-surface/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-text">{c.fullName}</p>
                      <p className="text-xs text-text-muted">{c.email}</p>
                    </td>
                    <td className="px-4 py-3 text-text-muted">
                      <div className="flex items-center gap-1">
                        <Phone className="h-3 w-3" aria-hidden="true" />
                        {c.phone}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {c.analysis ? (
                        <span className={`font-bold ${aderenciaColor(c.analysis.aderencia)}`} data-testid={`aderencia-${c.id}`}>
                          {c.analysis.aderencia}%
                        </span>
                      ) : (
                        <span className="text-text-muted text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {c.analysis ? (
                        <span className="text-text text-xs">{c.analysis.recomendacao}</span>
                      ) : (
                        <span className="text-text-muted text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          c.status === "interview_scheduled"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : c.status === "rejected"
                              ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                              : c.status === "analyzed"
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                : "bg-surface text-text-muted border border-border"
                        }`}
                        data-testid={`status-${c.id}`}
                      >
                        {statusLabel(c.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 flex-wrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 gap-1 text-xs"
                          onClick={() => onVerAnalise(c.id)}
                          aria-label={`Ver análise de ${c.fullName}`}
                        >
                          <Eye className="h-3 w-3" />
                          Ver análise
                        </Button>
                        {c.status !== "interview_scheduled" && c.status !== "rejected" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 gap-1 text-xs"
                            onClick={() => onMarcarEntrevista(c.id)}
                            aria-label={`Marcar entrevista com ${c.fullName}`}
                          >
                            <CalendarDays className="h-3 w-3" />
                            Marcar entrevista
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 gap-1 text-xs"
                          onClick={() => onCopiarWhatsapp(c.id)}
                          aria-label={`Copiar WhatsApp de ${c.fullName}`}
                        >
                          {whatsappCopiedId === c.id ? (
                            <><CheckCircle2 className="h-3 w-3 text-emerald-500" />Copiado</>
                          ) : (
                            <><MessageCircle className="h-3 w-3" />WhatsApp</>
                          )}
                        </Button>
                        {c.status !== "rejected" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 gap-1 text-xs text-red-500 hover:text-red-600"
                            onClick={() => onReprovar(c.id)}
                            aria-label={`Reprovar ${c.fullName}`}
                          >
                            <XCircle className="h-3 w-3" />
                            Reprovar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Detail panel */}
      {selectedCandidate && (
        <CandidateDetailPanel
          candidate={selectedCandidate}
          vagaTitulo={savedVaga.titulo}
          onClose={onCloseAnalise}
          onMarcarEntrevista={() => onMarcarEntrevista(selectedCandidate.id)}
          onReprovar={() => onReprovar(selectedCandidate.id)}
        />
      )}

      {/* Interview form */}
      {interviewTarget && (
        <InterviewForm
          candidateName={interviewTarget.fullName}
          onSave={(interview) => onSaveEntrevista(interviewTarget.id, interview)}
          onCancel={onCancelEntrevista}
        />
      )}

      {/* Bottom actions */}
      {candidates.length > 0 && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={onIrParaDecisao} className="gap-1.5">
            <ChevronRight className="h-3.5 w-3.5" />
            Ir para decisão
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Placeholder steps ────────────────────────────────────────────────────────

function DecisaoPlaceholderStep() {
  return (
    <Card className="shadow-sm" data-testid="decisao-step">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
          Registrar decisão
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-text-muted">
          Etapa em construção. Na próxima fase você poderá registrar a decisão de contratação.
        </p>
      </CardContent>
    </Card>
  );
}

function EntrevistaPlaceholderStep() {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
          Entrevistas
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-text-muted">
          Etapa em construção. Na próxima fase você poderá ver e gerenciar as entrevistas agendadas.
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DemoRhPage() {
  const navigate = useNavigate();

  // Vaga
  const [demoStarted, setDemoStarted] = useState(false);
  const [currentStep, setCurrentStep] = useState<DemoStep>("vaga");
  const [vagaDescription, setVagaDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVaga, setGeneratedVaga] = useState<DemoVaga | null>(null);
  const [savedVaga, setSavedVaga] = useState<DemoVaga | null>(null);
  const [vagaValidationError, setVagaValidationError] = useState<string | null>(null);

  // Candidatos
  const [candidates, setCandidates] = useState<DemoCandidateRow[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [interviewTargetId, setInterviewTargetId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [whatsappCopiedId, setWhatsappCopiedId] = useState<string | null>(null);

  function handleGerarVaga() {
    if (!vagaDescription.trim()) {
      setVagaValidationError("Descreva a vaga antes de gerar.");
      return;
    }
    setVagaValidationError(null);
    setIsGenerating(true);
    setTimeout(() => {
      setGeneratedVaga(RESULTADO_FRENTISTA);
      setIsGenerating(false);
    }, 1000);
  }

  function handleUsarVaga() {
    if (!generatedVaga) return;
    setSavedVaga(generatedVaga);
    setCurrentStep("candidatos");
  }

  function handleCarregarExemplos() {
    setCandidates(CANDIDATOS_EXEMPLO.map((c) => ({ ...c })));
  }

  function handleAnalisarComIA() {
    if (candidates.length === 0) return;
    setIsAnalyzing(true);
    setTimeout(() => {
      setCandidates((prev) =>
        prev.map((c) => {
          const analise = ANALISES_DEMO[c.id];
          return analise
            ? { ...c, analysis: analise, status: "analyzed" as CandidateStatus }
            : c;
        }),
      );
      setIsAnalyzing(false);
    }, 1000);
  }

  function handleAddManual(data: Omit<DemoCandidateRow, "id" | "status" | "analysis" | "interview">) {
    const newId = `manual-${Date.now()}`;
    setCandidates((prev) => [...prev, { ...data, id: newId, status: "pending", analysis: null, interview: null }]);
    setShowAddForm(false);
  }

  function handleSaveEntrevista(id: string, interview: DemoInterview) {
    setCandidates((prev) =>
      prev.map((c) => c.id === id ? { ...c, interview, status: "interview_scheduled" } : c),
    );
    setInterviewTargetId(null);
    setSelectedCandidateId(null);
  }

  function handleReprovar(id: string) {
    setCandidates((prev) =>
      prev.map((c) => c.id === id ? { ...c, status: "rejected" } : c),
    );
    if (selectedCandidateId === id) setSelectedCandidateId(null);
  }

  async function handleCopiarWhatsapp(id: string) {
    const candidate = candidates.find((c) => c.id === id);
    if (!candidate || !savedVaga) return;
    const msg = generateWhatsappMsg(candidate.fullName, savedVaga.titulo);
    try {
      await navigator.clipboard.writeText(msg);
      setWhatsappCopiedId(id);
    } catch {
      // silently fail in demo
    }
  }

  // ── Placeholder view ──
  if (!demoStarted) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader
          title="Fluxo RH Simples"
          subtitle="Demonstração do processo de vaga, candidatos, entrevistas e decisão."
          actions={
            <Badge variant="secondary" className="gap-1.5 text-xs font-semibold px-3 py-1">
              <FlaskConical className="h-3.5 w-3.5" />
              Demo
            </Badge>
          }
        />
        <DemoWarning />
        <Card className="shadow-sm">
          <CardContent className="pt-6">
            <p className="mb-6 text-sm font-medium text-text-muted">Etapas do fluxo</p>
            <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PLACEHOLDER_STEPS.map((step) => {
                const Icon = step.icon;
                return (
                  <li key={step.number} className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text">
                        <span className="mr-1 text-[hsl(var(--primary))]">{step.number}.</span>
                        {step.label}
                      </p>
                      <p className="mt-0.5 text-xs text-text-muted leading-snug">{step.description}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => setDemoStarted(true)} aria-label="Começar demo">
            <FlaskConical className="mr-2 h-4 w-4" />
            Começar demo
          </Button>
          <Button variant="ghost" onClick={() => navigate("/dashboard")} aria-label="Voltar ao Dashboard">
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Voltar ao Dashboard
          </Button>
        </div>
      </div>
    );
  }

  // ── Active demo view ──
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Fluxo RH Simples"
        subtitle="Demonstração do processo de vaga, candidatos, entrevistas e decisão."
        actions={
          <Badge variant="secondary" className="gap-1.5 text-xs font-semibold px-3 py-1">
            <FlaskConical className="h-3.5 w-3.5" />
            Demo
          </Badge>
        }
      />
      <DemoWarning />
      <DemoStepper currentStep={currentStep} />

      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        <div>
          {currentStep === "vaga" && (
            <VagaStep
              vagaDescription={vagaDescription}
              onDescriptionChange={(v) => {
                setVagaDescription(v);
                if (vagaValidationError) setVagaValidationError(null);
              }}
              isGenerating={isGenerating}
              generatedVaga={generatedVaga}
              validationError={vagaValidationError}
              onPreencherExemplo={() => {
                setVagaDescription(EXEMPLO_DESCRICAO);
                setVagaValidationError(null);
              }}
              onGerar={handleGerarVaga}
              onUsar={handleUsarVaga}
            />
          )}
          {currentStep === "candidatos" && savedVaga && (
            <CandidatosStep
              candidates={candidates}
              isAnalyzing={isAnalyzing}
              savedVaga={savedVaga}
              selectedCandidateId={selectedCandidateId}
              interviewTargetId={interviewTargetId}
              whatsappCopiedId={whatsappCopiedId}
              showAddForm={showAddForm}
              onCarregarExemplos={handleCarregarExemplos}
              onAnalisarComIA={handleAnalisarComIA}
              onVerAnalise={(id) => { setSelectedCandidateId(id); setInterviewTargetId(null); }}
              onCloseAnalise={() => setSelectedCandidateId(null)}
              onMarcarEntrevista={(id) => { setInterviewTargetId(id); setSelectedCandidateId(null); }}
              onCancelEntrevista={() => setInterviewTargetId(null)}
              onSaveEntrevista={handleSaveEntrevista}
              onCopiarWhatsapp={(id) => void handleCopiarWhatsapp(id)}
              onReprovar={handleReprovar}
              onAddManual={handleAddManual}
              onCancelAddForm={() => setShowAddForm(false)}
              onToggleAddForm={() => setShowAddForm((v) => !v)}
              onIrParaDecisao={() => setCurrentStep("decisao")}
            />
          )}
          {currentStep === "entrevistas" && <EntrevistaPlaceholderStep />}
          {currentStep === "decisao" && <DecisaoPlaceholderStep />}
        </div>

        <DemoSidebar
          savedVaga={savedVaga}
          candidates={candidates}
          currentStep={currentStep}
        />
      </div>
    </div>
  );
}
