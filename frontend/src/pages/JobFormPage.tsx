import {
  ArrowLeft,
  ArrowRight,
  BarChart2,
  CheckCircle2,
  ChevronLeft,
  Loader2,
  Save,
  Sparkles,
  X,
} from "lucide-react";
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
import { JobAiDraftPanel } from "../features/jobs/components/JobAiDraftPanel";
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
import {
  getJob,
  getJobQuality,
  publishJob,
  type CreateJobRequestPayload,
  type UpdateJobRequestPayload,
  updateJob,
  createJob,
} from "../services/jobsService";
import { jobSkillsService } from "../services/jobSkillsService";
import { toast } from "../shared/utils/toast";
import type { Job, BehavioralAssessmentTemplate, JobQualityResult } from "../types/domain";
import {
  formatJobStatus,
  formatSeniority,
  formatWorkModel,
  jobStatusTone,
} from "../utils/jobFormatters";

// ─── Types ────────────────────────────────────────────────────────────────────

type StepId =
  | "basic"
  | "requirements"
  | "mandatory-skills"
  | "differentials"
  | "deal-breakers"
  | "behavioral"
  | "assessment-policy"
  | "review";

export type MacroStepId = "context" | "skills" | "evaluation" | "review";

// ─── Constants ────────────────────────────────────────────────────────────────

// Kept as-is — existing tests depend on these indices (assessment-policy=5, behavioral=6).
export const STEPS: Array<{ id: StepId; label: string; hint: string }> = [
  { id: "basic", label: "Dados básicos", hint: "Contexto e resumo da vaga" },
  { id: "requirements", label: "Requisitos mínimos", hint: "Base obrigatória do matching" },
  { id: "mandatory-skills", label: "Essenciais", hint: "Use para as 3–5 competências centrais da vaga" },
  { id: "differentials", label: "Diferenciais", hint: "Bônus controlado para ferramentas e extras" },
  { id: "deal-breakers", label: "Critérios eliminatórios", hint: "Regras de bloqueio explícitas" },
  { id: "assessment-policy", label: "Fluxo de avaliação", hint: "Configure os gates obrigatórios da decisão final" },
  { id: "behavioral", label: "Avaliação comportamental", hint: "Selecione o template comportamental oficial" },
  { id: "review", label: "Revisão e publicação", hint: "Checklist final e mensagens do backend" },
];

export const MACRO_STEPS: Array<{ id: MacroStepId; label: string; steps: StepId[] }> = [
  { id: "context", label: "Contexto da vaga", steps: ["basic", "requirements"] },
  { id: "skills", label: "Competências", steps: ["mandatory-skills", "differentials", "deal-breakers"] },
  { id: "evaluation", label: "Avaliação", steps: ["assessment-policy", "behavioral"] },
  { id: "review", label: "Revisão e publicação", steps: ["review"] },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function JobFormPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const isEditing = Boolean(jobId);
  const {
    form,
    setForm,
    updateForm,
    dealBreakerDraft,
    setDealBreakerDraft,
    addBehavioralRequirement,
    addDealBreaker,
    resetFormState,
  } = useJobFormState();

  const [activeMacroStep, setActiveMacroStep] = useState<MacroStepId>("context");
  const [showQualityDrawer, setShowQualityDrawer] = useState(false);
  const [aiMode, setAiMode] = useState<"manual" | "ai">("manual");
  const [currentJob, setCurrentJob] = useState<Job | null>(null);
  const [pageLoading, setPageLoading] = useState(isEditing);
  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [selectedTemplateStatus, setSelectedTemplateStatus] =
    useState<BehavioralAssessmentTemplate["status"] | null>(null);

  const refreshQuality = async (jobIdToRefresh: string): Promise<JobQualityResult | null> => {
    try {
      const quality = await getJobQuality(jobIdToRefresh);
      setJobQuality(quality);
      return quality;
    } catch {
      setJobQuality(null);
      return null;
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
  } = useJobSkills({ currentJob, onRefreshQuality: refreshQuality });

  const {
    jobQuality,
    setJobQuality,
    backendPublishErrors,
    setBackendPublishErrors,
    frontendBlockers,
    publicationState,
    canTryPublishFrontend,
  } = useJobPublication({ form, currentJob, mandatorySkillsCount: mandatorySkills.length });

  const canManage = user?.role === "admin" || user?.role === "recruiter";
  const { alerts } = useJobConfigurationAlerts(form);

  const currentMacroIndex = MACRO_STEPS.findIndex((s) => s.id === activeMacroStep);
  const isReviewStep = activeMacroStep === "review";

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
        if (!cancelled) setPageLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isEditing, jobId]);

  if (!canManage) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-10">
        <div className="rounded-3xl border border-[hsl(var(--danger))]/20 bg-danger-soft p-6 text-sm text-danger">
          Você não tem permissão para editar vagas.
        </div>
      </div>
    );
  }

  // ─── Persist helpers ───────────────────────────────────────────────────────

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
      setActiveMacroStep("review");
      setPublishing(false);
      return;
    }

    try {
      const saved = await persistJob({
        requestedStatus: currentJob?.status === "published" ? "published" : "draft",
        silent: true,
      });

      const quality = await refreshQuality(saved.id);
      if (!quality || !quality.can_publish) {
        setActiveMacroStep("review");
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
      setActiveMacroStep("review");
    } catch (error: unknown) {
      setBackendPublishErrors(extractPublication422Details(error));
      setActiveMacroStep("review");
    } finally {
      setPublishing(false);
    }
  }

  async function handleMacroStepClick(id: MacroStepId) {
    if (isEditing && jobId) {
      try {
        await persistJob({ silent: true });
      } catch {
        // silent fail
      }
    }
    setActiveMacroStep(id);
  }

  // ─── Content rendering ─────────────────────────────────────────────────────

  function renderMacroContent() {
    if (pageLoading) {
      return (
        <div className="rounded-3xl border border-border bg-surface p-8 text-sm text-text-muted">
          Carregando vaga...
        </div>
      );
    }

    switch (activeMacroStep) {
      case "context":
        return (
          <div className="space-y-6">
            <JobFormBasicStep
              form={form}
              onFormChange={(updates) => setForm((c) => ({ ...c, ...updates }))}
            />
            <JobFormRequirementsStep
              form={form}
              onFormChange={(updates) => setForm((c) => ({ ...c, ...updates }))}
            />
          </div>
        );

      case "skills":
        return (
          <div className="space-y-6">
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
              jobContext={{ title: form.title, jobArea: form.job_area }}
            />
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
              onFormChange={(updates) => setForm((c) => ({ ...c, ...updates }))}
              savingSkillId={savingSkillId}
              onAddSkill={handleAddSkill}
              onUpdateSkill={handleUpdateSkill}
              onRemoveSkill={handleRemoveSkill}
              onAddBehavioralRequirement={addBehavioralRequirement}
              onSkillCreated={onSkillCreated}
              jobContext={{ title: form.title, jobArea: form.job_area }}
            />
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
              onFormChange={(updates) => setForm((c) => ({ ...c, ...updates }))}
              onDealBreakerDraftChange={(updates) =>
                setDealBreakerDraft((c) => ({ ...c, ...updates }))
              }
              onAddDealBreaker={addDealBreaker}
              onSkillCreated={onSkillCreated}
            />
          </div>
        );

      case "evaluation":
        return (
          <div className="space-y-6">
            <JobAssessmentPolicyStep
              form={form}
              onChange={(updates) => setForm((c) => ({ ...c, ...updates }))}
            />
            <BehavioralTemplateSelector
              value={form.behavioral_template_id}
              onChange={(id) =>
                setForm((c) => ({ ...c, behavioral_template_id: id }))
              }
              requiresAssessment={form.requires_behavioral_assessment}
              onTemplateStatusChange={setSelectedTemplateStatus}
              onPopulateBehavioralRequirements={(requirements) =>
                setForm((c) => ({
                  ...c,
                  behavioral_requirements: [
                    ...c.behavioral_requirements.filter((r) => !requirements.includes(r)),
                    ...requirements,
                  ],
                }))
              }
            />
          </div>
        );

      case "review":
        return (
          <div className="space-y-6">
            {/* Inline quality panel — only in review step */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl border border-border bg-surface p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Painel de qualidade
                </p>
                <div className="mt-4">
                  {jobQuality ? (
                    <JobQualityBadge quality={jobQuality} />
                  ) : (
                    <div className="rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm text-text-muted">
                      Salve a vaga para calcular a qualidade.
                    </div>
                  )}
                </div>
                <div
                  className={`mt-4 rounded-2xl border px-4 py-4 ${getPanelToneClasses(publicationState.tone)}`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide">
                    Status de publicação
                  </p>
                  <p className="mt-2 text-base font-semibold">{publicationState.label}</p>
                  <p className="mt-2 text-sm opacity-90">{publicationState.description}</p>
                </div>
              </div>

              <div className="rounded-3xl border border-border bg-surface p-5">
                <p className="text-sm font-semibold text-text">Bloqueios obrigatórios</p>
                <div className="mt-3 space-y-2">
                  {frontendBlockers.map((blocker) => (
                    <div
                      key={blocker}
                      className="rounded-2xl border border-[hsl(var(--danger))]/15 bg-danger-soft px-3 py-3 text-sm text-danger"
                    >
                      {formatPublicationBlocker(blocker)}
                    </div>
                  ))}
                  {frontendBlockers.length === 0 && (
                    <div className="rounded-2xl border border-[hsl(var(--success))]/15 bg-success-soft px-3 py-3 text-sm text-success">
                      Estrutura mínima preenchida no frontend.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <JobFormReviewStep
              form={form}
              mandatorySkills={mandatorySkills}
              optionalSkills={optionalSkills}
              eliminatorySkills={eliminatorySkills}
              jobQuality={jobQuality}
              backendPublishErrors={backendPublishErrors}
              selectedTemplateStatus={selectedTemplateStatus}
            />

            {alerts.length > 0 && (
              <div className="rounded-3xl border border-border bg-surface p-5">
                <p className="text-sm font-semibold text-text">Orientações de configuração</p>
                <div className="mt-4 space-y-2">
                  {alerts.map((alert) => (
                    <div
                      key={`${alert.level}-${alert.message}`}
                      className={[
                        "rounded-2xl border px-3 py-3 text-sm",
                        alert.level === "critical"
                          ? "border-[hsl(var(--danger))]/15 bg-danger-soft text-danger"
                          : alert.level === "warning"
                            ? "border-[hsl(var(--warning))]/15 bg-warning-soft text-warning"
                            : "border-[hsl(var(--success))]/15 bg-success-soft text-success",
                      ].join(" ")}
                    >
                      {alert.message}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
    }
  }

  // ─── Quality Drawer content ────────────────────────────────────────────────

  function renderQualityDrawerContent() {
    return (
      <>
        <div className="rounded-2xl border border-border bg-surface-muted p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-3">
            Qualidade
          </p>
          {jobQuality ? (
            <JobQualityBadge quality={jobQuality} />
          ) : (
            <p className="text-sm text-text-muted">
              Salve a vaga para calcular a qualidade.
            </p>
          )}
          <div
            className={`mt-3 rounded-2xl border px-3 py-3 text-sm ${getPanelToneClasses(publicationState.tone)}`}
          >
            <p className="font-semibold">{publicationState.label}</p>
            <p className="mt-1 text-xs opacity-90">{publicationState.description}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface-muted p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-3">
            Bloqueios
          </p>
          <div className="space-y-2">
            {frontendBlockers.map((blocker) => (
              <div
                key={blocker}
                className="rounded-xl border border-[hsl(var(--danger))]/15 bg-danger-soft px-3 py-2 text-xs text-danger"
              >
                {formatPublicationBlocker(blocker)}
              </div>
            ))}
            {frontendBlockers.length === 0 && (
              <div className="rounded-xl border border-[hsl(var(--success))]/15 bg-success-soft px-3 py-2 text-xs text-success">
                Estrutura mínima preenchida.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface-muted p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-3">
            Resumo rápido
          </p>
          <div className="space-y-2 text-sm">
            <SummaryRow label="Essenciais" value={`${mandatorySkills.length}`} />
            <SummaryRow label="Diferenciais" value={`${optionalSkills.length}`} />
            <SummaryRow label="Eliminatórias" value={`${eliminatorySkills.length}`} />
            <SummaryRow
              label="Deal breakers"
              value={`${(form.deal_breakers ?? []).filter((item) => item.is_active).length}`}
            />
            <SummaryRow label="Senioridade" value={formatSeniority(form.seniority_level || null)} />
            <SummaryRow label="Modelo" value={formatWorkModel(form.work_model || null)} />
          </div>
        </div>

        {alerts.length > 0 && (
          <div className="rounded-2xl border border-border bg-surface-muted p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-3">
              Alertas
            </p>
            <div className="space-y-2">
              {alerts.slice(0, 4).map((alert) => (
                <div
                  key={`${alert.level}-${alert.message}`}
                  className={[
                    "rounded-xl border px-3 py-2 text-xs",
                    alert.level === "critical"
                      ? "border-[hsl(var(--danger))]/15 bg-danger-soft text-danger"
                      : alert.level === "warning"
                        ? "border-[hsl(var(--warning))]/15 bg-warning-soft text-warning"
                        : "border-[hsl(var(--success))]/15 bg-success-soft text-success",
                  ].join(" ")}
                >
                  {alert.message}
                </div>
              ))}
            </div>
          </div>
        )}
      </>
    );
  }

  // ─── Page render ───────────────────────────────────────────────────────────

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 sm:px-6 py-6 pb-28">
      {/* ── Header ── */}
      <div className="sticky top-[20px] z-20 rounded-3xl border border-border bg-surface/95 p-4 shadow-sm backdrop-blur">
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={() => navigate("/vagas")}>
            <ChevronLeft className="mr-1 h-4 w-4" />
            Voltar
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-text truncate">
              {isEditing ? "Editar vaga" : "Nova vaga"}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <StatusPill
                label={currentJob ? formatJobStatus(currentJob.status) : "Rascunho"}
                tone={currentJob ? jobStatusTone(currentJob.status) : "neutral"}
              />
              <span className="text-xs text-text-muted">
                {currentMacroIndex + 1} de {MACRO_STEPS.length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Form errors ── */}
      {formErrors.length > 0 && (
        <MessageList tone="danger" title="Problemas no formulário" items={formErrors} />
      )}

      {/* ── Modo de criação ── */}
      <div className="flex gap-1 rounded-xl border border-border bg-surface p-1">
        <button
          type="button"
          onClick={() => setAiMode("manual")}
          className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            aiMode === "manual"
              ? "bg-[hsl(var(--primary))] text-white shadow-sm"
              : "text-text-muted hover:text-text"
          }`}
        >
          Cadastro manual
        </button>
        <button
          type="button"
          onClick={() => setAiMode("ai")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            aiMode === "ai"
              ? "bg-[hsl(var(--primary))] text-white shadow-sm"
              : "text-text-muted hover:text-text"
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Criar com IA
        </button>
      </div>

      {/* ── AI Draft Panel ── */}
      {aiMode === "ai" && (
        <JobAiDraftPanel
          formHasData={Boolean(form.title || form.description)}
          onApply={(updates) => {
            updateForm(updates);
            setAiMode("manual");
          }}
        />
      )}

      {/* ── Macro-step stepper ── */}
      <nav
        aria-label="Etapas do formulário"
        className="flex rounded-2xl border border-border bg-surface overflow-x-auto shadow-sm"
      >
        {MACRO_STEPS.map((step, i) => {
          const isDone = i < currentMacroIndex;
          const isActive = step.id === activeMacroStep;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => void handleMacroStepClick(step.id)}
              aria-current={isActive ? "step" : undefined}
              className={`flex flex-1 items-center justify-center gap-2 px-3 py-3 text-sm font-medium border-b-2 transition-colors min-w-[120px] ${
                isActive
                  ? "border-b-[hsl(var(--primary))] text-[hsl(var(--primary))] bg-[hsl(var(--accent-soft))]"
                  : "border-b-transparent text-text-muted hover:bg-surface-muted hover:text-text"
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  isDone
                    ? "bg-[hsl(var(--success))] text-white"
                    : isActive
                      ? "bg-[hsl(var(--primary))] text-white"
                      : "bg-border text-text-muted"
                }`}
              >
                {isDone ? <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> : i + 1}
              </span>
              <span className="truncate">{step.label}</span>
            </button>
          );
        })}
      </nav>

      {/* ── Main content (full-width, no sidebar) ── */}
      <div>{renderMacroContent()}</div>

      {/* ── Bottom action bar ── */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-surface/95 px-4 py-3 shadow-lg backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={currentMacroIndex === 0}
            onClick={() => setActiveMacroStep(MACRO_STEPS[currentMacroIndex - 1].id)}
          >
            <ArrowLeft className="sm:mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Etapa anterior</span>
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleSaveDraft()}
              disabled={savingDraft || publishing}
            >
              {savingDraft ? (
                <Loader2 className="sm:mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Save className="sm:mr-1.5 h-4 w-4" />
              )}
              <span className="hidden sm:inline">Salvar rascunho</span>
            </Button>

            {!isReviewStep && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowQualityDrawer(true)}
                aria-label="Ver qualidade da vaga"
              >
                <BarChart2 className="sm:mr-1.5 h-4 w-4" />
                <span className="hidden sm:inline">Ver qualidade</span>
              </Button>
            )}

            {isReviewStep ? (
              <Button
                type="button"
                size="sm"
                onClick={() => void handlePublish()}
                disabled={publishing || savingDraft}
              >
                {publishing ? (
                  <Loader2 className="sm:mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="sm:mr-1.5 h-4 w-4" />
                )}
                <span className="hidden sm:inline">Publicar</span>
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={currentMacroIndex === MACRO_STEPS.length - 1}
                onClick={() => setActiveMacroStep(MACRO_STEPS[currentMacroIndex + 1].id)}
              >
                <span className="hidden sm:inline">Próxima etapa</span>
                <ArrowRight className="sm:ml-1.5 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Quality Drawer ── */}
      {showQualityDrawer && (
        <div
          className="fixed inset-0 z-50 bg-black/30"
          onClick={() => setShowQualityDrawer(false)}
        >
          <div
            role="dialog"
            aria-label="Qualidade da vaga"
            className="absolute right-0 top-0 flex h-full w-80 flex-col border-l border-border bg-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <p className="text-sm font-semibold text-text">Qualidade da vaga</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Fechar painel de qualidade"
                onClick={() => setShowQualityDrawer(false)}
                className="h-7 w-7 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {renderQualityDrawerContent()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
