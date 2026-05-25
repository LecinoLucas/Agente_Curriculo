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
  Settings,
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
import { HttpError } from "../services/http";
import { formatPhone } from "../features/public-application/utils/phone";
import { toast } from "../shared/utils/toast";
import { BehavioralAssessmentCard } from "../features/candidate-portal/components/BehavioralAssessmentCard";
import { BehavioralAssessmentForm } from "../features/candidate-portal/components/BehavioralAssessmentForm";
import { CandidateMessagesCard } from "../features/candidate-portal/components/CandidateMessagesCard";
import { CandidatePortalPreAdmissionCard } from "../features/candidate-portal/components/CandidatePortalPreAdmissionCard";

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
    <div className="group rounded-2xl border border-[hsl(var(--border)/0.5)] bg-[hsl(var(--surface))] p-5 shadow-sm transition-all hover:border-[hsl(var(--primary)/0.3)] hover:shadow-md">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <p className="font-heading text-base font-bold tracking-tight text-[hsl(var(--text))] group-hover:text-[hsl(var(--primary))] transition-colors">
            {application.talent_pool
              ? "Banco de Talentos Marajó"
              : application.job_title || "Vaga vinculada"}
          </p>
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--text-muted))]">
            <Clock3 className="h-3 w-3" />
            Enviada em {formatDate(application.submitted_at)}
          </p>
        </div>
        <span className="inline-flex w-fit items-center rounded-full bg-[hsl(var(--primary)/0.08)] px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-[hsl(var(--primary))] ring-1 ring-inset ring-[hsl(var(--primary)/0.1)]">
          {application.status_label}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-[hsl(var(--border)/0.3)] pt-5 sm:grid-cols-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--text-muted))]">Origem</p>
          <p className="mt-1 text-xs font-semibold text-[hsl(var(--text))]">
            {sourceLabel(application.application_source)}
          </p>
        </div>

        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--text-muted))]">Currículo</p>
          <p className="mt-1 truncate text-xs font-semibold text-[hsl(var(--text))]">
            {application.resume_file_name || "Sem arquivo"}
          </p>
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--text-muted))]">Última Att</p>
          <p className="mt-1 text-xs font-semibold text-[hsl(var(--text))]">
            {formatDate(application.updated_at).split(',')[0]}
          </p>
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--text-muted))]">
            {application.talent_pool ? "Status Perfil" : "Situação"}
          </p>
          <p className="mt-1 text-xs font-bold text-[hsl(var(--primary))]">
            {application.talent_pool
              ? extractionLabel(application.talent_pool_profile_status)
              : application.status_label}
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

function CandidateInterviewInfo({ interview }: { interview: CandidatePortalPublicInterview }) {
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

  const format = interviewFormatLabel(interview.interview_format);
  return (
    <div className="mt-3 space-y-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-3 text-sm">
      <p className="font-medium text-foreground">
        Entrevista agendada para {formatInterviewDate(interview.scheduled_at)}.
      </p>
      {format ? <p className="text-muted-foreground">Formato: {format}.</p> : null}
      {interview.location ? <p className="text-muted-foreground">Local: {interview.location}</p> : null}
      {interview.meeting_url ? (
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

function CandidateVerticalTimeline({ timeline }: { timeline: CandidatePortalTimeline }) {
  return (
    <Card className="overflow-hidden border border-[#eae6e2] rounded-[1.25rem] bg-white shadow-sm">
      <CardHeader className="p-4 pb-2.5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-[#5c061a]">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base font-bold text-slate-900">Andamento da Candidatura</CardTitle>
            <CardDescription className="font-extrabold text-[#5c061a] uppercase tracking-widest text-[9px] mt-1">
              Etapa atual: {timeline.current_step_label}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-4 pb-2">
        <ol className="relative space-y-0 pl-1">
          {timeline.steps.map((step, index) => {
            const isCurrent = step.status === "current";
            const isCompleted = step.status === "completed";
            const isClosed = step.status === "closed";
            const isDone = isCompleted || isClosed || isCurrent;
            
            return (
              <li key={step.key} className="relative flex gap-5 pb-4 last:pb-1">
                {index < timeline.steps.length - 1 ? (
                  <span className={`absolute left-[17px] top-9 h-[calc(100%-2.25rem)] w-0.5 rounded-full ${isDone ? 'bg-[#5c061a]' : 'bg-slate-100'}`} />
                ) : null}
                
                <div
                  className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                    isDone
                      ? "bg-[#5c061a] border-[#5c061a] text-white shadow-sm"
                      : "bg-white border-slate-200 text-slate-300"
                  }`}
                >
                  {isDone ? (
                    <svg className="h-4.5 w-4.5 stroke-[3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <div className="h-2.5 w-2.5 rounded-full bg-slate-100" />
                  )}
                </div>

                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm font-bold tracking-tight ${isCurrent ? 'text-slate-900 font-extrabold' : 'text-slate-600'}`}>
                      {step.label}
                    </p>
                    {isCurrent && (
                      <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#5c061a]">
                        Foco
                      </span>
                    )}
                  </div>
                  <p className={`mt-1 text-xs font-semibold leading-relaxed text-slate-400`}>
                    {getStepDescription(step)}
                  </p>
                  {step.interview ? (
                    <div className="mt-3 animate-in fade-in slide-in-from-top-2 duration-500">
                      <CandidateInterviewInfo interview={step.interview} />
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

const getNextStepsData = (timeline: CandidatePortalTimeline | null) => {
  if (!timeline) {
    return [
      { label: "Análise de perfil", status: "Aguardando" },
      { label: "Entrevista", status: "Aguardando" },
      { label: "Resultado", status: "Aguardando" },
    ];
  }

  const stepsKeys = timeline.steps.map((s) => s.key);

  const getStepStatusByKey = (key: string) => {
    const idx = stepsKeys.indexOf(key);
    if (idx === -1) return "Aguardando";
    const step = timeline.steps[idx];
    if (step.status === "completed" || step.status === "closed") return "Concluído";
    if (step.status === "current") return "Em andamento";
    if (idx > 0 && timeline.steps[idx - 1].status === "current") return "Em breve";
    return "Aguardando";
  };

  return [
    {
      label: "Análise de perfil",
      status: getStepStatusByKey("resume_analysis"),
    },
    {
      label: "Entrevista",
      status: getStepStatusByKey("interview"),
    },
    {
      label: "Resultado",
      status: getStepStatusByKey("result"),
    },
  ];
};

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
  const [currentTab, setCurrentTab] = useState("inicio");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [messagesRefreshTrigger, setMessagesRefreshTrigger] = useState(0);
  const [activeMenuId, setActiveMenuId] = useState("inicio");

  useEffect(() => {
    if (currentTab === "inicio" && activeMenuId !== "inicio" && activeMenuId !== "mensagens") {
      setActiveMenuId("inicio");
    } else if (currentTab === "vagas" && activeMenuId !== "vagas" && activeMenuId !== "candidaturas") {
      setActiveMenuId("vagas");
    } else if (currentTab === "avaliacoes" && activeMenuId !== "avaliacoes") {
      setActiveMenuId("avaliacoes");
    } else if (currentTab === "perfil" && activeMenuId !== "perfil" && activeMenuId !== "configuracoes") {
      setActiveMenuId("perfil");
    }
  }, [currentTab, activeMenuId]);

  const activeApplication: CandidatePortalActiveApplication | null =
    overview?.active_application ?? null;
  const applicationHistory: CandidatePortalApplication[] = overview?.application_history ?? [];
  const behavioralAssessments: BehavioralAssignmentSummary[] = behavioralAssessmentSummaries;
  const pendingBehavioralAssessments = behavioralAssessments.filter(
    (item) => item.status === "pending" || item.status === "in_progress",
  );

  async function loadPortalData(refresh = false) {
    if (refresh) {
      setIsRefreshing(true);
      setMessagesRefreshTrigger((prev) => prev + 1);
    } else {
      setLoading(true);
    }
    setLoadError(null);

    try {
      const [overviewResponse, assessmentsResponse, preAdmissionResponse] = await Promise.all([
        candidatePortalService.getOverview(),
        candidatePortalService.listBehavioralAssessments(),
        candidatePortalService.getPreAdmission(),
      ]);
      setOverview(overviewResponse);
      setBehavioralAssessmentSummaries(assessmentsResponse);
      setPreAdmission(preAdmissionResponse);
      setContactForm(buildContactForm(overviewResponse));
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) {
        navigate("/candidato/login", { replace: true });
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
      navigate("/candidato/login", { replace: true });
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

  const reloadPreAdmission = async () => {
    const payload = await candidatePortalService.getPreAdmission();
    setPreAdmission(payload);
  };

  const handleMenuClick = (menuId: string) => {
    setActiveMenuId(menuId);
    if (menuId === "configuracoes") {
      setCurrentTab("perfil");
    } else if (menuId === "candidaturas" || menuId === "vagas") {
      setCurrentTab("vagas");
    } else if (menuId === "avaliacoes") {
      setCurrentTab("avaliacoes");
    } else if (menuId === "perfil") {
      setCurrentTab("perfil");
    } else if (menuId === "mensagens") {
      setCurrentTab("inicio");
      setTimeout(() => {
        const messagesEl = document.getElementById("candidate-messages-section");
        if (messagesEl) {
          messagesEl.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 100);
    } else {
      setCurrentTab("inicio");
    }
    setIsSidebarOpen(false);
  };

  if (loadError || (!overview && !loading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf8f6] px-4">
        <Card className="w-full max-w-lg border border-[#eae6e2] rounded-[1.25rem] bg-white shadow-md p-6">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-[#5c061a]">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl font-bold text-slate-805">Portal Indisponível</CardTitle>
            <CardDescription className="text-slate-450">
              Não conseguimos sincronizar seus dados agora.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 text-center pt-2">
            <p className="text-sm text-slate-500 font-medium">
              {loadError ?? "Sua sessão pode ter expirado por inatividade."}
            </p>
            <div className="flex flex-col gap-3">
              <Button 
                onClick={() => void loadPortalData()} 
                className="h-11 bg-[#5c061a] hover:bg-[#4c0515] text-white font-bold rounded-xl shadow-sm transition-colors"
              >
                Tentar reconectar
              </Button>
              <Button variant="ghost" asChild className="text-slate-400 hover:text-slate-600 font-bold">
                <Link to="/candidato/login">Voltar ao login</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#faf8f6]">
      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 bg-[#5c061a] text-white transition-all duration-300 transform ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0 md:sticky md:top-0 md:h-screen md:flex md:flex-col w-52 shrink-0 shadow-lg`}
      >
        <div className="flex items-center h-14 px-5 border-b border-white/5 justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <svg viewBox="0 0 24 24" className="h-8 w-8 text-white fill-current shrink-0">
              <path d="M4 18V6h3.5l4.5 7.5L16.5 6H20v12h-3V10l-5 8.25L7 10v8H4z" />
            </svg>
            <div className="flex flex-col text-left">
              <span className="font-heading text-sm font-black tracking-widest text-white leading-none">
                MARAJÓ
              </span>
              <span className="text-[10px] font-extrabold text-white/70 tracking-widest leading-none mt-1">
                RH
              </span>
            </div>
          </div>
          <button className="md:hidden p-1.5 rounded-lg hover:bg-white/10" onClick={() => setIsSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <nav className="flex-1 py-4 px-3 space-y-1">
          {[
            { id: "inicio", label: "Dashboard", title: "Dashboard", icon: <Home className="h-5 w-5" /> },
            { id: "vagas", label: "Vagas", title: "Vagas", icon: <Briefcase className="h-5 w-5" /> },
            { id: "candidaturas", label: "Candidaturas", title: "Candidaturas", icon: <Briefcase className="h-5 w-5" /> },
            { id: "avaliacoes", label: "Avaliações", title: "Avaliações", icon: <ClipboardCheck className="h-5 w-5" /> },
            { id: "perfil", label: "Perfil", title: "Perfil", icon: <User className="h-5 w-5" /> },
          ].map((item) => {
            const isActive = activeMenuId === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleMenuClick(item.id)}
                title={item.title}
                className={`flex items-center gap-2.5 px-3 py-2.5 w-full text-sm rounded-xl transition-all duration-200 ${
                  isActive
                    ? "bg-white/15 text-white font-bold shadow-sm"
                    : "text-white/70 hover:bg-white/5 hover:text-white font-semibold"
                }`}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
        
        <div className="p-3 border-t border-white/5">
          <Button 
            variant="outline" 
            onClick={handleLogout} 
            title="Sair"
            className="w-full h-10 border-white/10 bg-white/5 font-bold text-white hover:bg-red-750 hover:border-red-750 transition-all rounded-xl flex items-center justify-center text-xs"
          >
            <LogOut className="h-4 w-4 mr-2" />
            <span className="truncate">Sair</span>
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between h-14 px-6 sm:px-8 bg-white border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-4">
            <button className="md:hidden p-1.5 rounded-lg hover:bg-slate-50 text-slate-600" onClick={() => setIsSidebarOpen(true)}>
              <Menu className="h-6 w-6" />
            </button>
            <div>
              <h1 className="font-heading text-lg sm:text-xl font-bold text-slate-800">
                Olá, {overview ? overview.candidate.full_name.split(' ')[0] : 'Candidato'}!
              </h1>
              <p className="text-[11px] font-semibold text-slate-400 mt-0.5">
                Acompanhe o andamento da sua candidatura.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {overview && (
              <div className="hidden sm:flex items-center gap-2.5 text-xs font-bold text-slate-500 bg-slate-50 px-3.5 py-2 rounded-full border border-slate-100">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                {overview.status_public}
              </div>
            )}
            <button
              onClick={() => void loadPortalData(true)}
              disabled={isRefreshing || loading}
              className="inline-flex items-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 font-bold px-4 py-2 rounded-xl text-xs sm:text-sm shadow-sm transition-all"
            >
              {isRefreshing ? (
                <Loader2 className="h-4 w-4 animate-spin text-[#5c061a]" />
              ) : (
                <RefreshCw className="h-4 w-4 text-[#5c061a]" />
              )}
              Sincronizar
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6">
          {loading ? (
            <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr] animate-pulse">
              <div className="space-y-5">
                <div className="bg-white border border-slate-100 rounded-[1.25rem] p-6 space-y-4">
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
                
                <div className="bg-white border border-slate-100 rounded-[1.25rem] p-6">
                  <div className="h-14 bg-slate-150 rounded-xl" />
                </div>
              </div>

              <div className="space-y-5">
                <div className="bg-white border border-slate-100 rounded-[1.25rem] p-6 space-y-4">
                  <div className="h-5 bg-slate-200 rounded w-1/3" />
                  <div className="grid grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="h-16 bg-slate-50 border border-slate-100 rounded-xl" />
                    ))}
                  </div>
                </div>
                
                <div className="bg-white border border-slate-100 rounded-[1.25rem] p-6 space-y-4">
                  <div className="h-5 bg-slate-200 rounded w-1/3" />
                  <div className="space-y-3">
                    <div className="h-10 bg-slate-100 rounded-xl" />
                    <div className="h-10 bg-slate-100 rounded-xl" />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {currentTab === "inicio" && overview && (
                <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
                  {/* Main Content Column */}
                  <div className="space-y-5">
                    {/* Timeline Section */}
                    {overview.public_timeline ? (
                      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <CandidateVerticalTimeline timeline={overview.public_timeline} />
                      </div>
                    ) : null}

                    {/* Próximos Passos Card */}
                    <Card className="overflow-hidden border border-[#eae6e2] rounded-[1.25rem] bg-white shadow-sm p-4 lg:p-5 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
                      <div className="flex flex-col md:flex-row md:items-center gap-4">
                        {/* Left branding */}
                        <div className="flex items-center gap-3.5 md:w-1/3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-[#5c061a]">
                            <Calendar className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-sm font-black text-slate-800 leading-tight">Próximos passos</h3>
                            <p className="text-[11px] font-semibold text-slate-400 mt-1 leading-normal">
                              Fique atento às próximas etapas do processo.
                            </p>
                          </div>
                        </div>

                        {/* Dividers & Steps */}
                        <div className="flex-1 grid grid-cols-3 gap-4 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6">
                          {getNextStepsData(overview.public_timeline).map((step, i) => (
                            <div key={i} className="flex flex-col items-center text-center">
                              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-slate-500">
                                {step.label === "Análise de perfil" ? (
                                  <User className="h-4.5 w-4.5 text-slate-500" />
                                ) : step.label === "Entrevista" ? (
                                  <Phone className="h-4.5 w-4.5 text-slate-500" />
                                ) : (
                                  <CheckCircle2 className="h-4.5 w-4.5 text-slate-500" />
                                )}
                              </div>
                              <p className="mt-2 text-xs font-bold text-slate-700 truncate w-full">{step.label}</p>
                              <p className={`mt-0.5 text-[9px] font-extrabold uppercase tracking-wider ${
                                step.status === "Em andamento"
                                  ? "text-[#5c061a]"
                                  : step.status === "Em breve"
                                  ? "text-amber-600"
                                  : "text-slate-400"
                              }`}>
                                {step.status}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </Card>
                  </div>

                  {/* Sidebar Column */}
                  <div className="space-y-5">
                    {/* Quick Status Card */}
                    <Card className="overflow-hidden border border-[#eae6e2] rounded-[1.25rem] bg-white shadow-sm animate-in fade-in slide-in-from-right-4 duration-500">
                      <CardHeader className="p-4 pb-2.5 border-b border-slate-100">
                        <CardTitle className="text-base font-bold text-slate-900">Resumo da Situação</CardTitle>
                      </CardHeader>
                      <CardContent className="p-4">
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            {
                              label: "Vaga Ativa",
                              val: activeApplication?.job_title || "Banco de Talentos Marajó",
                              icon: <Briefcase className="h-4.5 w-4.5" />,
                            },
                            {
                              label: "Status",
                              val: overview.status_public,
                              icon: <ShieldCheck className="h-4.5 w-4.5" />,
                              highlight: true,
                            },
                            {
                              label: "Localização",
                              val: overview.candidate.city
                                ? `${overview.candidate.city}/${overview.candidate.state}`
                                : "Aguardando atualização",
                              icon: <MapPin className="h-4.5 w-4.5" />,
                            },
                            {
                              label: "Currículo",
                              val: overview.latest_resume?.file_name ? "Enviado" : "Pendente",
                              icon: <FileText className="h-4.5 w-4.5" />,
                            },
                          ].map((item, i) => (
                            <div
                              key={i}
                              className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 flex gap-2.5 items-center min-w-0"
                            >
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50/70 text-[#5c061a]">
                                {item.icon}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 leading-none">
                                  {item.label}
                                </p>
                                <p
                                  className={`mt-1.5 text-xs font-black truncate leading-tight ${
                                    item.highlight ? "text-[#5c061a]" : "text-slate-800"
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

                    {pendingBehavioralAssessments.length > 0 ? (
                      <Card className="border border-amber-200 bg-amber-50/50 rounded-[1.25rem] shadow-sm animate-in fade-in duration-500">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base font-bold text-amber-900">
                            Avaliação comportamental pendente
                          </CardTitle>
                          <CardDescription className="text-amber-700">
                            Você possui {pendingBehavioralAssessments.length} avaliação(ões) aguardando resposta.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3 pt-0">
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
                            className="w-full bg-[#5c061a] hover:bg-[#480514] font-bold text-white h-10 rounded-xl"
                            onClick={() => handleMenuClick("avaliacoes")}
                          >
                            Responder avaliação
                          </Button>
                        </CardContent>
                      </Card>
                    ) : null}

                    {completedAssessment ? (
                      <Card className="border border-emerald-200 bg-emerald-50/50 rounded-[1.25rem] shadow-sm animate-in fade-in duration-500">
                        <CardHeader className="pb-3">
                          <CardTitle className="flex items-center gap-2 text-base font-bold text-emerald-900">
                            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                            Avaliação concluída
                          </CardTitle>
                          <CardDescription className="text-emerald-700">
                            {completedAssessment.template_name} foi enviada com sucesso.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <p className="text-xs font-bold text-emerald-950">
                            {completedAssessment.job_title || "Vaga vinculada"}
                          </p>
                        </CardContent>
                      </Card>
                    ) : null}

                    <div id="candidate-messages-section" className="animate-in fade-in duration-500">
                      <CandidateMessagesCard refreshTrigger={messagesRefreshTrigger} />
                    </div>
                  </div>
                </div>
              )}

              {currentTab === "vagas" && overview && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {/* Application History Card */}
                  <Card className="overflow-hidden border border-[#eae6e2] rounded-[1.25rem] bg-white shadow-sm">
                    <CardHeader className="pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-[#5c061a]">
                          <Briefcase className="h-5 w-5" />
                        </div>
                        <div>
                          <CardTitle className="text-base font-bold text-slate-900">Minhas Candidaturas</CardTitle>
                          <CardDescription className="text-xs font-semibold text-slate-400 mt-0.5 font-sans">Histórico e situação de todos os seus envios.</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-6 pt-6">
                      {activeApplication ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-widest text-[#5c061a]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#5c061a] animate-pulse" />
                            Candidatura em Destaque
                          </div>
                          <ApplicationCard
                            application={{
                              pipeline_id: activeApplication.pipeline_id,
                              job_id: activeApplication.job_id,
                              job_title: activeApplication.job_title,
                              status: activeApplication.pipeline_stage,
                              status_label: activeApplication.status_public,
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
                        <div className="space-y-4 border-t border-slate-100 pt-6">
                          <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
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
                        <div className="flex flex-col items-center justify-center py-10 text-center gap-3 rounded-2xl border-2 border-dashed border-slate-100">
                          <p className="text-sm font-semibold text-slate-500">Você está no nosso Banco de Talentos.</p>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </div>
              )}

              {currentTab === "avaliacoes" && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {/* Behavioral Assessments Card */}
                  <Card className="overflow-hidden border border-[#eae6e2] rounded-[1.25rem] bg-white shadow-sm">
                    <CardHeader className="pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-[#5c061a]">
                          <ClipboardCheck className="h-5 w-5" />
                        </div>
                        <div>
                          <CardTitle className="text-base font-bold text-slate-900">Avaliação Comportamental</CardTitle>
                          <CardDescription className="text-xs font-semibold text-slate-400 mt-0.5">Responda para completar seu perfil de match.</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-6">
                      {behavioralAssessments.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center gap-3 rounded-2xl border-2 border-dashed border-slate-100">
                          <div className="h-10 w-10 text-slate-200">
                            <CheckCircle2 className="h-full w-full" />
                          </div>
                          <p className="text-sm font-semibold text-slate-555">Nenhuma avaliação pendente no momento.</p>
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
                    <Card className="border border-[#eae6e2] rounded-[1.25rem] bg-white shadow-sm">
                      <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 py-4 px-6">
                        <CardTitle className="text-base font-bold text-slate-900">Dados de Contato</CardTitle>
                        {!isEditing && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setIsEditing(true)}
                            className="h-8 text-[#5c061a] hover:bg-rose-50 font-bold"
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
                              <label className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                                {field.label}
                              </label>
                              <Input
                                id={`candidate-${field.id}`}
                                type={field.type}
                                maxLength={field.max}
                                value={field.val}
                                disabled={!isEditing || isSaving}
                                className="h-11 border-slate-200 bg-slate-50/50 font-medium focus:ring-[#5c061a] rounded-xl"
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
                              className="flex-1 bg-[#5c061a] hover:bg-[#4c0515] font-bold text-white rounded-xl h-11 transition-colors"
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
                              className="font-bold border-slate-200 rounded-xl h-11"
                            >
                              Cancelar
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <CandidatePortalPreAdmissionCard
                      preAdmission={preAdmission}
                      onUploaded={reloadPreAdmission}
                    />
                  </div>

                  {/* Right Column: Resume Upload */}
                  <div className="space-y-8">
                    <Card className="border border-[#eae6e2] rounded-[1.25rem] bg-white shadow-sm">
                      <CardHeader className="py-4 px-6 border-b border-slate-100">
                        <CardTitle className="text-base font-bold text-slate-900">Atualizar Currículo</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-5 p-6">
                        <div className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-xs text-[#5c061a] border border-slate-100">
                            <FileText className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-slate-800">
                              {overview.latest_resume?.file_name || "Nenhum arquivo"}
                            </p>
                            <p className="text-[10px] font-semibold text-slate-450">
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
                            className="flex h-24 w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 transition-all hover:bg-slate-50 hover:border-[#5c061a]/30"
                          >
                            <Upload className="mb-2 h-6 w-6 text-slate-400" />
                            <span className="text-xs font-bold text-slate-400 px-4 text-center">
                              {resumeFile ? resumeFile.name : "Clique para selecionar novo PDF"}
                            </span>
                          </label>
                        </div>

                        <Button 
                          onClick={() => void handleUploadResume()} 
                          disabled={isUploading || !resumeFile}
                          className="w-full bg-[#5c061a] hover:bg-[#4c0515] font-bold text-white rounded-xl h-11 transition-colors"
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
      </div>
    </div>
  );
}
