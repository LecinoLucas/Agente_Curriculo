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

function CandidateVerticalTimeline({ timeline }: { timeline: CandidatePortalTimeline }) {
  return (
    <Card className="overflow-hidden border-[hsl(var(--border)/0.5)] shadow-xl">
      <CardHeader className="border-b border-[hsl(var(--border)/0.3)] bg-[hsl(var(--surface-muted)/0.3)]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-xl font-bold">Andamento da Candidatura</CardTitle>
            <CardDescription className="font-bold text-[hsl(var(--primary))] uppercase tracking-widest text-[10px]">
              Etapa atual: {timeline.current_step_label}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-8">
        <ol className="space-y-0">
          {timeline.steps.map((step, index) => {
            const isCurrent = step.status === "current";
            const isCompleted = step.status === "completed";
            const isClosed = step.status === "closed";
            
            return (
              <li key={step.key} className="relative flex gap-6 pb-10 last:pb-2">
                {index < timeline.steps.length - 1 ? (
                  <span className={`absolute left-[17px] top-10 h-[calc(100%-2.5rem)] w-0.5 rounded-full ${isCompleted ? 'bg-emerald-200' : 'bg-[hsl(var(--border)/0.4)]'}`} />
                ) : null}
                
                <div
                  className={[
                    "relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300",
                    isCurrent ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.05)] text-[hsl(var(--primary))] shadow-[0_0_12px_hsl(var(--primary)/0.2)]" : "",
                    isCompleted ? "border-emerald-500 bg-emerald-50 text-emerald-600" : "",
                    isClosed ? "border-slate-400 bg-slate-50 text-slate-600" : "",
                    !isCurrent && !isCompleted && !isClosed ? "border-[hsl(var(--border)/0.6)] bg-white text-[hsl(var(--text-muted)/0.5)]" : "",
                  ].join(" ")}
                >
                  {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : stepIcon(step)}
                </div>

                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm font-extrabold tracking-tight ${isCurrent ? 'text-[hsl(var(--text))] scale-105 origin-left' : isCompleted ? 'text-emerald-700' : 'text-[hsl(var(--text-muted))]'}`}>
                      {step.label}
                    </p>
                    {isCurrent && (
                      <span className="rounded-full bg-[hsl(var(--primary)/0.1)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-[hsl(var(--primary))]">
                        Foco
                      </span>
                    )}
                  </div>
                  <p className={`mt-1 text-xs font-medium leading-relaxed ${isCurrent ? 'text-[hsl(var(--text-muted))]' : 'text-[hsl(var(--text-muted)/0.7)]'}`}>
                    {step.description}
                  </p>
                  {step.interview ? (
                    <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-500">
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
  const [preAdmission, setPreAdmission] = useState<CandidatePortalPreAdmissionEnvelope | null>(null);
  const [assessmentLoadingId, setAssessmentLoadingId] = useState<string | null>(null);
  const [assessmentSaving, setAssessmentSaving] = useState(false);
  const [currentTab, setCurrentTab] = useState("inicio");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);

  const activeApplication: CandidatePortalActiveApplication | null =
    overview?.active_application ?? null;
  const applicationHistory: CandidatePortalApplication[] = overview?.application_history ?? [];
  const behavioralAssessments: BehavioralAssignmentSummary[] = behavioralAssessmentSummaries;

  async function loadPortalData(refresh = false) {
    if (refresh) {
      setIsRefreshing(true);
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

  useEffect(() => {
    const poll = () => {
      if (document.hidden) return;
      if (!loading && !isRefreshing && !isSaving && !isUploading && !assessmentSaving) {
        void loadPortalData(true);
      }
    };

    const intervalId = setInterval(poll, 15000);

    const handleVisibility = () => {
      if (!document.hidden) poll();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loading, isRefreshing, isSaving, isUploading, assessmentSaving]);

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
      await candidatePortalService.logout();
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
    if (!selectedAssessment) return;
    setAssessmentSaving(true);
    try {
      const detail = await candidatePortalService.submitBehavioralAssessment(selectedAssessment.id, answers);
      setSelectedAssessment(detail);
      await loadPortalData(true);
      toast.success("Avaliação enviada.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível enviar a avaliação.";
      toast.error(message);
    } finally {
      setAssessmentSaving(false);
    }
  };

  const reloadPreAdmission = async () => {
    const payload = await candidatePortalService.getPreAdmission();
    setPreAdmission(payload);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--bg))] px-4">
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-16 w-16">
            <div className="absolute inset-0 animate-ping rounded-full bg-[hsl(var(--primary)/0.2)]" />
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-[hsl(var(--primary))] border-t-transparent animate-spin" />
          </div>
          <p className="text-sm font-bold text-[hsl(var(--text-muted))] uppercase tracking-widest">
            Autenticando seu portal…
          </p>
        </div>
      </div>
    );
  }

  if (loadError || !overview) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--bg))] px-4">
        <Card className="w-full max-w-lg shadow-2xl border-[hsl(var(--border)/0.5)]">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--danger-soft))] text-[hsl(var(--danger))]">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl font-bold">Portal Indisponível</CardTitle>
            <CardDescription>
              Não conseguimos sincronizar seus dados agora.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 text-center">
            <p className="text-sm text-[hsl(var(--text-muted))]">
              {loadError ?? "Sua sessão pode ter expirado por inatividade."}
            </p>
            <div className="flex flex-col gap-3">
              <Button 
                onClick={() => void loadPortalData()} 
                className="h-11 bg-[hsl(var(--primary))] font-bold hover:bg-[hsl(var(--primary)/0.9)]"
              >
                Tentar reconectar
              </Button>
              <Button variant="ghost" asChild className="text-[hsl(var(--text-muted))]">
                <Link to="/candidato/login">Voltar ao login</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[hsl(var(--bg))]">
      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 bg-[#5c061a] text-white transition-all duration-300 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 md:sticky md:top-0 md:h-screen md:flex md:flex-col ${isSidebarCollapsed ? 'w-64 md:w-[76px]' : 'w-64 md:w-64'}`}>
        <div className={`flex items-center h-16 border-b border-white/10 transition-all duration-300 ${isSidebarCollapsed ? 'px-4 justify-center' : 'px-6 justify-between'}`}>
          {!isSidebarCollapsed ? (
            <div className="flex items-center gap-2.5 animate-in fade-in duration-300 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-xs font-extrabold text-[#5c061a] shadow-sm">
                RA
              </div>
              <div className="flex flex-col text-left min-w-0">
                <span className="font-heading text-sm font-bold leading-tight text-white truncate">
                  Marajó RH
                </span>
                <span className="text-[10px] text-white/60 leading-tight truncate">
                  Portal do Candidato
                </span>
              </div>
            </div>
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-xs font-extrabold text-[#5c061a] shadow-sm animate-in fade-in duration-300">
              RA
            </div>
          )}
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="hidden md:flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors"
            title={isSidebarCollapsed ? "Expandir menu" : "Recolher menu"}
          >
            {isSidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
          <button className="md:hidden" onClick={() => setIsSidebarOpen(false)}>
            <X className="h-6 w-6" />
          </button>
        </div>
        <nav className={`flex-1 py-6 space-y-2 transition-all duration-300 ${isSidebarCollapsed ? 'px-2' : 'px-4'}`}>
          {[
            { id: "inicio", label: "Início", icon: <Home className="h-5 w-5" /> },
            { id: "vagas", label: "Minhas Candidaturas", icon: <Briefcase className="h-5 w-5" /> },
            { id: "avaliacoes", label: "Avaliações", icon: <ClipboardCheck className="h-5 w-5" /> },
            { id: "perfil", label: "Meu Perfil", icon: <User className="h-5 w-5" /> },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setCurrentTab(tab.id);
                setIsSidebarOpen(false);
              }}
              title={isSidebarCollapsed ? tab.label : undefined}
              className={`flex items-center font-bold text-sm rounded-xl transition-all duration-300 ${
                isSidebarCollapsed ? 'justify-center p-3 w-full' : 'gap-3 px-4 py-3 w-full'
              } ${
                currentTab === tab.id
                  ? "bg-white/20 text-white"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              {tab.icon}
              {!isSidebarCollapsed && (
                <span className="truncate animate-in fade-in duration-300">
                  {tab.label}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className={`border-t border-white/10 transition-all duration-300 ${isSidebarCollapsed ? 'p-2' : 'p-4'}`}>
          <Button 
            variant="outline" 
            onClick={handleLogout} 
            title={isSidebarCollapsed ? "Sair" : undefined}
            className={`border-white/20 bg-white/5 font-bold text-white backdrop-blur-md hover:bg-[hsl(var(--danger))] hover:border-[hsl(var(--danger))] transition-all duration-300 ${
              isSidebarCollapsed ? 'w-full h-10 p-0 justify-center' : 'w-full h-10'
            }`}
          >
            <LogOut className={`h-4 w-4 transition-all duration-300 ${isSidebarCollapsed ? '' : 'mr-2'}`} />
            {!isSidebarCollapsed && (
              <span className="truncate animate-in fade-in duration-300">
                Sair
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between h-16 px-6 bg-[hsl(var(--surface))] border-b border-[hsl(var(--border)/0.5)] shadow-sm">
          <div className="flex items-center gap-4">
            <button className="md:hidden" onClick={() => setIsSidebarOpen(true)}>
              <Menu className="h-6 w-6 text-[hsl(var(--text))]" />
            </button>
            <h1 className="font-heading text-xl font-bold text-[hsl(var(--text))]">
              Olá, {overview.candidate.full_name.split(' ')[0]}!
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 text-sm font-medium text-[hsl(var(--text-muted))]">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              {overview.status_public}
            </div>
            <Button
              variant="outline"
              onClick={() => void loadPortalData(true)}
              disabled={isRefreshing}
              className="h-9 border-[hsl(var(--border)/0.6)] text-xs font-bold text-[hsl(var(--text))] hover:bg-[hsl(var(--surface-muted)/0.1)]"
            >
              {isRefreshing ? (
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-3 w-3" />
              )}
              Sincronizar
            </Button>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-8">

        {/* Tab Content */}
        {currentTab === "inicio" && (
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            {/* Main Content Column */}
            <div className="space-y-8">
              {/* Timeline Section */}
              {overview.public_timeline ? (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <CandidateVerticalTimeline timeline={overview.public_timeline} />
                </div>
              ) : null}
            </div>

            {/* Sidebar Column */}
            <div className="space-y-8">
              {/* Quick Status Card */}
              <Card className="overflow-hidden border-none bg-gradient-to-br from-[hsl(var(--surface))] to-[hsl(var(--surface-muted))] shadow-2xl ring-1 ring-[hsl(var(--border)/0.5)] animate-in fade-in slide-in-from-right-4 duration-500">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg font-bold">Resumo da Situação</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: "Vaga Ativa", val: activeApplication?.job_title || "Disponível", icon: <Briefcase className="h-4 w-4" /> },
                      { label: "Status", val: overview.status_public, icon: <ShieldCheck className="h-4 w-4" />, highlight: true },
                      { label: "Localização", val: overview.candidate.city ? `${overview.candidate.city}/${overview.candidate.state}` : "Pendente", icon: <MapPin className="h-4 w-4" /> },
                      { label: "Currículo", val: overview.latest_resume?.file_name ? "Enviado" : "Não ident.", icon: <FileText className="h-4 w-4" /> },
                    ].map((item, i) => (
                      <div key={i} className="rounded-2xl border border-[hsl(var(--border)/0.3)] bg-white/40 p-4 backdrop-blur-sm">
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--text-muted))]">
                          {item.icon}
                          {item.label}
                        </div>
                        <p className={`mt-2 text-sm font-extrabold truncate ${item.highlight ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--text))]'}`}>
                          {item.val}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <CandidateMessagesCard />
            </div>
          </div>
        )}

        {currentTab === "vagas" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Application History Card */}
            <Card className="overflow-hidden border-[hsl(var(--border)/0.5)] shadow-xl">
              <CardHeader className="border-b border-[hsl(var(--border)/0.3)] bg-[hsl(var(--surface-muted)/0.3)]">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                    <Briefcase className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-bold">Minhas Candidaturas</CardTitle>
                    <CardDescription>Histórico e situação de todos os seus envios.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                {activeApplication ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-widest text-[hsl(var(--primary))]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--primary))] animate-pulse" />
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
                  <div className="space-y-4 border-t border-[hsl(var(--border)/0.4)] pt-6">
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-[hsl(var(--text-muted))]">
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
                  <div className="flex flex-col items-center justify-center py-10 text-center gap-3 rounded-2xl border-2 border-dashed border-[hsl(var(--border)/0.4)]">
                    <p className="text-sm font-semibold text-[hsl(var(--text-muted))]">Você está no nosso Banco de Talentos.</p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        )}

        {currentTab === "avaliacoes" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Behavioral Assessments Card */}
            <Card className="overflow-hidden border-[hsl(var(--border)/0.5)] shadow-xl">
              <CardHeader className="border-b border-[hsl(var(--border)/0.3)] bg-[hsl(var(--surface-muted)/0.3)]">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]">
                    <ClipboardCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-bold">Avaliação Comportamental</CardTitle>
                    <CardDescription>Responda para completar seu perfil de match.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                {behavioralAssessments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center gap-3 rounded-2xl border-2 border-dashed border-[hsl(var(--border)/0.4)]">
                    <div className="h-12 w-12 text-[hsl(var(--text-muted)/0.3)]">
                      <CheckCircle2 className="h-full w-full" />
                    </div>
                    <p className="text-sm font-semibold text-[hsl(var(--text-muted))]">Nenhuma avaliação pendente no momento.</p>
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

        {currentTab === "perfil" && (
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Left Column: Profile Update */}
            <div className="space-y-8">
              <Card className="border-[hsl(var(--border)/0.5)] shadow-xl">
                <CardHeader className="flex flex-row items-center justify-between border-b border-[hsl(var(--border)/0.3)] py-4">
                  <CardTitle className="text-base font-bold">Dados de Contato</CardTitle>
                  {!isEditing && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setIsEditing(true)}
                      className="h-8 text-[hsl(var(--primary))] font-bold hover:bg-[hsl(var(--primary)/0.05)]"
                    >
                      Editar
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  <div className="grid gap-5">
                    {[
                      { id: "email", label: "E-mail Profissional", type: "email", val: contactForm.email },
                      { id: "phone", label: "Telefone / WhatsApp", type: "text", val: contactForm.phone },
                      { id: "city", label: "Cidade", type: "text", val: contactForm.city },
                      { id: "state", label: "Estado (UF)", type: "text", val: contactForm.state, max: 2 },
                    ].map((field) => (
                      <div key={field.id} className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--text-muted))]">
                          {field.label}
                        </label>
                        <Input
                          id={`candidate-${field.id}`}
                          type={field.type}
                          maxLength={field.max}
                          value={field.val}
                          disabled={!isEditing || isSaving}
                          className="h-11 border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface-muted)/0.2)] font-medium focus:ring-[hsl(var(--primary))]"
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
                        className="flex-1 bg-[hsl(var(--primary))] font-bold"
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
                        className="font-bold"
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
              <Card className="border-[hsl(var(--border)/0.5)] shadow-xl">
                <CardHeader className="py-4">
                  <CardTitle className="text-base font-bold text-[hsl(var(--text))]">Atualizar Currículo</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex items-center gap-4 rounded-2xl border border-[hsl(var(--border)/0.4)] bg-[hsl(var(--surface-muted)/0.1)] p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm text-[hsl(var(--primary))]">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[hsl(var(--text))]">
                        {overview.latest_resume?.file_name || "Nenhum arquivo"}
                      </p>
                      <p className="text-[10px] font-medium text-[hsl(var(--text-muted))]">
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
                      className="flex h-24 w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[hsl(var(--border)/0.6)] bg-[hsl(var(--bg))] transition-all hover:bg-[hsl(var(--surface-muted)/0.1)] hover:border-[hsl(var(--primary)/0.5)]"
                    >
                      <Upload className="mb-2 h-6 w-6 text-[hsl(var(--text-muted))]" />
                      <span className="text-xs font-bold text-[hsl(var(--text-muted))]">
                        {resumeFile ? resumeFile.name : "Clique para selecionar novo PDF"}
                      </span>
                    </label>
                  </div>

                  <Button 
                    onClick={() => void handleUploadResume()} 
                    disabled={isUploading || !resumeFile}
                    className="w-full bg-[hsl(var(--primary))] font-bold disabled:opacity-50"
                  >
                    {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                    Fazer Upload Agora
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
