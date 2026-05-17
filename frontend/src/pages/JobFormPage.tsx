import { ArrowLeft, ArrowRight, CheckCircle2, ChevronLeft, Circle, Loader2, Save, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { JobQualityBadge } from "../components/job/JobQualityBadge";
import { StatusPill } from "../components/common/StatusPill";
import { useAuth } from "../features/auth/useAuth";
import { SummaryRow } from "../shared/components/data-display/SummaryRow";
import { MessageList } from "../shared/components/feedback/MessageList";
import { JobFormBasicStep } from "../features/jobs/sections/JobFormBasicStep";
import { JobFormRequirementsStep } from "../features/jobs/sections/JobFormRequirementsStep";
import { JobFormMandatorySkillsStep } from "../features/jobs/sections/JobFormMandatorySkillsStep";
import { JobFormDifferentialsStep } from "../features/jobs/sections/JobFormDifferentialsStep";
import { JobFormDealBreakersStep } from "../features/jobs/sections/JobFormDealBreakersStep";
import { BehavioralTemplateSelector } from "../features/jobs/components/BehavioralTemplateSelector";
import { JobAssessmentPolicyStep } from "../features/jobs/components/JobAssessmentPolicyStep";
import { JobFormReviewStep } from "../features/jobs/sections/JobFormReviewStep";
import {
  buildCreateJobPayload,
  buildUpdateJobPayload,
  formatPublicationBlocker,
  JobFormValues,
} from "../features/jobs/jobFormConfig";
import { toForm } from "../features/jobs/utils/jobFormHelpers";
import { getPanelToneClasses } from "../features/jobs/utils/publicationState";
import { extractPublication422Details } from "../features/jobs/utils/errorHelpers";
import { useJobConfigurationAlerts } from "../hooks/useJobConfigurationAlerts";
import { useJobFormState } from "../features/jobs/hooks/useJobFormState";
import { useJobSkills } from "../features/jobs/hooks/useJobSkills";
import { useJobPublication } from "../features/jobs/hooks/useJobPublication";
import { formatErrorDetails, handleApiError } from "../shared/utils/errorHandler";
import { getJob, getJobQuality, publishJob, type CreateJobRequestPayload, type UpdateJobRequestPayload, updateJob, createJob } from "../services/jobsService";
import { jobSkillsService } from "../services/jobSkillsService";
import { skillEquivalencesService } from "../services/skillEquivalencesService";
import { toast } from "../shared/utils/toast";
import type { Job, BehavioralAssessmentTemplate } from "../types/domain";
import {
  formatJobStatus,
  formatSeniority,
  formatWorkModel,
  jobStatusTone,
} from "../utils/jobFormatters";

type StepId =
  | "basic"
  | "requirements"
  | "mandatory-skills"
  | "differentials"
  | "deal-breakers"
  | "behavioral"
  | "assessment-policy"
  | "review";

const STEPS: Array<{ id: StepId; label: string; hint: string }> = [
  { id: "basic", label: "Dados básicos", hint: "Contexto e resumo da vaga" },
  { id: "requirements", label: "Requisitos mínimos", hint: "Base obrigatória do matching" },
  { id: "mandatory-skills", label: "Essenciais", hint: "Use para as 3–5 competências centrais da vaga" },
  { id: "differentials", label: "Diferenciais", hint: "Bônus controlado para ferramentas e extras" },
  { id: "deal-breakers", label: "Critérios eliminatórios", hint: "Regras de bloqueio explícitas" },
  { id: "behavioral", label: "Avaliação comportamental", hint: "Selecione o template comportamental oficial" },
  { id: "assessment-policy", label: "Fluxo de avaliação", hint: "Configure os gates obrigatórios da decisão final" },
  { id: "review", label: "Revisão e publicação", hint: "Checklist final e mensagens do backend" },
];


export function JobFormPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const isEditing = Boolean(jobId);
  const {
    form,
    setForm,
    dealBreakerDraft,
    setDealBreakerDraft,
    addBehavioralRequirement,
    addDealBreaker,
    resetFormState,
  } = useJobFormState();
  const [activeStep, setActiveStep] = useState<StepId>("basic");
  const [currentJob, setCurrentJob] = useState<Job | null>(null);
  const [pageLoading, setPageLoading] = useState(isEditing);
  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [selectedTemplateStatus, setSelectedTemplateStatus] =
    useState<BehavioralAssessmentTemplate["status"] | null>(null);

  const refreshQuality = async (jobIdToRefresh: string) => {
    try {
      const quality = await getJobQuality(jobIdToRefresh);
      setJobQuality(quality);
    } catch {
      setJobQuality(null);
    }
  };

  const {
    jobSkills,
    setJobSkills,
    pendingSkills,
    setPendingSkills,
    skillSearch,
    setSkillSearch,
    skillCategoryFilter,
    setSkillCategoryFilter,
    skillTypeFilter,
    setSkillTypeFilter,
    skillCategoryOptions,
    skillTypeOptions,
    savingSkillId,
    allSkills,
    setAllSkills,
    mandatorySkills,
    optionalSkills,
    eliminatorySkills,
    availableSkills,
    handleAddSkill,
    handleUpdateSkill,
    handleRemoveSkill,
    syncPendingSkills,
    onSkillCreated,
  } = useJobSkills({
    currentJob,
    onRefreshQuality: refreshQuality,
  });

  const {
    jobQuality,
    setJobQuality,
    backendPublishErrors,
    setBackendPublishErrors,
    frontendBlockers,
    publicationState,
    canTryPublishFrontend,
  } = useJobPublication({
    form,
    currentJob,
    mandatorySkillsCount: mandatorySkills.length,
  });

  const canManage = user?.role === "admin" || user?.role === "recruiter";
  const { alerts } = useJobConfigurationAlerts(form);



  useEffect(() => {
    if (!isEditing || !jobId) {
      setPageLoading(false);
      setCurrentJob(null);
      resetFormState();
      setJobSkills([]);
      setPendingSkills([]);
      setJobQuality(null);
      return;
    }

    let cancelled = false;
    setPageLoading(true);
    setFormErrors([]);
    setBackendPublishErrors([]);

    void Promise.all([getJob(jobId), jobSkillsService.listJobSkills(jobId), getJobQuality(jobId)])
      .then(([job, skills, quality]) => {
        if (cancelled) return;
        setCurrentJob(job);
        setForm(toForm(job));
        setJobSkills(skills);
        setPendingSkills([]);
        setJobQuality(quality);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setFormErrors(formatErrorDetails(handleApiError(error)));
      })
      .finally(() => {
        if (!cancelled) {
          setPageLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isEditing, jobId]);

  const currentStepIndex = STEPS.findIndex((step) => step.id === activeStep);
  const currentStep = STEPS[currentStepIndex];

  if (!canManage) {
    return (
      <div className="mx-auto w-full max-w-6xl px-6 py-10">
        <div className="rounded-3xl border border-[hsl(var(--danger))]/20 bg-[hsl(var(--danger-soft))] p-6 text-sm text-[hsl(var(--danger))]">
          Você não tem permissão para editar vagas.
        </div>
      </div>
    );
  }


  async function persistJob(options?: {
    requestedStatus?: string;
    successMessage?: string;
    silent?: boolean;
  }) {
    const targetStatus = options?.requestedStatus ?? form.status;
    const payloadForm: JobFormValues = { ...form, status: targetStatus };
    const payload = isEditing
      ? buildUpdateJobPayload(payloadForm)
      : buildCreateJobPayload(payloadForm);

    const saved = isEditing && jobId
      ? await updateJob(jobId, payload as UpdateJobRequestPayload)
      : await createJob(payload as CreateJobRequestPayload);

    if (!isEditing) {
      await syncPendingSkills(saved.id);
      navigate(`/vagas/${saved.id}/editar`, { replace: true });
    }

    setCurrentJob(saved);
    setForm((current) => ({ ...current, status: saved.status }));
    await refreshQuality(saved.id);

    if (saved.id) {
      const refreshedSkills = await jobSkillsService.listJobSkills(saved.id);
      setJobSkills(refreshedSkills);
    }

    if (!options?.silent) {
      toast.success(options?.successMessage ?? "Vaga salva com sucesso");
    }

    return saved;
  }

  async function handleSaveDraft() {
    setSavingDraft(true);
    setFormErrors([]);
    setBackendPublishErrors([]);

    try {
      await persistJob({
        requestedStatus: currentJob?.status === "published" ? "published" : "draft",
        successMessage: "Rascunho salvo com sucesso",
      });
    } catch (error: unknown) {
      setFormErrors(formatErrorDetails(handleApiError(error)));
    } finally {
      setSavingDraft(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    setFormErrors([]);
    setBackendPublishErrors([]);

    if (!canTryPublishFrontend) {
      setBackendPublishErrors(frontendBlockers.map((blocker) => formatPublicationBlocker(blocker)));
      setActiveStep("review");
      setPublishing(false);
      return;
    }

    try {
      const saved = await persistJob({
        requestedStatus: currentJob?.status === "published" ? "published" : "draft",
        silent: true,
      });

      await refreshQuality(saved.id);
      const quality = jobQuality;
      if (!quality || !quality.can_publish) {
        setActiveStep("review");
        setBackendPublishErrors(
          (quality?.publication_blockers ?? frontendBlockers).map((blocker) =>
            formatPublicationBlocker(blocker),
          ),
        );
        toast.error("Publicação bloqueada. Revise os itens obrigatórios.");
        return;
      }

      const published = await publishJob(saved.id);
      setCurrentJob(published);
      setForm((current) => ({ ...current, status: published.status }));
      await refreshQuality(saved.id);
      toast.success("Vaga publicada com sucesso");
      setActiveStep("review");
    } catch (error: unknown) {
      setBackendPublishErrors(extractPublication422Details(error));
      setActiveStep("review");
    } finally {
      setPublishing(false);
    }
  }

  async function handleTabClick(stepId: StepId) {
    if (isEditing && jobId) {
      try {
        await persistJob({ silent: true });
      } catch {
        // Silent fail
      }
    }
    setActiveStep(stepId);
  }

  function renderStepContent() {
    if (pageLoading) {
      return (
        <div className="rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-8 text-sm text-[hsl(var(--text-muted))]">
          Carregando vaga...
        </div>
      );
    }

    switch (activeStep) {
      case "basic":
        return (
          <JobFormBasicStep
            form={form}
            onFormChange={(updates) => setForm((current) => ({ ...current, ...updates }))}
          />
        );

      case "requirements":
        return (
          <JobFormRequirementsStep
            form={form}
            onFormChange={(updates) => setForm((current) => ({ ...current, ...updates }))}
          />
        );

      case "mandatory-skills":
        return (
          <JobFormMandatorySkillsStep
            mandatorySkills={mandatorySkills}
            availableSkills={availableSkills}
            skillSearch={skillSearch}
            onSearchChange={setSkillSearch}
            skillCategoryFilter={skillCategoryFilter}
            onSkillCategoryFilterChange={setSkillCategoryFilter}
            skillCategoryOptions={skillCategoryOptions}
            skillTypeFilter={skillTypeFilter}
            onSkillTypeFilterChange={setSkillTypeFilter}
            skillTypeOptions={skillTypeOptions}
            savingSkillId={savingSkillId}
            onAddSkill={handleAddSkill}
            onUpdateSkill={handleUpdateSkill}
            onRemoveSkill={handleRemoveSkill}
            onSkillCreated={onSkillCreated}
          />
        );

      case "differentials":
        return (
          <JobFormDifferentialsStep
            form={{
              behavioral_requirements: form.behavioral_requirements,
              newBehavioralRequirement: form.newBehavioralRequirement,
            }}
            optionalSkills={optionalSkills}
            availableSkills={availableSkills}
            skillSearch={skillSearch}
            onSearchChange={setSkillSearch}
            skillCategoryFilter={skillCategoryFilter}
            onSkillCategoryFilterChange={setSkillCategoryFilter}
            skillCategoryOptions={skillCategoryOptions}
            skillTypeFilter={skillTypeFilter}
            onSkillTypeFilterChange={setSkillTypeFilter}
            skillTypeOptions={skillTypeOptions}
            onFormChange={(updates) => setForm((current) => ({ ...current, ...updates }))}
            savingSkillId={savingSkillId}
            onAddSkill={handleAddSkill}
            onUpdateSkill={handleUpdateSkill}
            onRemoveSkill={handleRemoveSkill}
            onAddBehavioralRequirement={addBehavioralRequirement}
            onSkillCreated={onSkillCreated}
          />
        );

      case "deal-breakers":
        return (
          <JobFormDealBreakersStep
            form={form}
            eliminatorySkills={eliminatorySkills}
            availableSkills={availableSkills}
            skillSearch={skillSearch}
            onSearchChange={setSkillSearch}
            skillCategoryFilter={skillCategoryFilter}
            onSkillCategoryFilterChange={setSkillCategoryFilter}
            skillCategoryOptions={skillCategoryOptions}
            skillTypeFilter={skillTypeFilter}
            onSkillTypeFilterChange={setSkillTypeFilter}
            skillTypeOptions={skillTypeOptions}
            savingSkillId={savingSkillId}
            onAddSkill={handleAddSkill}
            onUpdateSkill={handleUpdateSkill}
            onRemoveSkill={handleRemoveSkill}
            dealBreakerDraft={dealBreakerDraft}
            onFormChange={(updates) => setForm((current) => ({ ...current, ...updates }))}
            onDealBreakerDraftChange={(updates) =>
              setDealBreakerDraft((current) => ({ ...current, ...updates }))
            }
            onAddDealBreaker={addDealBreaker}
            onSkillCreated={onSkillCreated}
          />
        );

      case "review":
        return (
          <JobFormReviewStep
            form={form}
            mandatorySkills={mandatorySkills}
            optionalSkills={optionalSkills}
            eliminatorySkills={eliminatorySkills}
            jobQuality={jobQuality}
            backendPublishErrors={backendPublishErrors}
            selectedTemplateStatus={selectedTemplateStatus}
          />
        );

      case "behavioral":
        return (
          <BehavioralTemplateSelector
            value={form.behavioral_template_id}
            onChange={(id) => setForm((current) => ({ ...current, behavioral_template_id: id }))}
            requiresAssessment={form.requires_behavioral_assessment}
            onTemplateStatusChange={setSelectedTemplateStatus}
            onPopulateBehavioralRequirements={(requirements) =>
              setForm((current) => ({
                ...current,
                behavioral_requirements: [
                  ...current.behavioral_requirements.filter((r) => !requirements.includes(r)),
                  ...requirements,
                ],
              }))
            }
          />
        );

      case "assessment-policy":
        return (
          <JobAssessmentPolicyStep
            form={form}
            onChange={(updates) => setForm((current) => ({ ...current, ...updates }))}
          />
        );
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 sm:px-6 py-6 pb-12">
      <div className="sticky top-[20px] z-20 rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))]/95 p-4 shadow-sm backdrop-blur mb-2">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-3">
            <Button type="button" variant="outline" onClick={() => navigate("/vagas")}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              Voltar
            </Button>
            <div>
              <h1 className="text-2xl font-semibold text-[hsl(var(--text))]">
                {isEditing ? "Editar vaga" : "Nova vaga"}
              </h1>
              <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
                Estruture a vaga por etapas para melhorar a leitura e a publicação sem relaxar validações.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusPill
              label={currentJob ? formatJobStatus(currentJob.status) : "Rascunho"}
              tone={currentJob ? jobStatusTone(currentJob.status) : "neutral"}
            />
            <Button type="button" variant="outline" onClick={() => void handleSaveDraft()} disabled={savingDraft || publishing}>
              {savingDraft ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar rascunho
            </Button>
            <Button type="button" onClick={() => void handlePublish()} disabled={publishing || savingDraft}>
              {publishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Publicar
            </Button>
          </div>
        </div>
      </div>

      {formErrors.length > 0 ? (
        <MessageList tone="danger" title="Problemas no formulário" items={formErrors} />
      ) : null}

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <div className="flex border border-[hsl(var(--border))] bg-[hsl(var(--surface))] rounded-2xl overflow-x-auto shadow-sm">
            {STEPS.map((step, index) => {
              const isActive = step.id === activeStep;
              const isDone = index < currentStepIndex;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => void handleTabClick(step.id)}
                  className={`flex flex-1 flex-col items-center gap-2 p-4 text-center border-b-2 transition-colors min-w-[120px] ${
                    isActive
                      ? "border-b-[hsl(var(--primary))] bg-[hsl(var(--accent-soft))]"
                      : "border-b-transparent hover:bg-[hsl(var(--surface-muted))]"
                  }`}
                >
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold shrink-0 ${
                    isDone ? "bg-[hsl(var(--success))] text-white" : isActive ? "bg-[hsl(var(--primary))] text-white" : "bg-[hsl(var(--border))] text-[hsl(var(--text-muted))]"
                  }`}>
                    {isDone ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                  </span>
                  <div className="flex flex-col items-center">
                    <span className={`text-sm font-medium ${isActive ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--text))]"}`}>{step.label}</span>
                    <span className="text-[11px] text-[hsl(var(--text-muted))] hidden xl:block mt-0.5">{step.hint}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {renderStepContent()}

          <div className="sticky bottom-0 z-10 mt-6 flex flex-col gap-3 rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))]/95 p-5 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[hsl(var(--text))]">{currentStep.label}</p>
              <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">{currentStep.hint}</p>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={currentStepIndex === 0}
                onClick={() => setActiveStep(STEPS[currentStepIndex - 1].id)}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Etapa anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={currentStepIndex === STEPS.length - 1}
                onClick={() => setActiveStep(STEPS[currentStepIndex + 1].id)}
              >
                Próxima etapa
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-[148px] xl:self-start">
          <div className="rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
              Painel de qualidade
            </p>
            <div className="mt-4">
              {jobQuality ? (
                <JobQualityBadge quality={jobQuality} />
              ) : (
                <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-4 py-3 text-sm text-[hsl(var(--text-muted))]">
                  Salve a vaga para calcular a qualidade.
                </div>
              )}
            </div>
            <div className={`mt-4 rounded-2xl border px-4 py-4 ${getPanelToneClasses(publicationState.tone)}`}>
              <p className="text-xs font-semibold uppercase tracking-wide">Status de publicação</p>
              <p className="mt-2 text-base font-semibold">{publicationState.label}</p>
              <p className="mt-2 text-sm opacity-90">{publicationState.description}</p>
            </div>
          </div>

          <div className="rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-5">
            <p className="text-sm font-semibold text-[hsl(var(--text))]">Bloqueios obrigatórios</p>
            <div className="mt-3 space-y-2">
              {frontendBlockers.map((blocker) => (
                <div
                  key={blocker}
                  className="rounded-2xl border border-[hsl(var(--danger))]/15 bg-[hsl(var(--danger-soft))] px-3 py-3 text-sm text-[hsl(var(--danger))]"
                >
                  {formatPublicationBlocker(blocker)}
                </div>
              ))}
              {frontendBlockers.length === 0 ? (
                <div className="rounded-2xl border border-[hsl(var(--success))]/15 bg-[hsl(var(--success-soft))] px-3 py-3 text-sm text-[hsl(var(--success))]">
                  Estrutura mínima preenchida no frontend.
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-5">
            <p className="text-sm font-semibold text-[hsl(var(--text))]">Resumo rápido</p>
            <div className="mt-4 space-y-3 text-sm">
              <SummaryRow label="Essenciais" value={`${mandatorySkills.length}`} />
              <SummaryRow label="Diferenciais" value={`${optionalSkills.length}`} />
              <SummaryRow label="Skills eliminatórias" value={`${eliminatorySkills.length}`} />
              <SummaryRow label="Deal breakers ativos" value={`${(form.deal_breakers ?? []).filter((item) => item.is_active).length}`} />
              <SummaryRow label="Senioridade" value={formatSeniority(form.seniority_level || null)} />
              <SummaryRow label="Modelo de trabalho" value={formatWorkModel(form.work_model || null)} />
            </div>
          </div>

          {alerts.length > 0 ? (
            <div className="rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-5">
              <p className="text-sm font-semibold text-[hsl(var(--text))]">Orientações de configuração</p>
              <div className="mt-4 space-y-2">
                {alerts.slice(0, 4).map((alert) => (
                  <div
                    key={`${alert.level}-${alert.message}`}
                    className={[
                      "rounded-2xl border px-3 py-3 text-sm",
                      alert.level === "critical"
                        ? "border-[hsl(var(--danger))]/15 bg-[hsl(var(--danger-soft))] text-[hsl(var(--danger))]"
                        : alert.level === "warning"
                          ? "border-[hsl(var(--warning))]/15 bg-[hsl(var(--warning-soft))] text-[hsl(var(--warning))]"
                          : "border-[hsl(var(--success))]/15 bg-[hsl(var(--success-soft))] text-[hsl(var(--success))]",
                    ].join(" ")}
                  >
                    {alert.message}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
