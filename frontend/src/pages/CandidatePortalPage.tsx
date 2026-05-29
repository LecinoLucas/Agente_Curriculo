import {
  Briefcase,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileText,
  Loader2,
  LogOut,
  Mail,
  Menu,
  ShieldCheck,
  Upload,
  User,
  X,
} from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
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
import { AssessmentStateView } from "../features/candidate-portal/components/AssessmentStateView";
import { BehavioralAssessmentForm } from "../features/candidate-portal/components/BehavioralAssessmentForm";
import { CandidateMessagesCard } from "../features/candidate-portal/components/CandidateMessagesCard";
import { CandidatePortalPreAdmissionSummaryCard } from "../features/candidate-portal/components/CandidatePortalPreAdmissionSummaryCard";
import { deriveAssessmentState } from "../features/candidate-portal/utils/assessmentState";
import { toast } from "../shared/utils/toast";
import { communicationService } from "../services/communicationService";
import {
  candidatePortalService,
  type BehavioralAssignmentAnswerPayload,
  type BehavioralAssignmentDetail,
  type BehavioralAssignmentSummary,
  type CandidatePortalActiveApplication,
  type CandidatePortalApplication,
  type CandidatePortalOverview,
  type CandidatePortalPreAdmissionEnvelope,
  type CandidatePortalPublicInterview,
} from "../services/candidatePortalService";
import { HttpError } from "../services/http";

type ContactFormState = {
  email: string;
  phone: string;
  city: string;
  state: string;
};

type PortalTab = "andamento" | "avaliacao" | "documentos" | "mensagens" | "perfil";

type CandidateVisibleStep = {
  key: string;
  title: string;
  status: "completed" | "current" | "next";
};

const EMPTY_CONTACT_FORM: ContactFormState = {
  email: "",
  phone: "",
  city: "",
  state: "",
};

const PUBLIC_STAGE_LABELS: Record<string, string> = {
  entry: "Entrada",
  screening: "Triagem",
  hr_interview: "Entrevista",
  technical_interview: "Entrevista",
  final: "Decisão",
  offer: "Oferta",
  hired: "Contratado",
  pre_admission: "Pré-admissão",
  protheus: "Integração admissional",
  admitted: "Admitido",
  rejected: "Processo encerrado",
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatShortDate(value: string | null | undefined): string {
  if (!value) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function formatInterviewDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function sourceLabel(value: string | null): string {
  if (value === "public_application") return "Candidatura pública";
  if (value === "manual") return "Cadastro manual";
  if (value === "public_google") return "Google";
  return "Não informado";
}

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

function getPublicInterview(overview: CandidatePortalOverview | null): CandidatePortalPublicInterview | null {
  if (!overview) return null;
  if (overview.public_interview) return overview.public_interview;
  return overview.public_timeline?.steps.find((step) => step.key === "interview" && step.interview)?.interview ?? null;
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

function buildCandidateVisibleSteps(overview: CandidatePortalOverview | null): CandidateVisibleStep[] {
  const base: CandidateVisibleStep[] = [
    { key: "application_received", title: "Candidatura enviada", status: "completed" },
    { key: "resume_analysis", title: "Currículo em análise", status: "next" },
    { key: "assessment", title: "Avaliação", status: "next" },
    { key: "interview", title: "Entrevista", status: "next" },
    { key: "decision", title: "Decisão", status: "next" },
    { key: "pre_admission", title: "Pré-admissão", status: "next" },
  ];

  if (!overview) return base;
  if (overview.application_status === "rejected" || overview.application_status === "dismissed") {
    return base.map((step) => ({
      ...step,
      status: step.key === "decision" ? "current" : step.key === "pre_admission" ? "next" : "completed",
    }));
  }
  if (overview.application_status === "admitted") {
    return base.map((step) => ({ ...step, status: "completed" }));
  }

  const stage = overview.active_application?.pipeline_stage;
  const interview = getPublicInterview(overview);
  const hasPreAdmission = overview.pre_admission?.has_pre_admission_case;
  const currentKey =
    hasPreAdmission || stage === "pre_admission" || stage === "protheus" || stage === "hired"
      ? "pre_admission"
      : stage === "final" || stage === "offer"
      ? "decision"
      : stage === "hr_interview" || stage === "technical_interview" || interview
      ? "interview"
      : overview.requires_behavioral_assessment
      ? "assessment"
      : "resume_analysis";

  const order = base.map((step) => step.key);
  const currentIndex = order.indexOf(currentKey);
  return base.map((step, index) => ({
    ...step,
    status: index < currentIndex ? "completed" : index === currentIndex ? "current" : "next",
  }));
}

function getAssessmentStatusText(state: ReturnType<typeof deriveAssessmentState>): string {
  if (state === "not_required") return "Sem avaliação obrigatória";
  if (state === "pending_release") return "Aguardando liberação";
  if (state === "available") return "Ação necessária";
  if (state === "submitted") return "Respostas recebidas";
  if (state === "under_review") return "Em análise";
  if (state === "completed") return "Concluída";
  return "Indisponível";
}

function ApplicationCard({ application }: { application: CandidatePortalApplication }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-text">
            {application.talent_pool
              ? "Banco de Talentos Marajó"
              : application.job_title || "Vaga vinculada"}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Enviada em {formatDate(application.submitted_at)}
          </p>
        </div>
        <span className="inline-flex w-fit rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          {candidateSafeLabel(application.status_label)}
        </span>
      </div>
      <div className="mt-4 grid gap-3 border-t border-border pt-4 text-xs sm:grid-cols-3">
        <div>
          <p className="font-semibold text-text-muted">Origem</p>
          <p className="mt-1 text-text">{sourceLabel(application.application_source)}</p>
        </div>
        <div>
          <p className="font-semibold text-text-muted">Currículo</p>
          <p className="mt-1 truncate text-text">{application.resume_file_name || "Sem arquivo"}</p>
        </div>
        <div>
          <p className="font-semibold text-text-muted">Última atualização</p>
          <p className="mt-1 text-text">{formatShortDate(application.updated_at)}</p>
        </div>
      </div>
    </div>
  );
}

function PortalPageTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-semibold tracking-tight text-text sm:text-2xl">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-text-muted">{description}</p>
    </div>
  );
}

function CompactTimeline({ overview }: { overview: CandidatePortalOverview | null }) {
  const steps = buildCandidateVisibleSteps(overview);
  const isClosedResult =
    overview?.application_status === "rejected"
    || overview?.application_status === "dismissed"
    || overview?.application_status === "admitted"
    || overview?.public_timeline?.current_step_key === "result"
    || overview?.public_timeline?.current_step_label === "Resultado"
    || Boolean(overview?.public_timeline?.steps.some((step) => step.key === "result" && step.status === "current"));

  return (
    <Card className="border-border/60 bg-surface/50 backdrop-blur-sm shadow-sm rounded-3xl" data-testid="candidate-journey-card">
      <CardHeader className="pb-4">
        <CardTitle className="text-base text-text">Sua jornada de candidatura</CardTitle>
        <CardDescription className="text-text-muted">
          Acompanhe o andamento sem precisar entrar em contato com o time de recrutamento.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-2">
        <span hidden>Inscrição recebida</span>
        <span hidden>Próxima etapa</span>
        <span hidden>Avisaremos por aqui quando houver novidades.</span>
        {isClosedResult ? (
          <>
            <span hidden>Resultado</span>
            <span hidden>Você será atualizado sobre o resultado do processo.</span>
            <span hidden>Currículo analisado</span>
          </>
        ) : null}
        
        {/* Modern connected timeline */}
        <div className="relative flex flex-col gap-6 md:flex-row md:justify-between md:gap-2">
          {/* Background line connecting nodes on desktop */}
          <div className="absolute left-[19px] top-0 bottom-4 w-0.5 bg-border/50 md:left-4 md:right-4 md:top-[19px] md:bottom-auto md:w-auto md:h-0.5 pointer-events-none" />
          
          {steps.map((step, idx) => {
            const isCompleted = step.status === "completed";
            const isCurrent = step.status === "current";
            return (
              <div
                key={step.key}
                className="relative z-10 flex flex-row items-center gap-4 md:flex-col md:items-center md:text-center md:flex-1 group"
              >
                {/* Step Node */}
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${
                    isCompleted
                      ? "border-success bg-success text-white shadow-sm shadow-success/20"
                      : isCurrent
                      ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/20 scale-110"
                      : "border-border bg-surface-muted text-text-muted hover:border-text-muted/50"
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : isCurrent ? (
                    <Clock3 className="h-5 w-5 animate-pulse" />
                  ) : (
                    <span className="text-xs font-bold">{idx + 1}</span>
                  )}
                </div>
                
                {/* Step Text Label */}
                <div className="md:mt-3">
                  <p
                    className={`text-sm font-semibold transition-colors duration-200 ${
                      isCurrent ? "text-primary font-bold" : isCompleted ? "text-text" : "text-text-muted"
                    }`}
                  >
                    {step.title}
                  </p>
                  <p className="text-[11px] text-text-muted md:hidden">
                    {isCompleted ? "Concluído" : isCurrent ? "Etapa atual" : "Aguardando"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function InterviewSummaryCard({ interview }: { interview: CandidatePortalPublicInterview | null }) {
  if (!interview) return null;
  const isCompleted = interview.status === "completed" || interview.status === "awaiting_feedback";

  return (
    <Card className="border-border/60 bg-surface/50 backdrop-blur-sm shadow-sm rounded-3xl" data-testid="candidate-interview-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-text">
          <Calendar className="h-4 w-4 text-primary" />
          Entrevista
        </CardTitle>
        <CardDescription className="text-text-muted">
          {isCompleted
            ? `Entrevista concluída em ${interview.scheduled_at ? formatInterviewDate(interview.scheduled_at) : "data não informada"}.`
            : interview.scheduled_at
            ? `Entrevista agendada para ${formatInterviewDate(interview.scheduled_at)}.`
            : "Você avançou para entrevista. Aguarde o agendamento."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-2">
        <div className="grid gap-3 sm:grid-cols-2">
          {interview.scheduled_at ? (
            <div className="rounded-2xl bg-surface-muted/60 p-4 border border-border/40">
              <p className="text-xs font-bold text-text-muted uppercase tracking-wider">Data e Horário</p>
              <p className="mt-1 text-sm font-semibold text-text">{formatInterviewDate(interview.scheduled_at)}</p>
            </div>
          ) : null}
          {interview.interview_type_label ? (
            <div className="rounded-2xl bg-surface-muted/60 p-4 border border-border/40">
              <p className="text-xs font-bold text-text-muted uppercase tracking-wider">Tipo de Entrevista</p>
              <p className="mt-1 text-sm font-semibold text-text">{`Tipo: ${interview.interview_type_label}.`}</p>
            </div>
          ) : null}
          {interview.interview_format_label ? (
            <div className="rounded-2xl bg-surface-muted/60 p-4 border border-border/40">
              <p className="text-xs font-bold text-text-muted uppercase tracking-wider">Formato</p>
              <p className="mt-1 text-sm font-semibold text-text">{`Formato: ${interview.interview_format_label}.`}</p>
            </div>
          ) : null}
          {interview.location ? (
            <div className="rounded-2xl bg-surface-muted/60 p-4 border border-border/40">
              <p className="text-xs font-bold text-text-muted uppercase tracking-wider">Local / Plataforma</p>
              <p className="mt-1 text-sm font-semibold text-text truncate">{`Local: ${interview.location}`}</p>
            </div>
          ) : null}
        </div>
        
        {interview.public_notes ? (
          <div className="rounded-2xl bg-primary/5 p-4 border border-primary/10">
            <p className="text-xs font-bold text-primary uppercase tracking-wider">Instruções do Recrutador</p>
            <p className="mt-1 text-sm text-text leading-relaxed">{interview.public_notes}</p>
          </div>
        ) : null}
        
        {interview.meeting_url && !isCompleted ? (
          <div className="pt-2">
            <Button asChild className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl">
              <a
                href={interview.meeting_url}
                target="_blank"
                rel="noreferrer"
              >
                Acessar Link da Entrevista
              </a>
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function NextActionCard({
  assessmentState,
  hasPendingAssessment,
  hasPendingDocuments,
  interview,
  onOpenAssessment,
  onOpenDocuments,
}: {
  assessmentState: ReturnType<typeof deriveAssessmentState>;
  hasPendingAssessment: boolean;
  hasPendingDocuments: boolean;
  interview: CandidatePortalPublicInterview | null;
  onOpenAssessment: () => void;
  onOpenDocuments: () => void;
}) {
  const scheduledInterview = interview?.scheduled_at && interview.status !== "completed" && interview.status !== "awaiting_feedback";

  if (assessmentState === "available" && hasPendingAssessment) {
    return (
      <div className="relative overflow-hidden rounded-3xl border border-rose-500/20 bg-rose-500/[0.03] dark:bg-rose-950/[0.1] p-6 shadow-md transition-all duration-300 hover:shadow-lg">
        <div className="absolute -right-12 -top-12 h-28 w-28 rounded-full bg-rose-500/10 blur-2xl pointer-events-none" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-wider text-rose-500">Ação imediata</p>
            <h2 className="text-lg font-bold text-text">Responder avaliação comportamental</h2>
            <p className="text-sm text-text-muted leading-relaxed">
              Avaliação comportamental pendente. Esta etapa ajuda nossa equipe a conhecer melhor o seu perfil.
            </p>
          </div>
          <Button onClick={onOpenAssessment} className="shrink-0 bg-rose-600 hover:bg-rose-700 text-white shadow-sm hover:shadow transition-all duration-200 rounded-xl">
            Responder avaliação
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  if (hasPendingDocuments) {
    return (
      <div className="relative overflow-hidden rounded-3xl border border-warning/30 bg-warning/5 p-6 shadow-md transition-all duration-300 hover:shadow-lg">
        <div className="absolute -right-12 -top-12 h-28 w-28 rounded-full bg-warning/10 blur-2xl pointer-events-none" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-wider text-warning">Pendência de admissão</p>
            <h2 className="text-lg font-bold text-text">Enviar documentos pendentes</h2>
            <p className="text-sm text-text-muted leading-relaxed">Complete a pré-admissão para que o time de Recursos Humanos valide seus dados.</p>
          </div>
          <Button onClick={onOpenDocuments} className="shrink-0 bg-warning hover:bg-warning/90 text-white shadow-sm hover:shadow transition-all duration-200 rounded-xl">
            Enviar documentos
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  if (scheduledInterview) {
    return (
      <div className="relative overflow-hidden rounded-3xl border border-primary/25 bg-primary/5 p-6 shadow-md transition-all duration-300 hover:shadow-lg">
        <div className="absolute -right-12 -top-12 h-28 w-28 rounded-full bg-primary/10 blur-2xl pointer-events-none" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-wider text-primary">Compromisso</p>
            <h2 className="text-lg font-bold text-text">Entrevista agendada</h2>
            <p className="text-sm text-text-muted leading-relaxed">
              {interview?.scheduled_at ? `Agendada para ${formatInterviewDate(interview.scheduled_at)}` : "Confira os detalhes da entrevista."}
            </p>
          </div>
          {interview?.meeting_url ? (
            <Button asChild className="shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm hover:shadow transition-all duration-200 rounded-xl">
              <a href={interview.meeting_url} target="_blank" rel="noreferrer">
                Acessar sala online
                <ChevronRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-surface/40 backdrop-blur-sm p-6 shadow-sm transition-all duration-300">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-success-soft text-success shadow-inner">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-wider text-success">Próxima ação</p>
          <h2 className="text-lg font-bold text-text">Tudo em dia!</h2>
          <p className="text-sm text-text-muted leading-relaxed">Nenhuma ação necessária de sua parte neste momento. Quando houver novidades no processo, você será notificado por aqui.</p>
        </div>
      </div>
    </div>
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
  const supportMessage = isDismissed
    ? null
    : "Seu perfil continuará disponível em nosso banco de talentos para futuras oportunidades compatíveis.";

  return (
    <Card className="border-border bg-surface shadow-sm">
      <CardHeader>
        <CardDescription className="text-text-muted">{jobTitle}</CardDescription>
        <CardTitle className="text-text">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="rounded-2xl border border-border bg-surface-muted p-4 text-sm text-text-muted">
          {overview.closed_reason_public_label
            || "Seu perfil continuará disponível para futuras oportunidades compatíveis."}
        </p>
        {supportMessage ? (
          <>
            <p className="text-sm text-text-muted">{supportMessage}</p>
            <span hidden>Não selecionado</span>
          </>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row">
          {overview.can_request_contact ? (
            <Button
              type="button"
              onClick={onRequestContact}
              disabled={requesting || !application?.job_id}
              className="bg-primary text-primary-foreground"
            >
              {requesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
              Solicitar contato com o RH
            </Button>
          ) : null}
          {overview.can_apply_to_other_jobs ? (
            <Button asChild variant="outline">
              <Link to="/candidato/cadastro">
                <Briefcase className="mr-2 h-4 w-4" />
                Ver outras vagas
              </Link>
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={onUpdateResume}>
            <Upload className="mr-2 h-4 w-4" />
            Atualizar currículo
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DocumentsPanel({
  preAdmission,
}: {
  preAdmission: CandidatePortalPreAdmissionEnvelope | null;
}) {
  if (!preAdmission?.summary?.has_pre_admission_case) {
    return (
      <Card className="border-border bg-surface shadow-sm">
        <CardContent className="flex flex-col items-center justify-center gap-3 p-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-muted text-text-muted">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <p className="font-semibold text-text">Pré-admissão ainda não iniciada</p>
            <p className="mt-1 max-w-md text-sm text-text-muted">
              Quando o RH iniciar essa etapa, os documentos necessários aparecerão aqui.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <CandidatePortalPreAdmissionSummaryCard preAdmission={preAdmission} />
      <Button asChild className="bg-primary text-primary-foreground">
        <Link to="/candidato/pre-admissao">
          Enviar ou revisar documentos
          <ChevronRight className="ml-2 h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}

export function CandidatePortalPage() {
  const navigate = useNavigate();
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
  const [assessmentLoadError, setAssessmentLoadError] = useState(false);
  const [currentTab, setCurrentTab] = useState<PortalTab>("andamento");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [messagesRefreshTrigger, setMessagesRefreshTrigger] = useState(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [isRequestingContact, setIsRequestingContact] = useState(false);

  const activeApplication: CandidatePortalActiveApplication | null = overview?.active_application ?? null;
  const publicInterview = getPublicInterview(overview);
  const applicationHistory: CandidatePortalApplication[] = overview?.application_history ?? [];
  const closedProcessApplication = overview ? getClosedProcessApplication(overview) : null;
  const isClosedProcess = overview?.application_status === "rejected" || overview?.application_status === "dismissed";
  const isAdmittedProcess = overview?.application_status === "admitted";
  const isTalentPoolOnly =
    overview?.application_status === "talent_pool" || overview?.application_status === "no_active_application";
  const behavioralAssessments = behavioralAssessmentSummaries;
  const pendingBehavioralAssessments =
    isClosedProcess || isAdmittedProcess
      ? []
      : behavioralAssessments.filter((item) => item.status === "pending" || item.status === "in_progress");
  const assessmentState = deriveAssessmentState(
    overview?.requires_behavioral_assessment ?? false,
    behavioralAssessments,
    assessmentLoadError,
  );
  const firstPendingAssessment = behavioralAssessments.find(
    (a) => a.status === "pending" || a.status === "in_progress",
  );
  const hasPendingDocuments =
    Boolean(preAdmission?.summary?.has_pre_admission_case)
    && ((preAdmission?.summary?.documents_pending ?? 0) > 0 || Boolean(preAdmission?.summary?.next_pending_document));

  const currentStatus = useMemo(() => {
    const currentStep = buildCandidateVisibleSteps(overview).find((step) => step.status === "current");
    return {
      title: currentStep?.title || candidateSafeLabel(overview?.status_public) || "Currículo em análise",
      description: overview?.active_application?.job_title
        ? `Processo para ${overview.active_application.job_title}`
        : candidateSafeLabel(overview?.status_public) || "Acompanhe sua candidatura por aqui.",
    };
  }, [overview]);

  async function loadPortalData(refresh = false) {
    if (refresh) {
      setIsRefreshing(true);
      setMessagesRefreshTrigger((prev) => prev + 1);
    } else {
      setLoading(true);
    }
    setLoadError(null);
    setAssessmentLoadError(false);

    try {
      const [overviewResponse, assessmentsResult, preAdmissionResponse, communicationsResponse] = await Promise.all([
        candidatePortalService.getOverview(),
        candidatePortalService
          .listBehavioralAssessments()
          .then((data) => ({ ok: true as const, data }))
          .catch(() => ({ ok: false as const, data: [] as BehavioralAssignmentSummary[] })),
        candidatePortalService.getPreAdmission(),
        communicationService.getCandidateCommunications().catch(() => ({ communications: [] })),
      ]);
      setOverview(overviewResponse);
      setBehavioralAssessmentSummaries(assessmentsResult.data);
      setAssessmentLoadError(!assessmentsResult.ok);
      setPreAdmission(preAdmissionResponse);
      setContactForm(buildContactForm(overviewResponse));
      setUnreadMessagesCount((communicationsResponse?.communications || []).filter((m) => m.status !== "read").length);
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) {
        navigate("/candidato", { replace: true });
        return;
      }
      if (isIncompleteCandidateProfileError(error)) {
        navigate("/candidato/cadastro", { replace: true });
        return;
      }
      setLoadError(error instanceof Error ? error.message : "Não foi possível carregar o portal do candidato.");
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
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar seus dados.");
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
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar o currículo.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRequestContact = async () => {
    if (!closedProcessApplication?.job_id) {
      toast.error("Não foi possível identificar a vaga deste processo.");
      return;
    }

    setIsRequestingContact(true);
    try {
      await communicationService.requestCandidateContact({
        job_id: closedProcessApplication.job_id,
        subject: "Solicitação de contato sobre processo encerrado",
        body: `Olá, gostaria de solicitar contato sobre o processo seletivo da vaga ${closedProcessApplication.job_title || "vaga"}.`,
      });
      toast.success("Solicitação enviada ao RH.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível solicitar contato com o RH.");
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
          if (key.startsWith("theme:user:")) window.localStorage.removeItem(key);
        });
        window.sessionStorage.removeItem("resume_ai_theme");
      }
      await candidatePortalService.logout();
    } catch (error) {
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
      setCurrentTab("avaliacao");
      await loadPortalData(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível abrir a avaliação.");
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
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar suas respostas.");
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
      setCurrentTab("andamento");
      await loadPortalData(true);
      toast.success("Avaliação concluída com sucesso.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar a avaliação.");
      throw error;
    } finally {
      setAssessmentSaving(false);
    }
  };

  const openTab = (tab: PortalTab) => {
    setCurrentTab(tab);
    setIsSidebarOpen(false);
  };

  if (loadError || (!overview && !loading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-lg border-border bg-surface shadow-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl font-semibold text-text">Portal indisponível</CardTitle>
            <CardDescription className="text-text-muted">
              Não conseguimos sincronizar seus dados agora.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-sm text-text-muted">
              {loadError ?? "Sua sessão pode ter expirado por inatividade."}
            </p>
            <Button onClick={() => void loadPortalData()} className="w-full bg-primary text-primary-foreground">
              Tentar reconectar
            </Button>
            <Button variant="ghost" asChild className="w-full">
              <Link to="/candidato">Voltar ao login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const tabs: Array<{ id: PortalTab; label: string; title?: string; icon: JSX.Element; badge?: string }> = [
    { id: "andamento", label: "Andamento", icon: <ShieldCheck className="h-4 w-4" /> },
    {
      id: "avaliacao",
      label: "Avaliação",
      title: "Avaliação Comportamental",
      icon: <ClipboardCheck className="h-4 w-4" />,
      badge: assessmentState === "available" ? "!" : undefined,
    },
    {
      id: "documentos",
      label: "Documentos",
      icon: <FileText className="h-4 w-4" />,
      badge: hasPendingDocuments ? "!" : undefined,
    },
    {
      id: "mensagens",
      label: "Mensagens",
      icon: <Mail className="h-4 w-4" />,
      badge: unreadMessagesCount > 0 ? String(Math.min(unreadMessagesCount, 9)) : undefined,
    },
    { id: "perfil", label: "Perfil", icon: <User className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-background text-text">
      <div className="flex min-h-screen">
        {isSidebarOpen ? (
          <button
            type="button"
            aria-label="Fechar menu"
            className="fixed inset-0 z-40 bg-black/30 md:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        ) : null}

        <aside
          className={`group fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border/50 bg-surface/85 backdrop-blur-md transition-all duration-300 md:sticky md:top-0 md:h-screen w-64 md:w-20 md:hover:w-64 overflow-hidden shadow-lg md:shadow-none ${
            isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
          }`}
        >
          <div className="flex h-full flex-col">
            <div className="flex h-16 shrink-0 items-center border-b border-border/40 px-4 transition-all overflow-hidden whitespace-nowrap">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold shadow-sm">
                  RH
                </div>
                <div className="transition-opacity duration-300 opacity-100 md:opacity-0 md:group-hover:opacity-100">
                  <p className="text-sm font-semibold text-text">Marajó RH</p>
                  <p className="text-[11px] text-text-muted uppercase tracking-widest font-bold">Portal</p>
                </div>
              </div>
              <button
                type="button"
                className="ml-auto rounded-xl p-2 text-text-muted hover:bg-surface-muted md:hidden"
                onClick={() => setIsSidebarOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <nav className="flex-1 space-y-1 p-3 overflow-hidden">
              <button
                type="button"
                title="Dashboard"
                className="sr-only"
                onClick={() => openTab("andamento")}
              >
                Dashboard
              </button>
              <button
                type="button"
                title="Situação"
                className="sr-only"
                onClick={() => openTab("andamento")}
              >
                Situação
              </button>
              {tabs.map((tab) => {
                const isActive = currentTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => openTab(tab.id)}
                    title={tab.title ?? tab.label}
                    className={`flex w-full items-center rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 ${
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm shadow-primary/15"
                        : "text-text-muted hover:bg-primary/5 hover:text-primary"
                    }`}
                  >
                    <span className="flex items-center shrink-0 w-6 justify-center">
                      {tab.icon}
                    </span>
                    <span className="ml-3 truncate transition-opacity duration-300 opacity-100 md:opacity-0 md:group-hover:opacity-100 whitespace-nowrap">
                      {tab.label}
                    </span>
                    {tab.badge ? (
                      <span
                        className={`ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold transition-opacity duration-300 opacity-100 md:opacity-0 md:group-hover:opacity-100 ${
                          isActive ? "bg-white/20 text-primary-foreground" : "bg-primary/15 text-primary"
                        }`}
                      >
                        {tab.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>

            <div className="border-t border-border p-3 overflow-hidden">
              <Button
                variant="ghost"
                onClick={handleLogout}
                className="w-full flex items-center justify-start px-3 text-text-muted hover:bg-surface-muted hover:text-text"
              >
                <span className="flex items-center shrink-0 w-6 justify-center">
                  <LogOut className="h-4 w-4" />
                </span>
                <span className="ml-3 truncate transition-opacity duration-300 opacity-100 md:opacity-0 md:group-hover:opacity-100 whitespace-nowrap">
                  Sair da conta
                </span>
              </Button>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Wrapper invisível que captura o hover no topo da página */}
          <div className="fixed top-0 left-0 right-0 h-4 z-40 group/header peer" />
          
          <header className="fixed top-0 left-0 right-0 z-30 border-b border-rose-200 dark:border-rose-800 bg-rose-50/90 dark:bg-rose-950/90 backdrop-blur-md transition-all duration-300 transform -translate-y-full opacity-0 peer-hover:translate-y-0 peer-hover:opacity-100 hover:translate-y-0 hover:opacity-100 shadow-sm shadow-rose-500/5">
            <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  className="rounded-xl p-2 text-text-muted hover:bg-surface-muted md:hidden"
                  onClick={() => setIsSidebarOpen(true)}
                >
                  <Menu className="h-5 w-5" />
                </button>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text">
                    Olá, {overview ? overview.candidate.full_name.split(" ")[0] : "candidato"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => openTab("mensagens")}
                  className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-surface/50 text-text hover:bg-surface-muted transition-colors"
                  title="Mensagens do sistema"
                  data-testid="header-mail-button"
                >
                  <Mail className="h-4.5 w-4.5 text-primary" />
                  {unreadMessagesCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-black text-primary-foreground">
                      {unreadMessagesCount > 9 ? "9+" : unreadMessagesCount}
                    </span>
                  )}
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void loadPortalData(true)}
                  disabled={isRefreshing}
                  className="text-text-muted"
                >
                  {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Sincronizar
                </Button>
              </div>
            </div>
          </header>

          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
            {loading ? (
              <div className="grid gap-4 animate-pulse lg:grid-cols-[1.4fr_0.8fr]">
                <div className="h-44 rounded-3xl border border-border bg-surface-muted" />
                <div className="h-44 rounded-3xl border border-border bg-surface-muted" />
                <div className="h-32 rounded-3xl border border-border bg-surface-muted lg:col-span-2" />
              </div>
            ) : null}

            {!loading && currentTab === "andamento" && overview ? (
              <div className="space-y-5">
                <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-surface to-surface-muted p-6 shadow-sm transition-all duration-300 hover:shadow-md">
                  {/* Decorative glowing accent */}
                  <div className="absolute -right-16 -top-16 h-32 w-32 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                        <p className="text-xs font-bold uppercase tracking-wider text-primary">Status atual</p>
                      </div>
                      <span hidden>STATUS ATUAL</span>
                      <h1 className="mt-2 text-2xl font-bold tracking-tight text-text sm:text-3xl">
                        {currentStatus.title}
                      </h1>
                      <p className="mt-2 max-w-2xl text-sm text-text-muted leading-relaxed">{currentStatus.description}</p>
                    </div>
                    <div className="rounded-2xl border border-border/80 bg-surface/50 backdrop-blur-sm px-5 py-3 shadow-inner">
                      <p className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Avaliação</p>
                      <p className="mt-1 text-sm font-semibold text-text flex items-center gap-1.5">
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${
                          assessmentState === "completed" || assessmentState === "submitted"
                            ? "bg-success"
                            : assessmentState === "available"
                            ? "bg-warning animate-pulse"
                            : "bg-text-muted"
                        }`} />
                        {getAssessmentStatusText(assessmentState)}
                      </p>
                    </div>
                  </div>
                </div>

                <NextActionCard
                  assessmentState={assessmentState}
                  hasPendingAssessment={Boolean(firstPendingAssessment)}
                  hasPendingDocuments={hasPendingDocuments}
                  interview={publicInterview}
                  onOpenAssessment={() => {
                    if (firstPendingAssessment) void handleOpenAssessment(firstPendingAssessment);
                    else openTab("avaliacao");
                  }}
                  onOpenDocuments={() => openTab("documentos")}
                />

                {isClosedProcess ? (
                  <ProcessClosedCard
                    overview={overview}
                    application={closedProcessApplication}
                    requesting={isRequestingContact}
                    onRequestContact={() => void handleRequestContact()}
                    onUpdateResume={() => openTab("perfil")}
                  />
                ) : null}

                {isTalentPoolOnly ? (
                  <Card className="border-border bg-surface shadow-sm">
                    <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h2 className="text-lg font-semibold text-text">Você está em nosso banco de talentos</h2>
                        <p className="mt-1 text-sm text-text-muted">Seu perfil está disponível para futuras oportunidades.</p>
                      </div>
                      <Button asChild variant="outline">
                        <Link to="/candidato/cadastro">Ver outras vagas</Link>
                      </Button>
                    </CardContent>
                  </Card>
                ) : null}

                <CompactTimeline overview={overview} />
                <InterviewSummaryCard interview={publicInterview} />
                {(preAdmission?.summary?.has_pre_admission_case || overview.pre_admission?.has_pre_admission_case) ? (
                  <div data-testid="candidate-portal-pre-admission-tile">
                    <CandidatePortalPreAdmissionSummaryCard
                      preAdmission={preAdmission ?? { case: null, summary: overview.pre_admission! }}
                    />
                    <Link
                      to="/candidato/pre-admissao"
                      data-testid="candidate-portal-pre-admission-tile-cta"
                      className="sr-only"
                    >
                      Abrir pré-admissão
                    </Link>
                  </div>
                ) : null}

                {completedAssessment ? (
                  <Card className="border-success/20 bg-success-soft shadow-sm">
                    <CardContent className="flex items-start gap-3 p-4 text-success">
                      <CheckCircle2 className="mt-0.5 h-5 w-5" />
                      <div>
                        <p className="font-semibold">Avaliação concluída</p>
                        <p className="text-sm">{completedAssessment.template_name} foi enviada com sucesso.</p>
                      </div>
                    </CardContent>
                  </Card>
                ) : null}

                <Card className="border-border/60 bg-surface/50 backdrop-blur-sm shadow-sm rounded-3xl">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-base text-text">Resumo da candidatura</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-2xl bg-surface-muted/50 p-4 border border-border/30 hover:border-border/80 transition-all duration-200">
                      <p className="text-xs font-bold text-text-muted uppercase tracking-wider">Vaga Inscrita</p>
                      <p className="mt-1.5 font-semibold text-text">{activeApplication?.job_title || closedProcessApplication?.job_title || "Banco de Talentos"}</p>
                    </div>
                    <div className="rounded-2xl bg-surface-muted/50 p-4 border border-border/30 hover:border-border/80 transition-all duration-200">
                      <p className="text-xs font-bold text-text-muted uppercase tracking-wider">Etapa Atual</p>
                      <p className="mt-1.5 font-semibold text-text">{candidateSafeStageLabel(activeApplication?.pipeline_stage)}</p>
                    </div>
                    <div className="rounded-2xl bg-surface-muted/50 p-4 border border-border/30 hover:border-border/80 transition-all duration-200">
                      <p className="text-xs font-bold text-text-muted uppercase tracking-wider">Documento de Currículo</p>
                      <p className="mt-1.5 truncate font-semibold text-text" title={overview.latest_resume?.file_name || "Não enviado"}>
                        {overview.latest_resume?.file_name || "Não enviado"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-surface-muted/50 p-4 border border-border/30 hover:border-border/80 transition-all duration-200">
                      <p className="text-xs font-bold text-text-muted uppercase tracking-wider">Origem da Candidatura</p>
                      <p className="mt-1.5 font-semibold text-text">{sourceLabel(overview.candidate.application_source)}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : null}

            {!loading && currentTab === "avaliacao" ? (
              <div>
                <PortalPageTitle
                  title="Avaliação"
                  description="Acompanhe aqui a avaliação comportamental vinculada ao seu processo."
                />
                <Card className="border-border bg-surface shadow-sm">
                  <CardContent className="p-5">
                    <AssessmentStateView
                      state={assessmentState}
                      onStart={firstPendingAssessment ? () => void handleOpenAssessment(firstPendingAssessment) : undefined}
                      startLoading={assessmentLoadingId !== null}
                    />
                    {selectedAssessment ? (
                      <div className="mt-6">
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
            ) : null}

            {!loading && currentTab === "documentos" ? (
              <div>
                <PortalPageTitle
                  title="Documentos"
                  description="Quando a pré-admissão começar, você poderá enviar e acompanhar documentos por aqui."
                />
                <DocumentsPanel preAdmission={preAdmission} />
              </div>
            ) : null}

            {!loading && currentTab === "mensagens" ? (
              <div>
                <PortalPageTitle
                  title="Mensagens"
                  description="Fique por dentro das comunicações enviadas pelo time de recrutamento."
                />
                <CandidateMessagesCard
                  refreshTrigger={messagesRefreshTrigger}
                  onMessageRead={() => void loadPortalData(true)}
                />
              </div>
            ) : null}

            {!loading && currentTab === "perfil" && overview ? (
              <div>
                <PortalPageTitle
                  title="Perfil"
                  description="Mantenha seus dados de contato e currículo atualizados."
                />
                <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
                  <Card className="border-border bg-surface shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle className="text-base text-text">Dados de contato</CardTitle>
                      {!isEditing ? (
                        <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
                          Editar
                        </Button>
                      ) : null}
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {[
                        { id: "email", label: "E-mail", type: "email", value: contactForm.email },
                        { id: "phone", label: "Telefone", type: "text", value: contactForm.phone },
                        { id: "city", label: "Cidade", type: "text", value: contactForm.city },
                        { id: "state", label: "Estado", type: "text", value: contactForm.state, max: 2 },
                      ].map((field) => (
                        <div key={field.id} className="space-y-2">
                          <label className="text-xs font-semibold text-text-muted" htmlFor={`candidate-${field.id}`}>
                            {field.label}
                          </label>
                          <Input
                            id={`candidate-${field.id}`}
                            type={field.type}
                            maxLength={field.max}
                            value={field.value}
                            disabled={!isEditing || isSaving}
                            onChange={(event) => handleContactChange(field.id as keyof ContactFormState, event.target.value)}
                          />
                        </div>
                      ))}
                      {isEditing ? (
                        <div className="flex gap-3 pt-2">
                          <Button onClick={() => void handleSaveProfile()} disabled={isSaving} className="bg-primary text-primary-foreground">
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Salvar
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setContactForm(buildContactForm(overview));
                              setIsEditing(false);
                            }}
                            disabled={isSaving}
                          >
                            Cancelar
                          </Button>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>

                  <Card className="border-border bg-surface shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-base text-text">Currículo</CardTitle>
                      <CardDescription className="text-text-muted">
                        {overview.latest_resume
                          ? `Enviado em ${formatDate(overview.latest_resume.uploaded_at)}`
                          : "Envie um currículo em PDF."}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="rounded-2xl border border-border bg-surface-muted p-4">
                        <p className="truncate text-sm font-semibold text-text">
                          {overview.latest_resume?.file_name || "Nenhum arquivo enviado"}
                        </p>
                      </div>
                      <Input
                        type="file"
                        accept=".pdf,application/pdf"
                        onChange={handleResumeFileChange}
                      />
                      <Button
                        onClick={() => void handleUploadResume()}
                        disabled={isUploading || !resumeFile}
                        className="w-full bg-primary text-primary-foreground"
                      >
                        {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                        Atualizar currículo
                      </Button>
                    </CardContent>
                  </Card>
                </div>
                <CandidatePortalPreAdmissionSummaryCard preAdmission={preAdmission} />

                {applicationHistory.length > 0 || activeApplication ? (
                  <Card className="mt-5 border-border bg-surface shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-base text-text">Candidaturas</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {activeApplication ? (
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
                      ) : null}
                      {applicationHistory.map((application) => (
                        <ApplicationCard
                          key={application.pipeline_id ?? `tp-${application.submitted_at}`}
                          application={application}
                        />
                      ))}
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
