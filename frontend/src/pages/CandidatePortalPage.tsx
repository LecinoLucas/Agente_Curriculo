import {
  Briefcase,
  CheckCircle2,
  ClipboardCheck,
  Circle,
  Clock3,
  FileText,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  ShieldCheck,
  Upload,
  Home,
  User,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Calendar,
  TrendingUp,
  Heart,
  Hourglass,
  Lightbulb,
  Bell,
  Moon,
  Sun,
  Flag,
  Rocket,
  HelpCircle,
  Info,
  Search,
  Users,
  Sparkles,
} from "lucide-react";
import { ChangeEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import {
  candidatePortalService,
  type CandidatePortalActiveApplication,
  type CandidatePortalApplication,
  type CandidatePortalOverview,
  type CandidatePortalPublicInterview,
  type CandidatePortalTimeline,
  type CandidatePortalTimelineStep,
  type BehavioralAssignmentAnswerPayload,
  type BehavioralAssignmentDetail,
  type BehavioralAssignmentSummary,
  type CandidatePortalPreAdmissionEnvelope,
} from "../services/candidatePortalService";
import { communicationService } from "../services/communicationService";
import { HttpError } from "../services/http";
import { formatPhone } from "../features/public-application/utils/phone";
import { toast } from "../shared/utils/toast";
import { BehavioralAssessmentCard } from "../features/candidate-portal/components/BehavioralAssessmentCard";
import { BehavioralAssessmentForm } from "../features/candidate-portal/components/BehavioralAssessmentForm";
import { CandidateMessagesCard } from "../features/candidate-portal/components/CandidateMessagesCard";
import { CandidatePortalPreAdmissionSummaryCard } from "../features/candidate-portal/components/CandidatePortalPreAdmissionSummaryCard";
import { useTheme } from "../hooks/useTheme";
import { useVisualTheme } from "../hooks/useVisualTheme";

type ContactFormState = {
  email: string;
  phone: string;
  city: string;
  state: string;
};

const EMPTY_CONTACT_FORM: ContactFormState = {
  email: "",
  phone: "",
  city: "",
  state: "",
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function sourceLabel(value: string | null): string {
  if (value === "public_application") return "Candidatura pública";
  if (value === "manual") return "Cadastro manual";
  if (value === "public_google") return "Google";
  return "Não informado";
}

const PUBLIC_STAGE_LABELS: Record<string, string> = {
  entry: "Inscrição recebida",
  screening: "Em triagem",
  hr_interview: "Entrevista",
  technical_interview: "Entrevista",
  final: "Etapa final",
  offer: "Proposta",
  hired: "Contratado",
  pre_admission: "Pré-admissão",
  protheus: "Integração admissional",
  admitted: "Admitido",
  rejected: "Processo encerrado",
};

function candidateSafeLabel(value: string | null | undefined): string {
  const label = (value ?? "").trim();
  if (!label) return "";
  if (label.toLowerCase() === "protheus") return "Integração admissional";
  if (label.toLowerCase() === "pre_admission") return "Pré-admissão";
  return label
    .replace(/\bProtheus\b/g, "Integração admissional")
    .replace(/\bpre_admission\b/g, "Pré-admissão")
    .replace(/\bexport package\b/gi, "pacote admissional")
    .replace(/\bpipeline\b/gi, "processo");
}

function candidateSafeStageLabel(value: string | null | undefined): string {
  if (!value) return "Aguardando atualização";
  return PUBLIC_STAGE_LABELS[value] ?? (candidateSafeLabel(value) || "Aguardando atualização");
}

function extractionLabel(value: string | null): string {
  if (value === "pending") return "Perfil em preparação";
  if (value === "processing") return "Perfil em processamento";
  if (value === "completed") return "Perfil pronto";
  if (value === "failed") return "Perfil indisponível";
  return "Aguardando processamento";
}

function buildContactForm(overview: CandidatePortalOverview): ContactFormState {
  return {
    email: overview.candidate.email ?? "",
    phone: overview.candidate.phone ?? "",
    city: overview.candidate.city ?? "",
    state: overview.candidate.state ?? "",
  };
}

function isIncompleteCandidateProfileError(error: unknown): boolean {
  if (!(error instanceof HttpError) || error.status !== 403) return false;
  if (!error.detail || typeof error.detail !== "object") return false;
  return (error.detail as Record<string, unknown>).code === "candidate_profile_incomplete";
}

function toCompletedAssessmentSummary(detail: BehavioralAssignmentDetail): BehavioralAssignmentSummary {
  return {
    id: detail.id,
    candidate_id: detail.candidate_id,
    job_id: detail.job_id,
    job_title: detail.job_title,
    template_id: detail.template_id,
    template_name: detail.template_name,
    status: "submitted",
    assigned_at: detail.assigned_at,
    started_at: detail.started_at,
    submitted_at: detail.submitted_at ?? new Date().toISOString(),
    expires_at: detail.expires_at,
    answered_count: detail.question_count,
    question_count: detail.question_count,
  };
}

function ApplicationCard({
  application,
}: {
  application: CandidatePortalApplication;
}) {
  return (
    <div className="group rounded-2xl border border-border/50 bg-card dark:bg-card/70 p-5 shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <p className="font-heading text-base font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
            {application.talent_pool
              ? "Banco de Talentos Marajó"
              : application.job_title || "Vaga vinculada"}
          </p>
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Clock3 className="h-3 w-3" />
            Enviada em {formatDate(application.submitted_at)}
          </p>
        </div>
        <span className="inline-flex w-fit items-center rounded-full bg-primary/10 px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-primary ring-1 ring-inset ring-primary/10">
          {candidateSafeLabel(application.status_label)}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border/30 pt-5 sm:grid-cols-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Origem</p>
          <p className="mt-1 text-xs font-semibold text-foreground">
            {sourceLabel(application.application_source)}
          </p>
        </div>

        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Currículo</p>
          <p className="mt-1 truncate text-xs font-semibold text-foreground">
            {application.resume_file_name || "Sem arquivo"}
          </p>
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Última Att</p>
          <p className="mt-1 text-xs font-semibold text-foreground">
            {formatDate(application.updated_at).split(',')[0]}
          </p>
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {application.talent_pool ? "Status Perfil" : "Situação"}
          </p>
          <p className="mt-1 text-xs font-bold text-primary">
            {application.talent_pool
              ? extractionLabel(application.talent_pool_profile_status)
              : candidateSafeLabel(application.status_label)}
          </p>
        </div>
      </div>
    </div>
  );
}

function formatInterviewDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function interviewFormatLabel(value: string | null): string | null {
  if (value === "online") return "Online";
  if (value === "presencial") return "Presencial";
  if (value === "telefone") return "Telefone";
  return null;
}

function getPublicInterview(overview: CandidatePortalOverview | null): CandidatePortalPublicInterview | null {
  if (!overview) return null;
  if (overview.public_interview) return overview.public_interview;
  return overview.public_timeline?.steps.find((step) => step.key === "interview" && step.interview)?.interview ?? null;
}

function CandidateInterviewInfo({ interview }: { interview: CandidatePortalPublicInterview | null }) {
  if (!interview) {
    return (
      <div className="mt-3 rounded-lg border border-border/70 bg-background px-3 py-2 text-sm text-muted-foreground">
        Nenhuma entrevista agendada no momento.
      </div>
    );
  }

  if (interview.status === "cancelled") {
    return (
      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Sua entrevista será reagendada. Nossa equipe entrará em contato.
      </div>
    );
  }

  if (!interview.scheduled_at) {
    return (
      <div className="mt-3 rounded-lg border border-border/70 bg-background px-3 py-2 text-sm text-muted-foreground">
        Você avançou para a etapa de entrevista. Nossa equipe entrará em contato para agendar.
      </div>
    );
  }

  const format = interview.interview_format_label ?? interviewFormatLabel(interview.interview_format);
  const typeLabel = interview.interview_type_label;
  const isCompletedInterview = interview.status === "completed" || interview.status === "awaiting_feedback";
  return (
    <div
      className={`mt-3 space-y-2 rounded-lg px-3 py-3 text-sm ${
        isCompletedInterview
          ? "border border-emerald-200 bg-emerald-50/70"
          : "border border-primary/20 bg-primary/5"
      }`}
    >
      <p className="font-medium text-foreground">
        {isCompletedInterview
          ? `Entrevista concluída em ${formatInterviewDate(interview.scheduled_at)}.`
          : `Entrevista agendada para ${formatInterviewDate(interview.scheduled_at)}.`}
      </p>
      {typeLabel ? <p className="text-muted-foreground">Tipo: {typeLabel}.</p> : null}
      {format ? <p className="text-muted-foreground">Formato: {format}.</p> : null}
      {interview.location ? <p className="text-muted-foreground">Local: {interview.location}</p> : null}
      {interview.meeting_url && !isCompletedInterview ? (
        <a
          href={interview.meeting_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex font-medium text-primary hover:underline"
        >
          Acessar link da entrevista
        </a>
      ) : null}
      {interview.public_notes ? (
        <p className="text-muted-foreground">{interview.public_notes}</p>
      ) : null}
    </div>
  );
}

function CandidateInterviewCard({ interview }: { interview: CandidatePortalPublicInterview | null }) {
  if (!interview) {
    return null;
  }

  return (
    <Card className="overflow-hidden border border-border rounded-2xl bg-card shadow-sm" data-testid="candidate-interview-card">
      <CardHeader className="p-4 pb-3 border-b border-border flex flex-row items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background">
          <Calendar className="h-4.5 w-4.5 text-foreground" strokeWidth={1.5} />
        </div>
        <div>
          <CardTitle className="text-sm font-semibold text-foreground tracking-tight">Entrevista</CardTitle>
          <CardDescription className="text-xs text-muted-foreground mt-0.5">
            Acompanhe aqui os dados públicos da sua entrevista no processo atual.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <div className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-2.5">
          {interview.status_label || "ENTREVISTA CONCLUÍDA"}
        </div>
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/50 px-3.5 py-2.5">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="text-xs font-medium text-emerald-900">
              Entrevista {interview.status === "completed" || interview.status === "awaiting_feedback" ? "concluída" : "agendada"} em {formatInterviewDate(interview.scheduled_at || "")}.
            </span>
          </div>
          <Calendar className="h-4 w-4 text-emerald-600/40 shrink-0" />
        </div>
      </CardContent>
    </Card>
  );
}

function stepIcon(step: CandidatePortalTimelineStep) {
  if (step.status === "completed") return <CheckCircle2 className="h-4 w-4" />;
  if (step.status === "current") return <Clock3 className="h-4 w-4" />;
  if (step.status === "closed") return <CheckCircle2 className="h-4 w-4" />;
  return <Circle className="h-4 w-4" />;
}

function getStepDescription(step: CandidatePortalTimelineStep): string {
  if (step.key === "application_received") {
    return "Recebemos sua candidatura e já estamos cuidando de tudo por aqui.";
  }
  if (step.key === "resume_analysis") {
    return "Seu currículo está sendo avaliado pelo time de recrutamento.";
  }
  if (step.key === "screening") {
    return "Nossa equipe está analisando seu perfil e experiência.";
  }
  if (step.key === "interview") {
    return "Seus dados se destacaram! Em breve entraremos em contato.";
  }
  if (step.key === "result") {
    return "Você será atualizado sobre o resultado do processo seletivo.";
  }
  return step.description;
}

export type CandidateVisibleStep = {
  key: string;
  title: string;
  status: "completed" | "current" | "next";
  description: string;
};

export function buildCandidateVisibleSteps(overview: CandidatePortalOverview | null): CandidateVisibleStep[] {
  if (overview?.application_status === "dismissed") {
    return [
      {
        key: "admission_completed",
        title: "Admissão concluída",
        status: "completed",
        description: "Sua admissão foi finalizada com sucesso."
      },
      {
        key: "result",
        title: "Vínculo encerrado",
        status: "current",
        description: "Seu vínculo admissional foi encerrado pela equipe de RH."
      }
    ];
  }

  if (overview?.application_status === "rejected") {
    return [
      {
        key: "resume_review",
        title: "Currículo analisado",
        status: "completed",
        description: "Seu currículo foi avaliado pelo time."
      },
      {
        key: "result",
        title: "Resultado",
        status: "current",
        description: "Não selecionado"
      }
    ];
  }

  const defaultSteps: CandidateVisibleStep[] = [
    {
      key: "application_received",
      title: "Inscrição recebida",
      status: "completed",
      description: "Recebemos sua candidatura."
    },
    {
      key: "resume_review",
      title: "Currículo em análise",
      status: "current",
      description: "Seu currículo está sendo avaliado pelo time."
    },
    {
      key: "next_update",
      title: "Próxima etapa",
      status: "next",
      description: "Avisaremos por aqui quando houver novidades."
    }
  ];

  if (!overview || !overview.public_timeline) {
    return defaultSteps;
  }

  const timeline = overview.public_timeline;
  const steps = timeline.steps;
  const currentStep = steps.find(s => s.status === "current");
  const publicInterview = getPublicInterview(overview);
  
  const isCompleted = steps.every(s => s.status === "completed" || s.status === "closed");
  const hasResult = currentStep?.key === "result" || isCompleted;
  const hasInterview = currentStep?.key === "interview" || publicInterview !== null;

  if (hasResult) {
    const hadInterview =
      publicInterview?.status === "completed" || publicInterview?.status === "awaiting_feedback";
    return [
      {
        key: hadInterview ? "interview" : "resume_review",
        title: hadInterview ? "Entrevista realizada" : "Currículo analisado",
        status: "completed",
        description: hadInterview ? "Sua entrevista foi concluída." : "Seu currículo foi avaliado pelo time."
      },
      {
        key: "result",
        title: "Resultado",
        status: "current",
        description: "Você será atualizado sobre o resultado do processo."
      },
      {
        key: "next_update",
        title: "Próxima etapa",
        status: "next",
        description: "Avisaremos por aqui quando houver novidades."
      }
    ];
  }

  if (hasInterview) {
    let description = "Seus dados se destacaram! Em breve entraremos em contato.";
    if (publicInterview?.status === "completed" || publicInterview?.status === "awaiting_feedback") {
      description = "Sua entrevista foi concluída.";
    } else if (publicInterview?.status === "cancelled") {
      description = "Sua entrevista será reagendada.";
    } else if (publicInterview?.scheduled_at) {
      description = `Entrevista agendada para ${formatInterviewDate(publicInterview.scheduled_at)}.`;
    }
    return [
      {
        key: "resume_review",
        title: "Currículo em análise",
        status: "completed",
        description: "Seu currículo foi avaliado pelo time."
      },
      {
        key: "interview",
        title: "Entrevista",
        status: "current",
        description: description
      },
      {
        key: "next_update",
        title: "Próxima etapa",
        status: "next",
        description: "Avisaremos por aqui quando houver novidades."
      }
    ];
  }

  return defaultSteps;
}

function CandidateHorizontalStepper({ overview }: { overview: CandidatePortalOverview | null }) {
  const visibleSteps = buildCandidateVisibleSteps(overview);
  const isRejected = overview?.application_status === "rejected";
  const isDismissed = overview?.application_status === "dismissed";

  // Map step keys to small icon badges shown below the bubbles
  const stepIconMap: Record<string, JSX.Element> = {
    application_received: <ClipboardCheck className="h-4 w-4" />,
    resume_review: <Search className="h-4 w-4" />,
    interview: <Users className="h-4 w-4" />,
    next_update: <Sparkles className="h-4 w-4" />,
    result: <CheckCircle2 className="h-4 w-4" />,
    admission_completed: <CheckCircle2 className="h-4 w-4" />,
  };

  // Calculate fill percentage for the connecting line
  const completedCount = visibleSteps.filter(s => s.status === "completed").length;
  const totalGaps = visibleSteps.length - 1;
  const fillPct = totalGaps > 0
    ? Math.round((completedCount / totalGaps) * 100)
    : 0;

  return (
    <Card className="overflow-hidden border border-border rounded-2xl bg-card shadow-sm p-5">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
          <Flag className="h-5 w-5" strokeWidth={2} />
        </div>
        <div>
          <CardTitle className="text-sm font-semibold text-foreground tracking-tight">Sua jornada de candidatura</CardTitle>
          <CardDescription className="text-xs text-muted-foreground mt-0.5">
            {isDismissed
              ? "O vínculo admissional foi encerrado."
              : isRejected
              ? "O processo desta vaga foi encerrado."
              : "Acompanhe as etapas do seu processo seletivo."}
          </CardDescription>
        </div>
      </div>

      {/* Stepper Row */}
      <div className="relative px-2">
        {/* Connecting line (full width, behind bubbles) */}
        <div className="absolute top-5 left-[calc(12.5%)] right-[calc(12.5%)] h-0.5 hidden md:block">
          {/* Solid fill up to completed */}
          <div className="absolute inset-0 flex">
            {/* Completed segment */}
            <div
              className="h-full bg-primary transition-all duration-700 rounded-l-full"
              style={{ width: `${fillPct}%` }}
            />
            {/* Dashed remaining */}
            <div
              className="flex-1 h-full"
              style={{
                backgroundImage: "repeating-linear-gradient(90deg, #CBD5E1 0, #CBD5E1 8px, transparent 8px, transparent 16px)",
              }}
            />
          </div>
        </div>

        <div className="relative flex flex-col md:flex-row items-start md:items-start justify-between gap-6 md:gap-2">
          {visibleSteps.map((step, idx) => {
            const isCompleted = step.status === "completed";
            const isCurrent = step.status === "current";
            const isNext = step.status === "next";
            const stepIcon = stepIconMap[step.key] ?? <Flag className="h-4 w-4" />;

            return (
              <div key={step.key} className="relative z-10 flex md:flex-col items-center md:text-center flex-1 gap-4 md:gap-0 w-full">
                {/* Bubble */}
                <div
                  className={`flex shrink-0 items-center justify-center rounded-full transition-all duration-300 ${
                    isCompleted
                      ? "h-10 w-10 bg-emerald-500 text-white shadow-sm"
                      : isCurrent
                      ? "h-12 w-12 bg-primary text-white ring-[5px] ring-primary/20 shadow-lg"
                      : "h-8 w-8 bg-slate-100 border-2 border-slate-200 text-slate-400"
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="h-6 w-6" strokeWidth={2.5} />
                  ) : isCurrent ? (
                    <div className="h-4 w-4 rounded-full bg-background" />
                  ) : null}
                </div>

                {/* Small icon badge below bubble */}
                <div
                  className={`hidden md:flex h-8 w-8 items-center justify-center rounded-full mt-3 ${
                    isCompleted
                      ? "bg-emerald-50 text-emerald-600"
                      : isCurrent
                      ? "bg-blue-50 text-primary"
                      : "bg-slate-50 text-slate-400"
                  }`}
                >
                  {stepIcon}
                </div>

                {/* Text Content */}
                <div className="flex flex-col md:items-center md:mt-2">
                  <p className={`text-xs font-semibold tracking-tight ${
                    isCurrent ? 'text-primary' : isCompleted ? 'text-slate-700' : 'text-slate-400'
                  }`}>
                    {step.title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground/80 font-medium max-w-[150px] leading-relaxed text-center">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Info alert with envelope illustration */}
      <div className="mt-8 flex items-center justify-between gap-4 rounded-xl bg-blue-50/60 border border-blue-100 p-5 overflow-hidden relative">
        <div className="flex items-start gap-4 relative z-10">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-white shrink-0">
            <Info className="h-4 w-4" strokeWidth={2.5} />
          </div>
          <div className="text-sm font-medium text-slate-700 leading-relaxed max-w-2xl">
            {isDismissed
              ? "Seu histórico admissional segue registrado e o RH pode prestar suporte quando necessário."
              : isRejected
              ? "Seu perfil continuará disponível em nosso banco de talentos para futuras oportunidades compatíveis."
              : "Estamos analisando seu perfil com cuidado e atenção. Assim que tivermos novidades, entraremos em contato por aqui ou por e-mail. 🙂"}
          </div>
        </div>
        {/* Abstract envelope illustration */}
        <div className="hidden sm:block shrink-0 opacity-90 pointer-events-none">
          <svg width="110" height="90" viewBox="0 0 110 90" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="10" y="15" width="80" height="58" rx="6" fill="#EFF6FF" stroke="#BFDBFE" strokeWidth="4"/>
            <path d="M10 25L50 52L90 25" stroke="#93C5FD" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
            {/* Paper plane */}
            <path d="M68 62L88 48L74 76L68 62Z" fill="#3B82F6" opacity="0.7"/>
            <path d="M68 62L88 48" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round"/>
            {/* Leaf decorations */}
            <path d="M90 70C92 65 98 63 98 63C98 63 96 69 90 70Z" fill="#86EFAC" />
            <path d="M96 75C94 70 96 64 96 64C96 64 100 69 96 75Z" fill="#4ADE80" opacity="0.7"/>
          </svg>
        </div>
      </div>
    </Card>
  );
}

function NextUpdateCard() {
  return (
    <Card className="overflow-hidden border border-border rounded-[1.25rem] bg-card dark:bg-card/70 dark:backdrop-blur-md shadow-xs p-5 flex flex-col justify-between h-full min-h-[220px]">
      <div>
        <CardTitle className="text-sm font-bold text-foreground mb-4">Próxima atualização</CardTitle>

        <div className="flex items-center gap-4 py-2">
          {/* Hourglass Icon inside a soft red circle */}
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/5">
            <Hourglass className="h-6 w-6 text-primary animate-pulse" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground leading-none">Previsão de retorno</p>
            <p className="text-lg font-black text-primary mt-1 leading-none">Em breve</p>
            <p className="text-xs text-muted-foreground mt-1.5 font-medium leading-relaxed">
              Avisaremos assim que houver novidades.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-muted/60 border border-border/50 p-3 text-xs font-semibold text-muted-foreground leading-tight">
        <Bell className="h-4 w-4 text-primary shrink-0" />
        <span>Fique atento ao seu e-mail e ao portal.</span>
      </div>
    </Card>
  );
}

function QuickSummaryCard({
  overview,
  activeApplication,
  closedProcessApplication,
  onOpenStatus,
}: {
  overview: CandidatePortalOverview | null;
  activeApplication: CandidatePortalActiveApplication | null;
  closedProcessApplication: CandidatePortalApplication | null;
  onOpenStatus: () => void;
}) {
  const vaga = activeApplication?.job_title || closedProcessApplication?.job_title || "Nenhuma vaga ativa";
  const etapa = candidateSafeStageLabel(activeApplication?.pipeline_stage);
  
  const resumeDate = overview?.latest_resume?.uploaded_at
    ? `recebido em ${new Date(overview.latest_resume.uploaded_at).toLocaleDateString("pt-BR")}`
    : "Não informado";

  const formatDateTime = (dateStr?: string | null) => {
    if (!dateStr) return "Não informado";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "Não informado";
      const date = d.toLocaleDateString("pt-BR");
      const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      return `${date} às ${time}`;
    } catch {
      return "Não informado";
    }
  };

  const ultimaAtualizacao = formatDateTime(activeApplication?.submitted_at || overview?.latest_resume?.uploaded_at);

  return (
    <Card className="overflow-hidden border border-border rounded-[1.25rem] bg-card dark:bg-card/70 dark:backdrop-blur-md shadow-xs p-5 flex flex-col justify-between h-full min-h-[220px]">
      <div>
        <CardTitle className="text-sm font-bold text-foreground mb-4">Resumo rápido</CardTitle>
        <div className="divide-y divide-border/60 text-xs font-semibold">
          {[
            { label: "Vaga", val: vaga, icon: <Briefcase className="h-4 w-4 text-muted-foreground shrink-0" /> },
            { label: "Etapa", val: etapa, icon: <Flag className="h-4 w-4 text-muted-foreground shrink-0" /> },
            { label: "Currículo", val: resumeDate, icon: <FileText className="h-4 w-4 text-muted-foreground shrink-0" /> },
            { label: "Última atualização", val: ultimaAtualizacao, icon: <Calendar className="h-4 w-4 text-muted-foreground shrink-0" /> },
          ].map((item, idx) => (
            <div key={idx} className="flex justify-between items-center py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-center gap-2.5 text-muted-foreground">
                {item.icon}
                <span>{item.label}</span>
              </div>
              <span className="text-foreground font-bold text-right truncate pl-4 flex-1 max-w-[220px]">
                {item.val}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 pt-3 flex justify-end border-t border-border/40">
        <button
          onClick={onOpenStatus}
          className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:text-primary/80 transition-colors"
          data-testid="quick-summary-open-status"
        >
          Abrir situação
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </Card>
  );
}

function TipsCard() {
  const tips = [
    {
      title: "Mantenha seu perfil atualizado",
      desc: "Isso aumenta suas chances.",
    },
    {
      title: "Destaque experiências relevantes",
      desc: "Mostre o que te torna especial.",
    },
    {
      title: "Acompanhe seu e-mail",
      desc: "Incluindo a caixa de spam.",
    },
  ];

  return (
    <Card className="overflow-hidden border border-border rounded-[1.25rem] bg-card dark:bg-card/70 dark:backdrop-blur-md shadow-xs p-5 flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Lightbulb className="h-5 w-5" />
          </div>
          <CardTitle className="text-sm font-bold text-foreground">Dicas para sua candidatura</CardTitle>
        </div>

        <ul className="space-y-3.5 my-3">
          {tips.map((tip, idx) => (
            <li key={idx} className="flex items-start gap-3">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary mt-0.5">
                <CheckCircle2 className="h-3 w-3 stroke-[3]" />
              </div>
              <div>
                <p className="text-xs font-bold text-foreground">{tip.title}</p>
                <p className="text-[11px] text-muted-foreground font-medium">{tip.desc}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4">
        <button
          type="button"
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-muted px-4 py-2.5 text-xs font-bold text-foreground hover:bg-primary/10 hover:text-primary transition-colors"
        >
          Ver todas as dicas
        </button>
      </div>
    </Card>
  );
}

function BottomIncentiveCard() {
  return (
    <Card className="overflow-hidden border border-primary/20 dark:border-primary/30 rounded-[1.25rem] bg-primary/5 dark:bg-card/75 dark:backdrop-blur-md p-4 sm:p-5 shadow-xs flex items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white dark:bg-muted text-primary border border-primary/10 shadow-xs">
          <Heart className="h-5 w-5 fill-primary text-primary" />
        </div>
        <div>
          <h4 className="text-sm font-extrabold text-foreground leading-tight">Você está no caminho certo.</h4>
          <p className="text-xs font-semibold text-muted-foreground mt-0.5">
            Nosso time está analisando seu perfil com cuidado.
          </p>
        </div>
      </div>

      {/* Mountain and Flag illustration */}
      <svg className="hidden md:block h-14 w-40 text-primary/15 shrink-0" viewBox="0 0 160 60" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 50 C 40 50, 70 35, 120 20" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" fill="none" />
        <path d="M60 20 L61.5 23 L64 24 L61.5 25 L60 28 L58.5 25 L56 24 L58.5 23 Z" fill="currentColor" opacity="0.6" />
        <path d="M100 12 L101 14 L103 14.5 L101 15 L100 17 L99 15 L97 14.5 L99 14 Z" fill="currentColor" opacity="0.4" />
        {/* Mountain */}
        <path d="M105 60 L125 20 L145 60 Z" fill="currentColor" opacity="0.2" />
        <path d="M115 60 L125 32 L135 60 Z" fill="currentColor" opacity="0.3" />
        {/* Flagpole */}
        <line x1="125" y1="20" x2="125" y2="5" stroke="currentColor" strokeWidth="1.5" />
        {/* Flag */}
        <path d="M125 5 L140 9 L125 13 Z" fill="currentColor" className="text-primary" />
      </svg>
    </Card>
  );
}

function getClosedProcessApplication(overview: CandidatePortalOverview): CandidatePortalApplication | null {
  if (
    overview.application_status !== "rejected"
    && overview.application_status !== "admitted"
    && overview.application_status !== "dismissed"
  ) {
    return null;
  }
  const targetStatus = overview.application_status === "rejected" ? "finished" : "admitted";
  return (
    overview.application_history.find((application) => application.status === targetStatus)
    ?? overview.application_history[0]
    ?? null
  );
}

function ProcessClosedCard({
  overview,
  application,
  requesting,
  onRequestContact,
  onUpdateResume,
}: {
  overview: CandidatePortalOverview;
  application: CandidatePortalApplication | null;
  requesting: boolean;
  onRequestContact: () => void;
  onUpdateResume: () => void;
}) {
  const jobTitle = application?.job_title || "esta vaga";
  const isDismissed = overview.application_status === "dismissed";
  const title = isDismissed ? "Processo admissional encerrado" : "Processo encerrado";
  const badge = isDismissed ? "Desligado" : "Não selecionado";
  const supportMessage = isDismissed
    ? "Seu histórico admissional continua registrado. Se precisar, solicite contato com o RH."
    : "Seu perfil continuará disponível em nosso banco de talentos e poderá ser considerado em futuras oportunidades compatíveis.";

  return (
    <Card className="overflow-hidden border border-border rounded-[1.25rem] bg-card dark:bg-card/70 shadow-xs">
      <CardHeader className="p-5 pb-4 border-b border-border">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <span className="inline-flex w-fit items-center rounded-full bg-primary/10 px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-primary">
              {jobTitle}
            </span>
            <CardTitle className="text-xl font-black text-foreground">{title}</CardTitle>
            <CardDescription className="max-w-2xl text-sm font-semibold leading-relaxed text-muted-foreground">
              {overview.closed_reason_public_label || "Você não foi selecionado para esta vaga no momento."}
            </CardDescription>
          </div>
          <span className="inline-flex w-fit items-center rounded-full border border-border bg-muted/30 px-3 py-1.5 text-xs font-bold text-foreground">
            {badge}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-5">
        <p className="rounded-xl border border-border bg-muted/30 p-4 text-sm font-medium leading-relaxed text-muted-foreground">
          {supportMessage}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {overview.can_request_contact ? (
            <Button
              type="button"
              onClick={onRequestContact}
              disabled={requesting || !application?.job_id}
              className="h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl"
            >
              {requesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
              Solicitar contato com o RH
            </Button>
          ) : null}
          {overview.can_apply_to_other_jobs ? (
            <Button asChild variant="outline" className="h-11 border-border bg-card dark:bg-card/70 font-bold rounded-xl text-foreground hover:bg-muted">
              <Link to="/candidato/cadastro">
                <Briefcase className="mr-2 h-4 w-4" />
                Ver outras vagas
              </Link>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={onUpdateResume}
            className="h-11 border-border bg-card dark:bg-card/70 font-bold rounded-xl text-foreground hover:bg-muted"
          >
            <Upload className="mr-2 h-4 w-4" />
            Atualizar currículo
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TalentPoolStatusCard({ onUpdateResume }: { onUpdateResume: () => void }) {
  return (
    <Card className="overflow-hidden border border-border rounded-[1.25rem] bg-card dark:bg-card/70 shadow-xs">
      <CardHeader className="p-5 pb-3 border-b border-border">
        <CardTitle className="text-xl font-black text-foreground">
          Você está em nosso banco de talentos
        </CardTitle>
        <CardDescription className="max-w-2xl text-sm font-semibold leading-relaxed text-muted-foreground">
          Seu perfil está disponível para futuras oportunidades compatíveis.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 p-5 sm:flex-row">
        <Button asChild className="h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl">
          <Link to="/candidato/cadastro">
            <Briefcase className="mr-2 h-4 w-4" />
            Ver outras vagas
          </Link>
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onUpdateResume}
          className="h-11 border-border bg-card dark:bg-card/70 font-bold rounded-xl text-foreground hover:bg-muted"
        >
          <Upload className="mr-2 h-4 w-4" />
          Atualizar currículo
        </Button>
      </CardContent>
    </Card>
  );
}

type NextStepItem = { label: string; status: string; icon: "user" | "phone" | "check" };

const buildCandidateNextSteps = (overview: CandidatePortalOverview | null): { subtitle: string; steps: NextStepItem[] } => {
  if (!overview || !overview.public_timeline) {
    return {
      subtitle: "Fique atento às atualizações. Se seu perfil avançar, avisaremos por aqui.",
      steps: [
        { label: "Análise do perfil", status: "Em andamento", icon: "user" },
        { label: "Atualização do RH", status: "Avisaremos por aqui", icon: "check" },
        { label: "Contato, se houver avanço", status: "Sem previsão no momento", icon: "phone" },
      ]
    };
  }

  const timeline = overview.public_timeline;
  const currentStep = timeline.steps.find(s => s.status === "current");
  const isCompleted = timeline.steps.every(s => s.status === "completed" || s.status === "closed");

  if (isCompleted || currentStep?.key === "result") {
    return {
      subtitle: "O processo seletivo foi finalizado para esta vaga.",
      steps: [
        { label: "Processo finalizado", status: "Concluído", icon: "check" },
        { label: "Resultado disponível", status: "Acesse o portal", icon: "check" }
      ]
    };
  }

  if (currentStep?.key === "interview" && currentStep.interview?.scheduled_at) {
    return {
      subtitle: "Você tem uma entrevista agendada. Prepare-se!",
      steps: [
        { label: "Entrevista", status: "Agendada", icon: "phone" },
        { label: "Preparação", status: "Confira data e horário", icon: "user" },
        { label: "Atualização do RH", status: "Após a entrevista", icon: "check" }
      ]
    };
  }

  if (currentStep && currentStep.key !== "application_received") {
    return {
      subtitle: "Seu perfil está em análise pela equipe de recrutamento.",
      steps: [
        { label: "Análise do perfil", status: "Em andamento", icon: "user" },
        { label: "Atualização do RH", status: "Avisaremos por aqui", icon: "check" }
      ]
    };
  }

  return {
    subtitle: "Fique atento às atualizações. Se seu perfil avançar, avisaremos por aqui.",
    steps: [
      { label: "Análise do perfil", status: "Em andamento", icon: "user" },
      { label: "Atualização do RH", status: "Avisaremos por aqui", icon: "check" },
      { label: "Contato, se houver avanço", status: "Sem previsão no momento", icon: "phone" }
    ]
  };
};

export function CandidatePortalPage() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { visualTheme, setVisualTheme } = useVisualTheme();

  const isDarkCandidate = theme === "dark" && visualTheme === "theme-dark-candidate";

  const toggleCandidateTheme = () => {
    if (isDarkCandidate) {
      setTheme("light");
      setVisualTheme("theme-1");
    } else {
      setTheme("dark");
      setVisualTheme("theme-dark-candidate");
    }
  };

  const [overview, setOverview] = useState<CandidatePortalOverview | null>(null);
  const [contactForm, setContactForm] = useState<ContactFormState>(EMPTY_CONTACT_FORM);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedAssessment, setSelectedAssessment] = useState<BehavioralAssignmentDetail | null>(null);
  const [behavioralAssessmentSummaries, setBehavioralAssessmentSummaries] = useState<BehavioralAssignmentSummary[]>([]);
  const [completedAssessment, setCompletedAssessment] = useState<BehavioralAssignmentSummary | null>(null);
  const [preAdmission, setPreAdmission] = useState<CandidatePortalPreAdmissionEnvelope | null>(null);
  const [assessmentLoadingId, setAssessmentLoadingId] = useState<string | null>(null);
  const [assessmentSaving, setAssessmentSaving] = useState(false);
  const [currentTab, setCurrentTab] = useState("inicio");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [messagesRefreshTrigger, setMessagesRefreshTrigger] = useState(0);
  const [activeMenuId, setActiveMenuId] = useState("inicio");
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [isRequestingContact, setIsRequestingContact] = useState(false);
  const [isTipsOpen, setIsTipsOpen] = useState(false);

  useEffect(() => {
    if (currentTab === "inicio" && activeMenuId !== "inicio") {
      setActiveMenuId("inicio");
    } else if (currentTab === "situacao" && activeMenuId !== "situacao") {
      setActiveMenuId("situacao");
    } else if (currentTab === "vagas" && activeMenuId !== "vagas" && activeMenuId !== "candidaturas") {
      setActiveMenuId("vagas");
    } else if (currentTab === "avaliacoes" && activeMenuId !== "avaliacoes") {
      setActiveMenuId("avaliacoes");
    } else if (currentTab === "mensagens" && activeMenuId !== "mensagens") {
      setActiveMenuId("mensagens");
    } else if (currentTab === "perfil" && activeMenuId !== "perfil") {
      setActiveMenuId("perfil");
    }
  }, [currentTab, activeMenuId]);

  const activeApplication: CandidatePortalActiveApplication | null =
    overview?.active_application ?? null;
  const publicInterview = getPublicInterview(overview);
  const applicationHistory: CandidatePortalApplication[] = overview?.application_history ?? [];
  const closedProcessApplication = overview ? getClosedProcessApplication(overview) : null;
  const isRejectedProcess = overview?.application_status === "rejected";
  const isClosedProcess = isRejectedProcess || overview?.application_status === "dismissed";
  const isAdmittedProcess = overview?.application_status === "admitted";
  const isTalentPoolOnly =
    overview?.application_status === "talent_pool" || overview?.application_status === "no_active_application";
  const behavioralAssessments: BehavioralAssignmentSummary[] = behavioralAssessmentSummaries;
  const pendingBehavioralAssessments =
    isClosedProcess || isAdmittedProcess
      ? []
      : behavioralAssessments.filter(
          (item) => item.status === "pending" || item.status === "in_progress",
        );

  const visibleSteps = buildCandidateVisibleSteps(overview);
  const currentStepObj = visibleSteps.find(s => s.status === "current") || (visibleSteps.length > 0 ? visibleSteps[visibleSteps.length - 1] : null);
  const currentStatusTitle = currentStepObj?.title || candidateSafeLabel(overview?.status_public) || "Currículo em análise";
  const currentStatusDesc = currentStepObj?.description || "Seu currículo está sendo avaliado pelo nosso time.";

  async function loadPortalData(refresh = false) {
    if (refresh) {
      setIsRefreshing(true);
      setMessagesRefreshTrigger((prev) => prev + 1);
    } else {
      setLoading(true);
    }
    setLoadError(null);

    try {
      const [overviewResponse, assessmentsResponse, preAdmissionResponse, communicationsResponse] = await Promise.all([
        candidatePortalService.getOverview(),
        candidatePortalService.listBehavioralAssessments(),
        candidatePortalService.getPreAdmission(),
        communicationService.getCandidateCommunications().catch(() => ({ communications: [] })),
      ]);
      setOverview(overviewResponse);
      setBehavioralAssessmentSummaries(assessmentsResponse);
      setPreAdmission(preAdmissionResponse);
      setContactForm(buildContactForm(overviewResponse));
      const unreadCount = (communicationsResponse?.communications || []).filter(
        (m: any) => m.status !== "read"
      ).length;
      setUnreadMessagesCount(unreadCount);
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) {
        navigate("/candidato", { replace: true });
        return;
      }
      if (isIncompleteCandidateProfileError(error)) {
        navigate("/candidato/cadastro", { replace: true });
        return;
      }
      const message =
        error instanceof Error ? error.message : "Não foi possível carregar o portal do candidato.";
      setLoadError(message);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPortalData();
  }, []);

  const handleContactChange = (field: keyof ContactFormState, value: string) => {
    setContactForm((current) => ({ ...current, [field]: value }));
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      await candidatePortalService.updateProfile({
        email: contactForm.email.trim() || null,
        phone: contactForm.phone.trim() || null,
        city: contactForm.city.trim() || null,
        state: contactForm.state.trim() || null,
      });
      await loadPortalData(true);
      setIsEditing(false);
      toast.success("Dados atualizados com sucesso.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível atualizar seus dados.";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResumeFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setResumeFile(event.target.files?.[0] ?? null);
  };

  const handleUploadResume = async () => {
    if (!resumeFile) {
      toast.error("Selecione um currículo em PDF.");
      return;
    }

    const formData = new FormData();
    formData.append("resume_file", resumeFile);

    setIsUploading(true);
    try {
      const response = await candidatePortalService.uploadResume(formData);
      toast.success(response.message);
      setResumeFile(null);
      await loadPortalData(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível enviar o currículo.";
      toast.error(message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRequestContact = async () => {
    if (!closedProcessApplication?.job_id) {
      toast.error("Não foi possível identificar a vaga deste processo.");
      return;
    }

    const jobTitle = closedProcessApplication.job_title || "vaga";
    setIsRequestingContact(true);
    try {
      await communicationService.requestCandidateContact({
        job_id: closedProcessApplication.job_id,
        subject: "Solicitação de contato sobre processo encerrado",
        body: `Olá, gostaria de solicitar contato sobre o processo seletivo da vaga ${jobTitle}.`,
      });
      toast.success("Solicitação enviada ao RH.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível solicitar contato com o RH.";
      toast.error(message);
    } finally {
      setIsRequestingContact(false);
    }
  };

  const handleLogout = async () => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("resume_ai_theme");
        window.localStorage.removeItem("visual-theme");
        window.localStorage.removeItem("theme:guest");
        Object.keys(window.localStorage).forEach((key) => {
          if (key.startsWith("theme:user:")) {
            window.localStorage.removeItem(key);
          }
        });
        window.sessionStorage.removeItem("resume_ai_theme");
      }
      await candidatePortalService.logout();
    } catch (error) {
      // Logout falhando no backend (ERR_EMPTY_RESPONSE, rede, etc.) não pode
      // bloquear a saída do portal. A sessão local é limpa abaixo no finally.
      console.warn("candidate.logout_failed", error);
    } finally {
      navigate("/candidato", { replace: true });
    }
  };

  const handleOpenAssessment = async (assignment: BehavioralAssignmentSummary) => {
    setAssessmentLoadingId(assignment.id);
    try {
      const detail =
        assignment.status === "pending"
          ? await candidatePortalService.startBehavioralAssessment(assignment.id)
          : await candidatePortalService.getBehavioralAssessment(assignment.id);
      setSelectedAssessment(detail);
      await loadPortalData(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível abrir a avaliação.";
      toast.error(message);
    } finally {
      setAssessmentLoadingId(null);
    }
  };

  const handleSaveAssessment = async (answers: BehavioralAssignmentAnswerPayload[]) => {
    if (!selectedAssessment) return;
    setAssessmentSaving(true);
    try {
      const detail = await candidatePortalService.saveBehavioralAnswers(selectedAssessment.id, answers);
      setSelectedAssessment(detail);
      await loadPortalData(true);
      toast.success("Rascunho salvo.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível salvar suas respostas.";
      toast.error(message);
    } finally {
      setAssessmentSaving(false);
    }
  };

  const handleSubmitAssessment = async (answers: BehavioralAssignmentAnswerPayload[]) => {
    if (!selectedAssessment || assessmentSaving) return;
    setAssessmentSaving(true);
    try {
      const detail = await candidatePortalService.submitBehavioralAssessment(selectedAssessment.id, answers);
      const completed = toCompletedAssessmentSummary(detail);
      setSelectedAssessment(null);
      setCompletedAssessment(completed);
      setBehavioralAssessmentSummaries((current) =>
        current.map((item) => (item.id === completed.id ? { ...item, ...completed } : item)),
      );
      setCurrentTab("inicio");
      await loadPortalData(true);
      toast.success("Avaliação concluída com sucesso.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível enviar a avaliação.";
      toast.error(message);
      throw error;
    } finally {
      setAssessmentSaving(false);
    }
  };

  const handleMenuClick = (menuId: string) => {
    setActiveMenuId(menuId);
    if (menuId === "candidaturas" || menuId === "vagas") {
      setCurrentTab("vagas");
    } else if (menuId === "avaliacoes") {
      setCurrentTab("avaliacoes");
    } else if (menuId === "perfil") {
      setCurrentTab("perfil");
    } else if (menuId === "mensagens") {
      setCurrentTab("mensagens");
    } else if (menuId === "situacao") {
      setCurrentTab("situacao");
    } else {
      setCurrentTab("inicio");
    }
    setIsSidebarOpen(false);
  };

  if (loadError || (!overview && !loading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-lg border border-border rounded-[1.25rem] bg-card shadow-md p-6">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl font-bold text-foreground">Portal Indisponível</CardTitle>
            <CardDescription className="text-muted-foreground">
              Não conseguimos sincronizar seus dados agora.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 text-center pt-2">
            <p className="text-sm text-muted-foreground font-medium">
              {loadError ?? "Sua sessão pode ter expirado por inatividade."}
            </p>
            <div className="flex flex-col gap-3">
              <Button 
                onClick={() => void loadPortalData()} 
                className="h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl shadow-sm transition-colors"
              >
                Tentar reconectar
              </Button>
              <Button variant="ghost" asChild className="text-muted-foreground hover:text-foreground font-bold">
                <Link to="/candidato">Voltar ao login</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">
      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 bg-[#0B1B3D] text-white transition-all duration-300 transform ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0 md:sticky md:top-0 md:h-screen md:flex md:flex-col w-[220px] shrink-0 shadow-xl overflow-hidden`}
      >
        {/* Wave background in sidebar */}
        <div className="absolute inset-0 pointer-events-none opacity-20 z-0">
          <svg className="absolute w-[200%] h-[150%] -left-1/2 -top-1/4" viewBox="0 0 800 800" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 400C200 300 400 500 800 300L800 800L0 800L0 400Z" fill="url(#paint0_linear)"/>
            <path d="M0 500C200 400 500 600 800 400L800 800L0 800L0 500Z" fill="url(#paint1_linear)"/>
            <defs>
              <linearGradient id="paint0_linear" x1="400" y1="300" x2="400" y2="800" gradientUnits="userSpaceOnUse">
                <stop stopColor="#3B82F6" stopOpacity="0.8"/>
                <stop offset="1" stopColor="#1E3A8A" stopOpacity="0"/>
              </linearGradient>
              <linearGradient id="paint1_linear" x1="400" y1="400" x2="400" y2="800" gradientUnits="userSpaceOnUse">
                <stop stopColor="#60A5FA" stopOpacity="0.5"/>
                <stop offset="1" stopColor="#1E3A8A" stopOpacity="0"/>
              </linearGradient>
            </defs>
          </svg>
        </div>

        <div className="flex items-center h-16 px-5 justify-between relative z-10">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center">
              {/* Marajó Abstract Triangle Logo */}
              <svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 5L35 30H5L20 5Z" fill="#38BDF8" opacity="0.8"/>
                <path d="M20 15L30 30H10L20 15Z" fill="#0EA5E9"/>
                <path d="M25 22L32 30H18L25 22Z" fill="#bae6fd"/>
              </svg>
            </div>
            <div className="flex flex-col text-left">
              <span className="font-heading text-sm font-black tracking-[0.12em] text-white leading-none">
                MARAJÓ
              </span>
              <span className="text-[9px] font-bold text-white/60 tracking-[0.2em] leading-none mt-0.5">
                RH
              </span>
            </div>
          </div>
          <button className="md:hidden p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white" onClick={() => setIsSidebarOpen(false)}>
            <X className="h-4 w-4" />
          </button>
        </div>
        
        <nav className="flex-1 py-4 px-3 space-y-0.5 relative z-10">
          {[
            { id: "inicio", label: "Dashboard", title: "Dashboard", icon: <Home className="h-4 w-4" strokeWidth={2} /> },
            { id: "situacao", label: "Situação", title: "Situação", icon: <ShieldCheck className="h-4 w-4" strokeWidth={2} /> },
            { id: "candidaturas", label: "Candidaturas", title: "Candidaturas", icon: <Briefcase className="h-4 w-4" strokeWidth={2} /> },
            { id: "mensagens", label: "Mensagens", title: "Mensagens", icon: <Mail className="h-4 w-4" strokeWidth={2} /> },
            { id: "perfil", label: "Perfil", title: "Perfil", icon: <User className="h-4 w-4" strokeWidth={2} /> },
          ].map((item) => {
            const isActive = activeMenuId === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleMenuClick(item.id)}
                title={item.title}
                className={`flex items-center justify-between px-3 py-2.5 w-full text-[13px] font-medium rounded-xl transition-all duration-200 group relative ${
                  isActive
                    ? "bg-[#1E3A8A] text-white shadow-sm"
                    : "text-white/60 hover:bg-white/5 hover:text-white/90"
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  {item.icon}
                  <span className="truncate tracking-wide">{item.label}</span>
                </div>
                {item.id === "mensagens" && unreadMessagesCount > 0 && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[9px] font-black text-white shrink-0 ml-2">
                    {unreadMessagesCount}
                  </span>
                )}
                {/* Active indicator bar */}
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-blue-400 rounded-r-full" />
                )}
              </button>
            );
          })}
        </nav>
        
        <div className="p-4 relative z-10">
          <Button 
            variant="outline" 
            onClick={handleLogout} 
            title="Sair"
            className="w-full h-10 border-white/20 bg-transparent font-medium text-white/80 hover:bg-white/10 hover:text-white transition-all rounded-xl flex items-center justify-center text-xs tracking-wide"
          >
            <LogOut className="h-3.5 w-3.5 mr-2 shrink-0" />
            <span className="truncate">Sair da conta</span>
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-background">
        {/* Header */}
        <header className="sticky top-0 z-40 flex items-center justify-between h-14 w-full px-4 sm:px-6 bg-[linear-gradient(90deg,#1a0640_0%,#3b0f9e_45%,#1a0640_100%)] border-b border-white/10 shadow-sm shrink-0">
          <div className="flex items-center gap-4">
            <button className="md:hidden p-1.5 rounded-lg hover:bg-white/10 text-white/90 transition-colors" onClick={() => setIsSidebarOpen(true)}>
              <Menu className="h-6 w-6" />
            </button>
            <div>
              <h1 className="font-heading text-sm sm:text-base font-bold text-white">
                Olá, {overview ? overview.candidate.full_name.split(' ')[0] : 'Candidato'}! 👋
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {overview && (
              <div className="hidden sm:flex items-center gap-2 text-[11px] font-bold text-white bg-white/10 px-3 py-1.5 rounded-full border border-white/10">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                {candidateSafeLabel(overview.status_public)}
              </div>
            )}
            <button
              onClick={() => handleMenuClick("mensagens")}
              className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white shadow-xs transition-colors hover:bg-white/10"
              title="Mensagens"
            >
              <Mail className="h-4 w-4 text-white/80" />
              {unreadMessagesCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-violet-400 text-[9px] font-bold text-white shadow-sm ring-2 ring-[#3b0f9e]">
                  {unreadMessagesCount > 9 ? "9+" : unreadMessagesCount}
                </span>
              )}
            </button>
            <div className="h-8 w-8 rounded-full bg-white/15 border border-white/20 flex items-center justify-center text-white font-bold shadow-sm text-sm">
              {overview ? overview.candidate.full_name.charAt(0).toUpperCase() : 'L'}
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 max-w-7xl w-full mx-auto">
          {loading ? (
            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] animate-pulse">
              <div className="space-y-6">
                <div className="bg-white border border-[#EEE7DF] rounded-[1.25rem] p-6 space-y-4">
                  <div className="h-5 bg-slate-200 rounded w-1/3" />
                  <div className="space-y-4 pt-4">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="flex gap-4 items-center">
                        <div className="h-9 w-9 rounded-full bg-slate-200" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-slate-200 rounded w-1/4" />
                          <div className="h-3 bg-slate-100 rounded w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="bg-white border border-[#EEE7DF] rounded-[1.25rem] p-6">
                  <div className="h-14 bg-slate-150 rounded-xl" />
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-white border border-[#EEE7DF] rounded-[1.25rem] p-6 space-y-4">
                  <div className="h-5 bg-slate-200 rounded w-1/3" />
                  <div className="grid grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="h-16 bg-slate-50 border border-slate-100 rounded-xl" />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {currentTab === "inicio" && overview && (
                <div className="space-y-6">
                  {/* Status Hero Card */}
                  <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
                    <Card className="relative overflow-hidden border-0 rounded-2xl bg-gradient-to-r from-cyan-50 to-blue-50 p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                      {/* Decorative abstract wave overlay */}
                      <div className="absolute right-0 top-0 bottom-0 w-1/2 pointer-events-none overflow-hidden mix-blend-multiply opacity-40">
                        <svg className="absolute h-[150%] w-[150%] -top-1/4 -right-1/4" viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M400 0H0C100 100 200 150 400 200V0Z" fill="#bae6fd" />
                          <path d="M400 100C300 150 150 250 0 400H400V100Z" fill="#e0f2fe" />
                        </svg>
                      </div>

                      <div className="flex items-center gap-4 relative z-10">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
                          <Rocket className="h-6 w-6 text-teal-500" strokeWidth={1.5} />
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-teal-700 block mb-1">
                            STATUS ATUAL
                          </span>
                          <h3 className="text-xl font-bold text-slate-900 leading-snug tracking-tight">
                            {currentStatusTitle}
                          </h3>
                          <p className="text-xs text-slate-500 mt-1 font-medium">
                            {currentStatusDesc}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => handleMenuClick("situacao")}
                        className="h-9 bg-white text-slate-600 hover:text-blue-600 hover:bg-blue-50 font-semibold rounded-xl text-xs flex items-center gap-1.5 self-start sm:self-center shrink-0 border border-slate-200 hover:border-blue-200 transition-all shadow-xs relative z-10 px-4"
                        data-testid="status-hero-view-details"
                      >
                        Ver situação completa
                        <ChevronRight className="h-3.5 w-3.5 text-blue-400" />
                      </Button>
                    </Card>
                  </div>

                  {overview.pre_admission?.has_pre_admission_case ? (
                    <div
                      className="animate-in fade-in slide-in-from-bottom-4 duration-500"
                      data-testid="candidate-portal-pre-admission-tile"
                    >
                      <Card className="overflow-hidden border border-primary/20 rounded-2xl bg-gradient-to-br from-primary/5 to-card p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/15">
                            <FileText className="h-6 w-6" />
                          </div>
                          <div className="min-w-0">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-primary block leading-none">
                              PRÉ-ADMISSÃO INICIADA
                            </span>
                            <h3 className="text-lg font-black text-foreground mt-1.5 leading-none">
                              {overview.pre_admission.documents_approved} de {overview.pre_admission.documents_total} documentos aprovados
                            </h3>
                            {overview.pre_admission.next_pending_document ? (
                              <p className="text-xs text-muted-foreground mt-1.5 font-medium leading-relaxed">
                                Próximo: {overview.pre_admission.next_pending_document}
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground mt-1.5 font-medium leading-relaxed">
                                Tudo enviado. Aguarde a análise do RH.
                              </p>
                            )}
                          </div>
                        </div>
                        <Button
                          asChild
                          className="h-10 bg-primary hover:bg-primary/90 text-primary-foreground font-extrabold rounded-xl text-xs flex items-center gap-1.5 self-start sm:self-center shrink-0"
                          data-testid="candidate-portal-pre-admission-tile-cta"
                        >
                          <Link to="/candidato/pre-admissao">
                            Enviar documentos
                            <ChevronRight className="h-4 w-4" />
                          </Link>
                        </Button>
                      </Card>
                    </div>
                  ) : null}

                  {isClosedProcess ? (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <ProcessClosedCard
                        overview={overview}
                        application={closedProcessApplication}
                        requesting={isRequestingContact}
                        onRequestContact={() => void handleRequestContact()}
                        onUpdateResume={() => handleMenuClick("perfil")}
                      />
                    </div>
                  ) : null}

                  {isTalentPoolOnly ? (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <TalentPoolStatusCard onUpdateResume={() => handleMenuClick("perfil")} />
                    </div>
                  ) : null}

                  {/* Top Row: Stepper Horizontal (Full Width) */}
                  {!isTalentPoolOnly ? (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
                      <CandidateHorizontalStepper overview={overview} />
                    </div>
                  ) : null}

                  {!isClosedProcess && !isTalentPoolOnly ? (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <CandidateInterviewCard interview={publicInterview} />
                    </div>
                  ) : null}

                  {pendingBehavioralAssessments.length > 0 ? (
                    <Card className="border border-amber-200 bg-amber-50/40 rounded-[1.25rem] shadow-xs animate-in fade-in duration-500 p-5">
                      <CardHeader className="pb-3 p-0">
                        <CardTitle className="text-base font-bold text-amber-900">
                          Avaliação comportamental pendente
                        </CardTitle>
                        <CardDescription className="text-amber-700">
                          Você possui {pendingBehavioralAssessments.length} avaliação(ões) aguardando resposta.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3 pt-2 p-0">
                        {pendingBehavioralAssessments.slice(0, 2).map((assessment) => (
                          <div
                            key={assessment.id}
                            className="rounded-xl border border-amber-100 bg-white px-3.5 py-2.5 shadow-xs"
                          >
                            <p className="text-xs font-bold text-slate-800">
                              {assessment.job_title || "Vaga vinculada"}
                            </p>
                            <p className="text-[10px] font-medium text-slate-500 mt-0.5">
                              {assessment.template_name}
                            </p>
                          </div>
                        ))}
                        <Button
                          type="button"
                          className="w-full bg-primary hover:bg-primary/90 font-bold text-primary-foreground h-10 rounded-xl"
                          onClick={() => handleMenuClick("avaliacoes")}
                        >
                          Responder avaliação
                        </Button>
                      </CardContent>
                    </Card>
                  ) : null}

                  {completedAssessment ? (
                    <Card className="border border-emerald-200 bg-emerald-50/40 rounded-[1.25rem] shadow-xs animate-in fade-in duration-500 p-5">
                      <CardHeader className="pb-3 p-0">
                        <CardTitle className="flex items-center gap-2 text-base font-bold text-emerald-900">
                          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                          Avaliação concluída
                        </CardTitle>
                        <CardDescription className="text-emerald-700">
                          {completedAssessment.template_name} foi enviada com sucesso.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-2 p-0">
                        <p className="text-xs font-bold text-emerald-950">
                          {completedAssessment.job_title || "Vaga vinculada"}
                        </p>
                      </CardContent>
                    </Card>
                  ) : null}

                  {/* Grid layout */}
                  <div className={!isClosedProcess ? "grid grid-cols-1 lg:grid-cols-2 gap-4 w-full" : "w-full"}>
                    {!isClosedProcess && (
                      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-75">
                        <NextUpdateCard />
                      </div>
                    )}
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150">
                      <QuickSummaryCard
                        overview={overview}
                        activeApplication={activeApplication}
                        closedProcessApplication={closedProcessApplication}
                        onOpenStatus={() => handleMenuClick("situacao")}
                      />
                    </div>
                  </div>

                  {/* Bottom Incentive Card */}
                  {!isClosedProcess ? (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300 w-full">
                      <BottomIncentiveCard />
                    </div>
                  ) : null}
                </div>
              )}

              {currentTab === "situacao" && overview && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {/* Page Title */}
                  <div className="flex flex-col gap-1 border-b border-border pb-4">
                    <h2 className="text-2xl font-black text-foreground tracking-tight">
                      Situação da candidatura
                    </h2>
                    <p className="text-xs font-semibold text-muted-foreground">
                      Acompanhe o andamento geral e os detalhes do seu processo seletivo ativo.
                    </p>
                  </div>

                  <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
                    {/* Status Overview Card - Main stats */}
                    <div className="lg:col-span-2 space-y-6">
                      <Card className="overflow-hidden border border-border rounded-[1.25rem] bg-card shadow-xs">
                      <CardHeader className="p-5 pb-3 border-b border-border">
                        <CardTitle className="text-base font-bold text-foreground">
                          Resumo da situação
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {[
                            {
                              label: isClosedProcess || isAdmittedProcess ? "Vaga de origem" : "Vaga ativa",
                              val: activeApplication?.job_title || closedProcessApplication?.job_title || "Banco de Talentos Marajó",
                              icon: <Briefcase className="h-5 w-5" />,
                            },
                            {
                              label: "Status",
                              val: candidateSafeLabel(overview.status_public),
                              icon: <ShieldCheck className="h-5 w-5" />,
                              highlight: true,
                            },
                            {
                              label: "Localização",
                              val: overview.candidate.city
                                ? `${overview.candidate.city}/${overview.candidate.state}`
                                : "Não informado",
                              icon: <MapPin className="h-5 w-5" />,
                            },
                            {
                              label: "Currículo",
                              val: overview.latest_resume?.file_name ? "Enviado" : "Pendente",
                              icon: <FileText className="h-5 w-5" />,
                              isSuccess: overview.latest_resume?.file_name ? true : false,
                            },
                          ].map((item, i) => (
                            <div
                              key={i}
                              className="rounded-xl border border-border bg-muted/30 p-4 flex gap-3.5 items-center min-w-0"
                            >
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                                {item.icon}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground leading-none">
                                  {item.label}
                                </p>
                                <p
                                  className={`mt-2 text-sm font-bold truncate leading-tight ${
                                    item.highlight
                                      ? "text-primary"
                                      : item.isSuccess
                                      ? "text-emerald-600 font-extrabold"
                                      : "text-foreground"
                                  }`}
                                >
                                  {item.val}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                      </Card>
                      {!isClosedProcess && !isTalentPoolOnly ? (
                        <CandidateInterviewCard interview={publicInterview} />
                      ) : null}
                    </div>

                    {/* Next Update Card & Basic Candidate Info - Side column */}
                    <div className="flex flex-col gap-6">
                      {!isClosedProcess && <NextUpdateCard />}
                      
                      {/* Basic Candidate Metadata */}
                      <Card className="overflow-hidden border border-border rounded-[1.25rem] bg-card shadow-xs flex-1">
                        <CardHeader className="p-5 pb-3 border-b border-border">
                          <CardTitle className="text-base font-bold text-foreground">
                            Dados da Candidatura
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-5 space-y-4">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground leading-none">
                              Candidato
                            </p>
                            <p className="mt-1.5 text-xs font-semibold text-foreground">
                              {overview.candidate.full_name}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground leading-none">
                              Contato
                            </p>
                            <p className="mt-1.5 text-xs font-semibold text-foreground">
                              {overview.candidate.email} {overview.candidate.phone ? `| ${overview.candidate.phone}` : ""}
                            </p>
                          </div>
                          {overview.candidate.desired_contract_type && (
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground leading-none">
                                Contrato Desejado
                              </p>
                              <p className="mt-1.5 text-xs font-semibold text-foreground">
                                {overview.candidate.desired_contract_type}
                              </p>
                            </div>
                          )}
                          {overview.candidate.salary_expectation && (
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground leading-none">
                                Pretensão Salarial
                              </p>
                              <p className="mt-1.5 text-xs font-semibold text-foreground">
                                R$ {Number(overview.candidate.salary_expectation).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </div>
              )}

              {currentTab === "mensagens" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {/* Page Title */}
                  <div className="flex flex-col gap-1 border-b border-border pb-4">
                    <h2 className="text-2xl font-black text-foreground tracking-tight">
                      Mensagens
                    </h2>
                    <p className="text-xs font-semibold text-muted-foreground">
                      Fique por dentro das comunicações enviadas pelo time de recrutamento.
                    </p>
                  </div>

                  <div className="w-full">
                    <CandidateMessagesCard 
                      refreshTrigger={messagesRefreshTrigger} 
                      onMessageRead={() => void loadPortalData(true)}
                    />
                  </div>
                </div>
              )}

              {currentTab === "vagas" && overview && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {/* Application History Card */}
                  <Card className="overflow-hidden border border-border rounded-[1.25rem] bg-card dark:bg-card/70 shadow-xs">
                    <CardHeader className="pb-3 border-b border-border p-5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <Briefcase className="h-5 w-5" />
                        </div>
                        <div>
                          <CardTitle className="text-base font-bold text-foreground">Minhas Candidaturas</CardTitle>
                          <CardDescription className="text-xs font-semibold text-muted-foreground mt-0.5">Histórico e situação de todos os seus envios.</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-6 pt-6 p-5">
                      {activeApplication ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-widest text-primary">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                            Candidatura em Destaque
                          </div>
                          <ApplicationCard
                            application={{
                              pipeline_id: activeApplication.pipeline_id,
                              job_id: activeApplication.job_id,
                              job_title: activeApplication.job_title,
                              status: activeApplication.pipeline_stage,
                              status_label: candidateSafeLabel(activeApplication.status_public),
                              submitted_at: activeApplication.submitted_at,
                              updated_at: activeApplication.submitted_at,
                              resume_file_name: activeApplication.resume_filename,
                              analysis_status: activeApplication.analysis_status,
                              application_source: overview.candidate.application_source,
                              talent_pool: false,
                              talent_pool_profile_status: null,
                            }}
                          />
                        </div>
                      ) : null}

                      {applicationHistory.length > 0 ? (
                        <div className="space-y-4 border-t border-border pt-6">
                          <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">
                            Outros Registros
                          </p>
                          <div className="grid gap-4">
                            {applicationHistory.map((application) => (
                              <ApplicationCard
                                key={application.pipeline_id ?? `tp-${application.submitted_at}`}
                                application={application}
                              />
                            ))}
                          </div>
                        </div>
                      ) : !activeApplication ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center gap-3 rounded-2xl border-2 border-dashed border-border">
                          <p className="text-sm font-semibold text-muted-foreground">Você está no nosso Banco de Talentos.</p>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </div>
              )}

              {currentTab === "avaliacoes" && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {/* Behavioral Assessments Card */}
                  <Card className="overflow-hidden border border-border rounded-[1.25rem] bg-card dark:bg-card/70 shadow-xs">
                    <CardHeader className="pb-3 border-b border-border p-5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <ClipboardCheck className="h-5 w-5" />
                        </div>
                        <div>
                          <CardTitle className="text-base font-bold text-foreground">Avaliação Comportamental</CardTitle>
                          <CardDescription className="text-xs font-semibold text-muted-foreground mt-0.5">Responda para completar seu perfil de match.</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-6 p-5">
                      {behavioralAssessments.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center gap-3 rounded-2xl border-2 border-dashed border-border">
                          <div className="h-10 w-10 text-muted-foreground/40">
                            <CheckCircle2 className="h-full w-full" />
                          </div>
                          <p className="text-sm font-semibold text-muted-foreground">Nenhuma avaliação pendente no momento.</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {behavioralAssessments.map((assignment) => (
                            <BehavioralAssessmentCard
                              key={assignment.id}
                              assignment={assignment}
                              onOpen={(item) => void handleOpenAssessment(item)}
                              disabled={assessmentLoadingId === assignment.id}
                            />
                          ))}
                        </div>
                      )}
                      
                      {selectedAssessment ? (
                        <div className="mt-8 animate-in zoom-in-95 duration-300">
                          <BehavioralAssessmentForm
                            key={`${selectedAssessment.id}-${selectedAssessment.status}`}
                            assignment={selectedAssessment}
                            saving={assessmentSaving}
                            onSave={handleSaveAssessment}
                            onSubmit={handleSubmitAssessment}
                            onClose={() => setSelectedAssessment(null)}
                          />
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </div>
              )}

              {currentTab === "perfil" && overview && (
                <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {/* Left Column: Profile Update */}
                  <div className="space-y-8">
                    <Card className="border border-border rounded-[1.25rem] bg-card dark:bg-card/70 shadow-xs">
                      <CardHeader className="flex flex-row items-center justify-between border-b border-border py-4 px-6">
                        <CardTitle className="text-base font-bold text-foreground">Dados de Contato</CardTitle>
                        {!isEditing && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setIsEditing(true)}
                            className="h-8 text-primary hover:bg-primary/10 font-bold"
                          >
                            Editar
                          </Button>
                        )}
                      </CardHeader>
                      <CardContent className="pt-6 px-6 space-y-6">
                        <div className="grid gap-5">
                          {[
                            { id: "email", label: "E-mail Profissional", type: "email", val: contactForm.email },
                            { id: "phone", label: "Telefone / WhatsApp", type: "text", val: contactForm.phone },
                            { id: "city", label: "Cidade", type: "text", val: contactForm.city },
                            { id: "state", label: "Estado (UF)", type: "text", val: contactForm.state, max: 2 },
                          ].map((field) => (
                            <div key={field.id} className="space-y-2">
                              <label className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                                {field.label}
                              </label>
                              <Input
                                id={`candidate-${field.id}`}
                                type={field.type}
                                maxLength={field.max}
                                value={field.val}
                                disabled={!isEditing || isSaving}
                                className="h-11 border-border bg-muted/30 font-medium focus:ring-primary rounded-xl"
                                onChange={(e) => handleContactChange(field.id as any, e.target.value)}
                              />
                            </div>
                          ))}
                        </div>

                        {isEditing && (
                          <div className="flex gap-3 pt-2">
                            <Button 
                              onClick={() => void handleSaveProfile()} 
                              disabled={isSaving}
                              className="flex-1 bg-primary hover:bg-primary/90 font-bold text-primary-foreground rounded-xl h-11 transition-colors"
                            >
                              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                              Salvar Alterações
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => {
                                setContactForm(buildContactForm(overview));
                                setIsEditing(false);
                              }}
                              disabled={isSaving}
                              className="font-bold border-border rounded-xl h-11 text-foreground"
                            >
                              Cancelar
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <CandidatePortalPreAdmissionSummaryCard preAdmission={preAdmission} />
                  </div>

                  {/* Right Column: Resume Upload */}
                  <div className="space-y-8">
                    <Card className="border border-border rounded-[1.25rem] bg-card dark:bg-card/70 shadow-xs">
                      <CardHeader className="py-4 px-6 border-b border-border">
                        <CardTitle className="text-base font-bold text-foreground">Atualizar Currículo</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-5 p-6">
                        <div className="flex items-center gap-4 rounded-2xl border border-border bg-muted/30 p-4">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-card shadow-xs text-primary border border-border">
                            <FileText className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-foreground">
                              {overview.latest_resume?.file_name || "Nenhum arquivo"}
                            </p>
                            <p className="text-[10px] font-semibold text-muted-foreground">
                              {overview.latest_resume ? `Enviado em ${formatDate(overview.latest_resume.uploaded_at)}` : "Formatos aceitos: PDF"}
                            </p>
                          </div>
                        </div>

                        <div className="relative">
                          <input
                            type="file"
                            id="resume-upload"
                            className="hidden"
                            accept=".pdf,application/pdf"
                            onChange={handleResumeFileChange}
                          />
                          <label 
                            htmlFor="resume-upload" 
                            className="flex h-24 w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-muted/30 transition-all hover:bg-card hover:border-primary/30"
                          >
                            <Upload className="mb-2 h-6 w-6 text-muted-foreground/60" />
                            <span className="text-xs font-bold text-muted-foreground/60 px-4 text-center">
                              {resumeFile ? resumeFile.name : "Clique para selecionar novo PDF"}
                            </span>
                          </label>
                        </div>

                        <Button 
                          onClick={() => void handleUploadResume()} 
                          disabled={isUploading || !resumeFile}
                          className="w-full bg-primary hover:bg-primary/90 font-bold text-primary-foreground rounded-xl h-11 transition-colors"
                        >
                          {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                          Fazer Upload Agora
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      {isTipsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <Card className="w-full max-w-sm border border-border rounded-2xl bg-card p-6 shadow-lg animate-in zoom-in-95 duration-200">
            <CardHeader className="p-0 pb-4 border-b border-border flex flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
                  <Lightbulb className="h-5 w-5" />
                </div>
                <CardTitle className="text-base font-bold text-foreground">Dicas Úteis</CardTitle>
              </div>
              <button 
                onClick={() => setIsTipsOpen(false)}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
                title="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="p-0 pt-4 space-y-4">
              {[
                { title: "Mantenha seu perfil atualizado", desc: "Isso aumenta suas chances de ser selecionado." },
                { title: "Destaque experiências relevantes", desc: "Mostre de forma clara as suas conquistas passadas." },
                { title: "Acompanhe seu e-mail", desc: "Sempre verifique sua caixa de spam para não perder avisos." }
              ].map((tip, idx) => (
                <div key={idx} className="flex gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 text-xs font-bold mt-0.5">
                    {idx + 1}
                  </span>
                  <div>
                    <h4 className="text-xs font-bold text-foreground">{tip.title}</h4>
                    <p className="text-[11px] text-muted-foreground font-medium mt-0.5 leading-relaxed">{tip.desc}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
      </div>
    </div>
  );
}
