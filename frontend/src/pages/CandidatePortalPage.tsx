import {
  Briefcase,
  CheckCircle2,
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
  type CandidateAssessmentSummary,
} from "../services/candidatePortalService";
import { HttpError } from "../services/http";
import { formatPhone } from "../features/public-application/utils/phone";
import { toast } from "../shared/utils/toast";

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
    <div className="rounded-xl border border-border/70 bg-background/80 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">
            {application.talent_pool
              ? "Banco de Talentos"
              : application.job_title || "Vaga vinculada"}
          </p>
          <p className="text-xs text-muted-foreground">
            Enviada em {formatDate(application.submitted_at)}
          </p>
        </div>
        <span className="inline-flex w-fit rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
          {application.status_label}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground">Origem</p>
          <p className="text-sm font-medium text-foreground">
            {sourceLabel(application.application_source)}
          </p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground">Currículo</p>
          <p className="text-sm font-medium text-foreground">
            {application.resume_file_name || "Sem arquivo identificado"}
          </p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground">Atualizada em</p>
          <p className="text-sm font-medium text-foreground">
            {formatDate(application.updated_at)}
          </p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground">
            {application.talent_pool ? "Perfil" : "Situação"}
          </p>
          <p className="text-sm font-medium text-foreground">
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
    <Card>
      <CardHeader>
        <CardTitle>Andamento da candidatura</CardTitle>
        <CardDescription>{timeline.current_step_label}</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-0">
          {timeline.steps.map((step, index) => {
            const isCurrent = step.status === "current";
            const isCompleted = step.status === "completed";
            const isClosed = step.status === "closed";
            return (
              <li key={step.key} className="relative flex gap-4 pb-6 last:pb-0">
                {index < timeline.steps.length - 1 ? (
                  <span className="absolute left-[15px] top-8 h-[calc(100%-2rem)] w-px bg-border" />
                ) : null}
                <span
                  className={[
                    "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-card",
                    isCurrent ? "border-primary text-primary" : "",
                    isCompleted ? "border-emerald-500 text-emerald-600" : "",
                    isClosed ? "border-slate-400 text-slate-600" : "",
                    !isCurrent && !isCompleted && !isClosed ? "border-border text-muted-foreground" : "",
                  ].join(" ")}
                >
                  {stepIcon(step)}
                </span>
                <div className="min-w-0 flex-1 pt-1">
                  <p className="text-sm font-semibold text-foreground">{step.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
                  {step.interview ? <CandidateInterviewInfo interview={step.interview} /> : null}
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

function assessmentTypeLabel(type: CandidateAssessmentSummary["type"]): string {
  return type === "behavioral_test" ? "Teste comportamental" : "Pesquisa comportamental";
}

function assessmentActionLabel(type: CandidateAssessmentSummary["type"]): string {
  return type === "behavioral_test" ? "Iniciar teste" : "Responder pesquisa";
}

function assessmentStatusLabel(status: CandidateAssessmentSummary["status"]): string {
  if (status === "completed") return "Concluído";
  if (status === "in_progress") return "Em andamento";
  if (status === "expired") return "Expirado";
  if (status === "cancelled") return "Cancelado";
  return "Pendente";
}

function CandidateAssessmentsCard({ assessments }: { assessments: CandidateAssessmentSummary[] }) {
  if (assessments.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Avaliações pendentes</CardTitle>
        <CardDescription>
          Suas respostas serão usadas exclusivamente para fins de recrutamento e seleção.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {assessments.map((assessment) => {
          const isCompleted = assessment.status === "completed";
          return (
            <div key={assessment.id} className="rounded-xl border border-border/70 bg-background/80 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {assessment.title || assessmentTypeLabel(assessment.type)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {assessmentTypeLabel(assessment.type)} · {assessmentStatusLabel(assessment.status)}
                  </p>
                </div>
                {isCompleted ? (
                  <span className="inline-flex w-fit rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    Concluído
                  </span>
                ) : (
                  <Button asChild size="sm">
                    <Link to={`/candidato/portal/avaliacoes/${assessment.id}`}>
                      {assessmentActionLabel(assessment.type)}
                    </Link>
                  </Button>
                )}
              </div>
              {assessment.description ? (
                <p className="mt-3 text-sm text-muted-foreground">{assessment.description}</p>
              ) : null}
            </div>
          );
        })}
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

  const activeApplication: CandidatePortalActiveApplication | null =
    overview?.active_application ?? null;
  const applicationHistory: CandidatePortalApplication[] = overview?.application_history ?? [];

  async function loadPortalData(refresh = false) {
    if (refresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setLoadError(null);

    try {
      const overviewResponse = await candidatePortalService.getOverview();
      setOverview(overviewResponse);
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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando seu portal...
        </div>
      </div>
    );
  }

  if (loadError || !overview) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Portal do candidato</CardTitle>
            <CardDescription>
              Não foi possível carregar suas informações agora.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {loadError ?? "Sua sessão pode ter expirado."}
            </p>
            <div className="flex gap-3">
              <Button onClick={() => void loadPortalData()}>Tentar novamente</Button>
              <Button variant="outline" asChild>
                <Link to="/candidato/login">Voltar ao login</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="rounded-3xl border border-border/70 bg-gradient-to-r from-primary to-sky-700 px-6 py-6 text-primary-foreground shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary-foreground/70">
                Portal do candidato
              </p>
              <h1 className="text-3xl font-semibold tracking-tight">{overview.candidate.full_name}</h1>
              <div className="flex flex-wrap items-center gap-3 text-sm text-primary-foreground/85">
                <span>{overview.status_public}</span>
                <span>{overview.candidate.cpf_masked}</span>
                <span>{overview.candidate.application_source_label}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                onClick={() => void loadPortalData(true)}
                disabled={isRefreshing}
              >
                {isRefreshing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Atualizar
              </Button>
              <Button variant="outline" onClick={handleLogout} className="border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white">
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-6 order-2 lg:order-1">
            {overview.public_timeline ? (
              <CandidateVerticalTimeline timeline={overview.public_timeline} />
            ) : null}

            <CandidateAssessmentsCard assessments={overview.assessments ?? []} />

            <Card>
              <CardHeader>
                <CardTitle>Minhas candidaturas</CardTitle>
                <CardDescription>
                  Acompanhe seus envios sem expor score, ranking ou comentários internos.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {activeApplication ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Candidatura ativa
                    </p>
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
                ) : (
                  <div className="rounded-xl border border-border/70 bg-background/80 p-4 text-sm text-muted-foreground">
                    Banco de Talentos
                  </div>
                )}
                {applicationHistory.length > 0 ? (
                  <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Histórico
                  </p>
                ) : null}
                {applicationHistory.map((application) => (
                  <ApplicationCard
                    key={application.pipeline_id ?? `talent-pool-${application.submitted_at}`}
                    application={application}
                  />
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6 order-1 lg:order-2">
            <Card>
              <CardHeader>
                <CardTitle>Minha candidatura</CardTitle>
                <CardDescription>
                  Resumo da situação mais recente.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Briefcase className="h-4 w-4" />
                      Vaga
                    </div>
                    <p className="mt-2 text-sm font-semibold text-foreground">
                      {activeApplication?.is_talent_pool
                        ? "Banco de Talentos"
                        : activeApplication?.job_title || "Sem vaga vinculada"}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <ShieldCheck className="h-4 w-4" />
                      Status
                    </div>
                    <p className="mt-2 text-sm font-semibold text-foreground">
                      {overview.status_public}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      Localização
                    </div>
                    <p className="mt-2 text-sm font-semibold text-foreground">
                      {overview.candidate.city && overview.candidate.state
                        ? `${overview.candidate.city}/${overview.candidate.state}`
                        : "Não informada"}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <FileText className="h-4 w-4" />
                      Currículo
                    </div>
                    <p className="mt-2 text-sm font-semibold text-foreground">
                      {overview.latest_resume?.file_name || "Nenhum currículo identificado"}
                    </p>
                    {overview.latest_resume ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {extractionLabel(overview.latest_resume.extraction_status)}
                      </p>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Dados de contato</CardTitle>
                <CardDescription>
                  Atualize telefone, e-mail e localização.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="candidate-email" className="text-sm font-medium text-foreground">
                      E-mail
                    </label>
                    <Input
                      id="candidate-email"
                      type="email"
                      value={contactForm.email}
                      disabled={!isEditing || isSaving}
                      onChange={(event) => handleContactChange("email", event.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="candidate-phone" className="text-sm font-medium text-foreground">
                      Telefone
                    </label>
                    <Input
                      id="candidate-phone"
                      value={contactForm.phone}
                      disabled={!isEditing || isSaving}
                      onChange={(event) => handleContactChange("phone", event.target.value)}
                    />
                    {!isEditing && contactForm.phone ? (
                      <p className="text-xs text-muted-foreground">
                        {formatPhone(contactForm.phone)}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="candidate-city" className="text-sm font-medium text-foreground">
                      Cidade
                    </label>
                    <Input
                      id="candidate-city"
                      value={contactForm.city}
                      disabled={!isEditing || isSaving}
                      onChange={(event) => handleContactChange("city", event.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="candidate-state" className="text-sm font-medium text-foreground">
                      UF
                    </label>
                    <Input
                      id="candidate-state"
                      maxLength={2}
                      value={contactForm.state}
                      disabled={!isEditing || isSaving}
                      onChange={(event) => handleContactChange("state", event.target.value.toUpperCase())}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  {isEditing ? (
                    <>
                      <Button onClick={() => void handleSaveProfile()} disabled={isSaving}>
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Salvar dados
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
                    </>
                  ) : (
                    <Button onClick={() => setIsEditing(true)}>Atualizar telefone/e-mail</Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Currículo</CardTitle>
                <CardDescription>
                  Envie uma versão nova do seu currículo em PDF.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border border-dashed border-border bg-background/70 p-4">
                  <div className="flex items-start gap-3">
                    <FileText className="mt-0.5 h-5 w-5 text-primary" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        {overview.latest_resume?.file_name || "Nenhum currículo enviado"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {overview.latest_resume
                          ? `Último envio em ${formatDate(overview.latest_resume.uploaded_at)}`
                          : "Ao enviar um currículo novo, a extração começa automaticamente."}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <Input
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handleResumeFileChange}
                  />
                  {resumeFile ? (
                    <p className="text-xs text-muted-foreground">{resumeFile.name}</p>
                  ) : null}
                </div>

                <Button onClick={() => void handleUploadResume()} disabled={isUploading}>
                  {isUploading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  Enviar novo currículo
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Resumo do cadastro</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-background/70 p-4">
                  <Mail className="mt-0.5 h-4 w-4 text-primary" />
                  <div>
                    <p className="text-xs text-muted-foreground">E-mail atual</p>
                    <p className="text-sm font-medium text-foreground">
                      {overview.candidate.email || "Não informado"}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-background/70 p-4">
                  <Phone className="mt-0.5 h-4 w-4 text-primary" />
                  <div>
                    <p className="text-xs text-muted-foreground">Telefone atual</p>
                    <p className="text-sm font-medium text-foreground">
                      {overview.candidate.phone ? formatPhone(overview.candidate.phone) : "Não informado"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
