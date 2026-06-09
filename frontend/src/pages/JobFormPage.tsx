import {
  ArrowLeft,
  ArrowRight,
  BarChart2,
  CheckCircle2,
  ChevronLeft,
  Loader2,
  Save,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import { AiSkillSuggestionsBlock, type ApplicableSkill } from "../features/jobs/components/AiSkillSuggestionsBlock";
import { SectionCard } from "../shared/components/layout/SectionCard";
import { Field } from "../shared/components/forms/Field";
import { StringListField } from "../features/jobs/components/StringListField";
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
import { canManageJobs } from "../shared/auth/roles";
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

export type MacroStepId = "context" | "requirements" | "skills" | "screening" | "review";
type AiSkillSuggestionsState = { mandatory: string[]; optional: string[] };

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
  { id: "context", label: "Contexto", steps: ["basic"] },
  { id: "requirements", label: "Requisitos", steps: ["requirements"] },
  { id: "skills", label: "Skills", steps: ["mandatory-skills", "differentials"] },
  { id: "screening", label: "Triagem", steps: ["deal-breakers", "assessment-policy", "behavioral"] },
  { id: "review", label: "Revisão", steps: ["review"] },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function JobFormPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const pageRootRef = useRef<HTMLDivElement | null>(null);

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
  const [skillsSubTab, setSkillsSubTab] = useState<"essentials" | "differentials" | "free-text" | "review">("essentials");
  const [screeningSubTab, setScreeningSubTab] = useState<"eliminatories" | "stages" | "behavioral" | "review">("eliminatories");
  const [showQualityDrawer, setShowQualityDrawer] = useState(false);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [aiSkillSuggestions, setAiSkillSuggestions] = useState<AiSkillSuggestionsState | null>(null);
  const [aiApplyNotice, setAiApplyNotice] = useState<string | null>(null);
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
    combinedSkills,
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

  const canManage = canManageJobs(user?.role);
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

  async function handleApplySkillSuggestions(selected: ApplicableSkill[]) {
    for (const item of selected) {
      await handleAddSkill(item.skill, item.priority);
    }
    setAiSkillSuggestions(null);
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
            {!isAiPanelOpen ? (
              <div className="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-text">Criação assistida</h3>
                  <p className="mt-1 text-sm text-text-muted">
                    Use a IA para criar um rascunho. Você revisa antes de aplicar.
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={() => setIsAiPanelOpen(true)}>
                  <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
                  Preencher com IA ✨
                </Button>
              </div>
            ) : (
              <JobAiDraftPanel
                formHasData={Boolean(form.title || form.description)}
                onApply={(updates, skillSuggestions) => {
                  updateForm(updates);
                  const hasSuggestions =
                    skillSuggestions.mandatory.length > 0 || skillSuggestions.optional.length > 0;
                  if (hasSuggestions) {
                    setAiSkillSuggestions(skillSuggestions);
                  }
                  setAiApplyNotice("Rascunho aplicado. Revise antes de salvar.");
                  setIsAiPanelOpen(false);
                }}
                onClose={() => setIsAiPanelOpen(false)}
              />
            )}
            
            <JobFormBasicStep
              form={form}
              onFormChange={(updates) => setForm((c) => ({ ...c, ...updates }))}
            />

            <SectionCard
              title="Oferta e benefícios"
              description="Atrativos e benefícios oferecidos pela empresa."
            >
              <Field label="Benefícios">
                <StringListField
                  values={form.benefits}
                  onChange={(next) => setForm((c) => ({ ...c, benefits: next }))}
                  placeholder="Ex: Vale refeição, Plano de saúde"
                  addLabel="Adicionar"
                  emptyLabel="Nenhum benefício adicionado."
                  inputLabel="Novo benefício"
                  testId="form-benefits"
                />
              </Field>
            </SectionCard>
          </div>
        );

      case "requirements":
        return (
          <div className="space-y-6">
            <JobFormRequirementsStep
              form={form}
              onFormChange={(updates) => setForm((c) => ({ ...c, ...updates }))}
            />
          </div>
        );

      case "skills": {
        const hasEssentialsError = mandatorySkills.length < 2;
        const totalFreeTextCount = 
          (form.mandatory_skills?.length ?? 0) + 
          (form.nice_to_have_skills?.length ?? 0) + 
          (form.behavioral_requirements?.length ?? 0);
          
        const hasCatalogSkillsWarning = mandatorySkills.length === 0 && optionalSkills.length === 0;

        return (
          <div className="space-y-6">
            {/* Horizontal Sub-tabs bar */}
            <div data-testid="skills-subtabs-nav" className="flex border-b border-border bg-surface rounded-2xl p-1 shadow-sm overflow-x-auto gap-1">
              <button
                type="button"
                onClick={() => setSkillsSubTab("essentials")}
                className={`relative flex-1 min-w-[120px] px-3 py-2.5 text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2 ${
                  skillsSubTab === "essentials"
                    ? "bg-[hsl(var(--primary))] text-white shadow"
                    : "text-text-muted hover:bg-surface-muted hover:text-text"
                }`}
              >
                <span>Essenciais</span>
                <span className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold ${
                  skillsSubTab === "essentials"
                    ? "bg-white/20 text-white"
                    : hasEssentialsError
                      ? "bg-danger-soft text-danger border border-danger/10"
                      : "bg-surface-muted text-text-muted border border-border"
                }`}>
                  {mandatorySkills.length}
                </span>
                {hasEssentialsError && (
                  <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-danger"></span>
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setSkillsSubTab("differentials")}
                className={`flex-1 min-w-[120px] px-3 py-2.5 text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2 ${
                  skillsSubTab === "differentials"
                    ? "bg-[hsl(var(--primary))] text-white shadow"
                    : "text-text-muted hover:bg-surface-muted hover:text-text"
                }`}
              >
                <span>Diferenciais</span>
                <span className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold ${
                  skillsSubTab === "differentials"
                    ? "bg-white/20 text-white"
                    : "bg-surface-muted text-text-muted border border-border"
                }`}>
                  {optionalSkills.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSkillsSubTab("free-text")}
                className={`flex-1 min-w-[140px] px-3 py-2.5 text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2 ${
                  skillsSubTab === "free-text"
                    ? "bg-[hsl(var(--primary))] text-white shadow"
                    : "text-text-muted hover:bg-surface-muted hover:text-text"
                }`}
              >
                <span>Competências livres</span>
                <span className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold ${
                  skillsSubTab === "free-text"
                    ? "bg-white/20 text-white"
                    : "bg-surface-muted text-text-muted border border-border"
                }`}>
                  {totalFreeTextCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSkillsSubTab("review")}
                className={`relative flex-1 min-w-[120px] px-3 py-2.5 text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2 ${
                  skillsSubTab === "review"
                    ? "bg-[hsl(var(--primary))] text-white shadow"
                    : "text-text-muted hover:bg-surface-muted hover:text-text"
                }`}
              >
                <span>Revisão</span>
                {(hasEssentialsError || hasCatalogSkillsWarning) && (
                  <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-warning"></span>
                  </span>
                )}
              </button>
            </div>

            {/* AI suggestions block */}
            {aiSkillSuggestions && (skillsSubTab === "essentials" || skillsSubTab === "differentials") && (
              <AiSkillSuggestionsBlock
                mandatory={aiSkillSuggestions.mandatory}
                optional={aiSkillSuggestions.optional}
                linkedSkills={combinedSkills}
                onApply={(selected) => void handleApplySkillSuggestions(selected)}
                onDismiss={() => setAiSkillSuggestions(null)}
              />
            )}

            {/* Sub-tab 1: Essenciais */}
            {skillsSubTab === "essentials" && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.04)] px-4 py-3 text-sm text-[hsl(var(--primary))]">
                  Use para as 3–5 competências centrais da vaga. Essas skills impactam o matching IA.
                </div>

                {hasEssentialsError && (
                  <div className="rounded-2xl border border-[hsl(var(--danger)/0.3)] bg-danger-soft px-4 py-3 text-sm text-danger">
                    A vaga precisa ter no mínimo 2 skills essenciais cadastradas para permitir a publicação.
                  </div>
                )}

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
              </div>
            )}

            {/* Sub-tab 2: Diferenciais */}
            {skillsSubTab === "differentials" && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.04)] px-4 py-3 text-sm text-[hsl(var(--primary))]">
                  Use para competências desejáveis. Elas ajudam o ranking, mas não devem bloquear bons candidatos.
                </div>

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
                  hideBehavioral={true}
                />
              </div>
            )}

            {/* Sub-tab 3: Competências livres */}
            {skillsSubTab === "free-text" && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-[hsl(var(--warning)/0.3)] bg-warning-soft px-4 py-3 text-sm text-warning">
                  Textos livres aparecem na descrição da vaga, mas não entram diretamente no matching IA. Para matching, use skills do catálogo nas abas Essenciais e Diferenciais.
                </div>

                <SectionCard
                  title="Competências obrigatórias (Texto Livre)"
                  description="Itens que aparecerão apenas na descrição da vaga e não no matching de IA."
                >
                  <Field label="Competências obrigatórias">
                    <StringListField
                      values={form.mandatory_skills}
                      onChange={(next) => setForm((c) => ({ ...c, mandatory_skills: next }))}
                      placeholder="Ex: Atendimento ao cliente"
                      addLabel="Adicionar"
                      emptyLabel="Nenhuma competência obrigatória adicionada."
                      inputLabel="Nova competência obrigatória"
                      testId="form-mandatory-skills"
                    />
                  </Field>
                </SectionCard>

                <SectionCard
                  title="Diferenciais (Texto Livre)"
                  description="Diferenciais em texto que aparecerão na descrição da vaga."
                >
                  <Field label="Diferenciais (desejáveis)">
                    <StringListField
                      values={form.nice_to_have_skills}
                      onChange={(next) => setForm((c) => ({ ...c, nice_to_have_skills: next }))}
                      placeholder="Ex: Experiência anterior com caixa"
                      addLabel="Adicionar"
                      emptyLabel="Nenhum diferencial adicionado."
                      inputLabel="Novo diferencial"
                      testId="form-nice-to-have-skills"
                    />
                  </Field>
                </SectionCard>

                <SectionCard
                  title="Requisitos comportamentais"
                  description="Esses itens ajudam a orientar a leitura da vaga e a futura avaliação."
                >
                  <div className="flex flex-col gap-3 md:flex-row">
                    <input
                      value={form.newBehavioralRequirement}
                      onChange={(event) =>
                        setForm((c) => ({
                          ...c,
                          newBehavioralRequirement: event.target.value,
                        }))
                      }
                      className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring h-11 flex-1 rounded-xl px-3 text-sm"
                      placeholder="Ex: Comunicação com áreas de negócio"
                    />
                    <Button type="button" onClick={addBehavioralRequirement}>
                      Adicionar
                    </Button>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {form.behavioral_requirements.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() =>
                          setForm((c) => ({
                            ...c,
                            behavioral_requirements: form.behavioral_requirements.filter(
                              (value) => value !== item,
                            ),
                          }))
                        }
                        className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-muted px-3 py-2 text-xs text-text"
                      >
                        {item}
                        <Trash2 className="h-3.5 w-3.5 text-text-muted" />
                      </button>
                    ))}
                    {form.behavioral_requirements.length === 0 ? (
                      <p className="text-sm text-text-muted">
                        Nenhum requisito comportamental adicionado.
                      </p>
                    ) : null}
                  </div>
                </SectionCard>
              </div>
            )}

            {/* Sub-tab 4: Revisão */}
            {skillsSubTab === "review" && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
                  <h3 className="text-base font-semibold text-text mb-4">Resumo das Competências</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-xl border border-border p-4 bg-surface-muted text-center shadow-sm">
                      <p className="text-sm font-medium text-text-muted">Skills Essenciais (Catálogo)</p>
                      <p className="text-4xl font-bold text-[hsl(var(--primary))] mt-2">{mandatorySkills.length}</p>
                    </div>
                    <div className="rounded-xl border border-border p-4 bg-surface-muted text-center shadow-sm">
                      <p className="text-sm font-medium text-text-muted">Skills Diferenciais (Catálogo)</p>
                      <p className="text-4xl font-bold text-[hsl(var(--primary))] mt-2">{optionalSkills.length}</p>
                    </div>
                    <div className="rounded-xl border border-border p-4 bg-surface-muted text-center shadow-sm">
                      <p className="text-sm font-medium text-text-muted">Competências Livres (Texto)</p>
                      <p className="text-4xl font-bold text-[hsl(var(--primary))] mt-2">{totalFreeTextCount}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-surface p-6 space-y-4 shadow-sm">
                  <h3 className="text-base font-semibold text-text mb-2">Alertas de Qualidade</h3>
                  
                  {/* Warning if < 3 essentials */}
                  {mandatorySkills.length < 3 && (
                    <div className="flex items-start gap-2 rounded-xl border border-[hsl(var(--warning))]/20 bg-warning-soft px-4 py-3 text-sm text-warning">
                      <span>⚠️ <strong>Aviso:</strong> É recomendável adicionar de 3 a 5 skills essenciais do catálogo para que a IA consiga mapear corretamente o perfil técnico ideal da vaga. (Atual: {mandatorySkills.length})</span>
                    </div>
                  )}

                  {/* Warning if no catalog skills */}
                  {mandatorySkills.length === 0 && optionalSkills.length === 0 && (
                    <div className="flex items-start gap-2 rounded-xl border border-[hsl(var(--danger))]/20 bg-danger-soft px-4 py-3 text-sm text-danger">
                      <span>❌ <strong>Crítico:</strong> Nenhuma skill do catálogo foi adicionada. Sem skills estruturadas, o matching de IA e o ranking de candidatos não funcionarão de forma robusta.</span>
                    </div>
                  )}

                  {/* Warning if only free text exists */}
                  {mandatorySkills.length === 0 && optionalSkills.length === 0 && totalFreeTextCount > 0 && (
                    <div className="flex items-start gap-2 rounded-xl border border-[hsl(var(--warning))]/20 bg-warning-soft px-4 py-3 text-sm text-warning">
                      <span>⚠️ <strong>Aviso:</strong> A vaga possui apenas competências em texto livre. Textos livres aparecem na descrição da vaga para o candidato, mas não impactam diretamente o matching de IA. Adicione skills do catálogo nas abas <strong>Essenciais</strong> ou <strong>Diferenciais</strong>.</span>
                    </div>
                  )}

                  {/* If all is good */}
                  {mandatorySkills.length >= 3 && (
                    <div className="flex items-start gap-2 rounded-xl border border-[hsl(var(--success))]/20 bg-success-soft px-4 py-3 text-sm text-success">
                      <span>✅ <strong>Tudo certo:</strong> A vaga possui um bom número de competências estruturadas cadastradas.</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      }

      case "screening": {
        const totalEliminatoriesCount =
          (form.screening_questions?.length ?? 0) +
          eliminatorySkills.length +
          (form.deal_breakers ?? []).filter((db) => db.is_active).length;

        const hasBehavioralTemplateError =
          form.requires_behavioral_assessment && !form.behavioral_template_id;

        return (
          <div className="space-y-6">
            {/* Horizontal Sub-tabs bar */}
            <div data-testid="screening-subtabs-nav" className="flex border-b border-border bg-surface rounded-2xl p-1 shadow-sm overflow-x-auto gap-1">
              <button
                type="button"
                onClick={() => setScreeningSubTab("eliminatories")}
                className={`relative flex-1 min-w-[125px] px-3 py-2.5 text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2 ${
                  screeningSubTab === "eliminatories"
                    ? "bg-[hsl(var(--primary))] text-white shadow"
                    : "text-text-muted hover:bg-surface-muted hover:text-text"
                }`}
              >
                <span>Eliminatórios</span>
                <span className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold ${
                  screeningSubTab === "eliminatories"
                    ? "bg-white/20 text-white"
                    : "bg-surface-muted text-text-muted border border-border"
                }`}>
                  {totalEliminatoriesCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setScreeningSubTab("stages")}
                className={`flex-1 min-w-[125px] px-3 py-2.5 text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2 ${
                  screeningSubTab === "stages"
                    ? "bg-[hsl(var(--primary))] text-white shadow"
                    : "text-text-muted hover:bg-surface-muted hover:text-text"
                }`}
              >
                <span>Etapas de avaliação</span>
              </button>

              <button
                type="button"
                onClick={() => setScreeningSubTab("behavioral")}
                className={`relative flex-1 min-w-[125px] px-3 py-2.5 text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2 ${
                  screeningSubTab === "behavioral"
                    ? "bg-[hsl(var(--primary))] text-white shadow"
                    : "text-text-muted hover:bg-surface-muted hover:text-text"
                }`}
              >
                <span>Comportamental</span>
                {hasBehavioralTemplateError && (
                  <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-danger"></span>
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setScreeningSubTab("review")}
                className={`relative flex-1 min-w-[120px] px-3 py-2.5 text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2 ${
                  screeningSubTab === "review"
                    ? "bg-[hsl(var(--primary))] text-white shadow"
                    : "text-text-muted hover:bg-surface-muted hover:text-text"
                }`}
              >
                <span>Revisão</span>
                {hasBehavioralTemplateError && (
                  <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-warning"></span>
                  </span>
                )}
              </button>
            </div>

            {/* Sub-tab 1: Eliminatórios */}
            {screeningSubTab === "eliminatories" && (
              <div className="space-y-6">
                <SectionCard
                  title="Perguntas de triagem"
                  description="Perguntas obrigatórias que o candidato deve responder ao se aplicar."
                >
                  <Field label="Perguntas de triagem">
                    <StringListField
                      values={form.screening_questions}
                      onChange={(next) => setForm((c) => ({ ...c, screening_questions: next }))}
                      placeholder="Ex: Tem disponibilidade para turno integral?"
                      addLabel="Adicionar"
                      emptyLabel="Nenhuma pergunta de triagem adicionada."
                      inputLabel="Nova pergunta de triagem"
                      testId="form-screening-questions"
                    />
                  </Field>
                </SectionCard>

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
            )}

            {/* Sub-tab 2: Etapas de avaliação */}
            {screeningSubTab === "stages" && (
              <div className="space-y-6">
                <JobAssessmentPolicyStep
                  form={form}
                  onChange={(updates) => setForm((c) => ({ ...c, ...updates }))}
                />
              </div>
            )}

            {/* Sub-tab 3: Comportamental */}
            {screeningSubTab === "behavioral" && (
              <div className="space-y-6">
                {hasBehavioralTemplateError && (
                  <div className="rounded-2xl border border-[hsl(var(--danger)/0.3)] bg-danger-soft px-4 py-3 text-sm text-danger">
                    A avaliação comportamental está ativada, mas nenhum template oficial foi selecionado.
                  </div>
                )}
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
            )}

            {/* Sub-tab 4: Revisão */}
            {screeningSubTab === "review" && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
                  <h3 className="text-base font-semibold text-text mb-4">Resumo da Triagem</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-xl border border-border p-4 bg-surface-muted text-center shadow-sm">
                      <p className="text-sm font-medium text-text-muted">Perguntas de Triagem</p>
                      <p className="text-4xl font-bold text-[hsl(var(--primary))] mt-2">{form.screening_questions?.length ?? 0}</p>
                    </div>
                    <div className="rounded-xl border border-border p-4 bg-surface-muted text-center shadow-sm">
                      <p className="text-sm font-medium text-text-muted">Critérios Eliminatórios (Catálogo)</p>
                      <p className="text-4xl font-bold text-[hsl(var(--primary))] mt-2">{eliminatorySkills.length}</p>
                    </div>
                    <div className="rounded-xl border border-border p-4 bg-surface-muted text-center shadow-sm">
                      <p className="text-sm font-medium text-text-muted">Deal Breakers Customizados</p>
                      <p className="text-4xl font-bold text-[hsl(var(--primary))] mt-2">{(form.deal_breakers ?? []).filter((db) => db.is_active).length}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-surface p-6 space-y-4 shadow-sm">
                  <h3 className="text-base font-semibold text-text mb-2">Alertas de Triagem</h3>
                  
                  {/* Warning if no template selected when required */}
                  {hasBehavioralTemplateError && (
                    <div className="flex items-start gap-2 rounded-xl border border-[hsl(var(--danger))]/20 bg-danger-soft px-4 py-3 text-sm text-danger">
                      <span>❌ <strong>Crítico:</strong> A avaliação comportamental está marcada como obrigatória, mas nenhum template comportamental oficial foi selecionado. Isso bloqueará a publicação da vaga.</span>
                    </div>
                  )}

                  {/* Warning if no screening questions nor deal-breakers are set */}
                  {totalEliminatoriesCount === 0 && (
                    <div className="flex items-start gap-2 rounded-xl border border-[hsl(var(--warning))]/20 bg-warning-soft px-4 py-3 text-sm text-warning">
                      <span>⚠️ <strong>Aviso:</strong> Nenhum critério eliminatório nem pergunta de triagem foi cadastrada. É altamente recomendável adicionar perguntas de triagem ou deal breakers para filtrar candidatos fora do perfil.</span>
                    </div>
                  )}

                  {/* If all is good */}
                  {!hasBehavioralTemplateError && totalEliminatoriesCount > 0 && (
                    <div className="flex items-start gap-2 rounded-xl border border-[hsl(var(--success))]/20 bg-success-soft px-4 py-3 text-sm text-success">
                      <span>✅ <strong>Tudo certo:</strong> Os critérios eliminatórios e as configurações de fluxo de avaliação estão consistentes.</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      }

      case "review":
        return (
          <div className="space-y-6">
            <JobFormReviewStep
              form={form}
              mandatorySkills={mandatorySkills}
              optionalSkills={optionalSkills}
              eliminatorySkills={eliminatorySkills}
              jobQuality={jobQuality}
              backendPublishErrors={backendPublishErrors}
              selectedTemplateStatus={selectedTemplateStatus}
              frontendBlockers={frontendBlockers}
              publicationState={publicationState}
              onNavigateToStep={setActiveMacroStep}
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

  const formShellMaxWidth = "max-w-4xl";

  return (
    <div
      ref={pageRootRef}
      className={`mx-auto flex w-full ${formShellMaxWidth} flex-col gap-4 px-4 sm:px-6 py-6 pb-28`}
    >
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



      {aiApplyNotice && (
        <div className="flex items-start gap-2 rounded-2xl border border-[hsl(var(--success))]/20 bg-success-soft px-4 py-3 text-sm text-success">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{aiApplyNotice}</span>
        </div>
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
        <div className={`mx-auto flex ${formShellMaxWidth} items-center justify-between gap-2`}>
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
