import { ArrowLeft, ArrowRight, CheckCircle2, ChevronLeft, Circle, Loader2, Plus, Save, ShieldAlert, Sparkles, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { JobQualityBadge } from "../components/job/JobQualityBadge";
import { StatusPill } from "../components/common/StatusPill";
import { useAuth } from "../features/auth/useAuth";
import {
  behavioralRequirementKey,
  buildCreateJobPayload,
  buildUpdateJobPayload,
  EMPTY_FORM,
  formatPublicationBlocker,
  JOB_AREA_OPTIONS,
  JobFormValues,
  PendingJobSkill,
  PRIORITY_OPTIONS,
  trimToNull,
} from "../features/jobs/jobFormConfig";
import { buildFrontendPublicationBlockers, toForm } from "../features/jobs/utils/jobFormHelpers";
import { DEAL_BREAKER_FIELDS, DEAL_BREAKER_OPERATORS, type DealBreakerDraft, emptyDealBreakerDraft } from "../features/jobs/utils/dealBreakerHelpers";
import { getPublicationPanelState, getPanelToneClasses } from "../features/jobs/utils/publicationState";
import { extractPublication422Details } from "../features/jobs/utils/errorHelpers";
import { useJobConfigurationAlerts } from "../hooks/useJobConfigurationAlerts";
import { handleApiError } from "../shared/utils/errorHandler";
import { getJob, getJobQuality, publishJob, type CreateJobRequestPayload, type UpdateJobRequestPayload, updateJob, createJob } from "../services/jobsService";
import { skillsService } from "../services/skillsService";
import { toast } from "../shared/utils/toast";
import type { DealBreaker, Job, JobQualityResult, JobSkill, Skill } from "../types/domain";
import {
  formatEducationLevel,
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
  | "review";

const STEPS: Array<{ id: StepId; label: string; hint: string }> = [
  { id: "basic", label: "Dados básicos", hint: "Contexto e resumo da vaga" },
  { id: "requirements", label: "Requisitos mínimos", hint: "Base obrigatória do matching" },
  { id: "mandatory-skills", label: "Skills obrigatórias", hint: "Mínimo de 2 skills obrigatórias" },
  { id: "differentials", label: "Diferenciais", hint: "Desejáveis, ferramentas e extras" },
  { id: "deal-breakers", label: "Critérios eliminatórios", hint: "Regras de bloqueio explícitas" },
  { id: "review", label: "Revisão e publicação", hint: "Checklist final e mensagens do backend" },
];

type SkillSectionProps = {
  title: string;
  description: string;
  emphasis: string;
  availableSkills: Skill[];
  linkedSkills: Array<JobSkill | PendingJobSkill>;
  search: string;
  onSearchChange: (value: string) => void;
  addLabel: string;
  addMandatory: boolean;
  savingSkillId: string | null;
  onAddSkill: (skill: Skill, isMandatory: boolean) => Promise<void>;
  onUpdateSkill: (skill: JobSkill | PendingJobSkill, patch: Partial<PendingJobSkill>) => Promise<void>;
  onRemoveSkill: (skill: JobSkill | PendingJobSkill) => Promise<void>;
};

function SkillSection({
  title,
  description,
  emphasis,
  availableSkills,
  linkedSkills,
  search,
  onSearchChange,
  addLabel,
  addMandatory,
  savingSkillId,
  onAddSkill,
  onUpdateSkill,
  onRemoveSkill,
}: SkillSectionProps) {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-6">
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold text-[hsl(var(--text))]">{title}</h3>
          <p className="text-sm text-[hsl(var(--text-muted))]">{description}</p>
          <div className="inline-flex w-fit rounded-full border border-[hsl(var(--primary))]/20 bg-[hsl(var(--accent-soft))] px-3 py-1 text-xs font-medium text-[hsl(var(--primary))]">
            {emphasis}
          </div>
        </div>

        <div className="mt-5">
          <label className="flex flex-col gap-2 text-sm font-medium text-[hsl(var(--text))]">
            Buscar skill
            <input
              type="text"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Digite nome de skill, ferramenta ou certificação"
              className="ui-input h-11 rounded-xl px-3 text-sm"
            />
          </label>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {availableSkills.slice(0, 18).map((skill) => (
              <div
                key={skill.id}
                className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/50 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[hsl(var(--text))]">{skill.name}</p>
                    <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">
                      {skill.category ?? "Sem categoria"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={savingSkillId === skill.id}
                    onClick={() => void onAddSkill(skill, addMandatory)}
                  >
                    {savingSkillId === skill.id ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="mr-1 h-3.5 w-3.5" />
                    )}
                    {addLabel}
                  </Button>
                </div>
              </div>
            ))}
            {availableSkills.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] px-4 py-6 text-sm text-[hsl(var(--text-muted))] md:col-span-2 xl:col-span-3">
                Nenhuma skill disponível para este filtro.
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-base font-semibold text-[hsl(var(--text))]">Skills selecionadas</h4>
            <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
              {linkedSkills.length} item(ns) nesta etapa.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {linkedSkills.map((skill) => (
            <div
              key={skill.skill_id}
              className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/40 p-4"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[hsl(var(--text))]">{skill.skill_name}</p>
                  <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">
                    {skill.is_mandatory ? "Obrigatória" : "Desejável"}
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-3 lg:w-[520px]">
                  <label className="flex flex-col gap-1 text-xs font-medium text-[hsl(var(--text-muted))]">
                    Peso
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      value={skill.weight}
                      onChange={(event) =>
                        void onUpdateSkill(skill, { weight: Number(event.target.value) })
                      }
                      className="ui-input h-10 rounded-xl px-3 text-sm"
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-xs font-medium text-[hsl(var(--text-muted))]">
                    Nível mínimo
                    <select
                      value={skill.minimum_level ?? ""}
                      onChange={(event) =>
                        void onUpdateSkill(skill, { minimum_level: event.target.value || null })
                      }
                      className="ui-input h-10 rounded-xl px-3 text-sm"
                    >
                      <option value="">—</option>
                      <option value="intern">Estagiário</option>
                      <option value="junior">Júnior</option>
                      <option value="mid">Pleno</option>
                      <option value="senior">Sênior</option>
                      <option value="lead">Lead</option>
                      <option value="principal">Principal</option>
                      <option value="director">Diretor</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-xs font-medium text-[hsl(var(--text-muted))]">
                    Anos mínimos
                    <input
                      type="number"
                      min="0"
                      max="50"
                      step="0.5"
                      value={skill.minimum_years ?? ""}
                      onChange={(event) =>
                        void onUpdateSkill(skill, {
                          minimum_years: event.target.value ? Number(event.target.value) : null,
                        })
                      }
                      className="ui-input h-10 rounded-xl px-3 text-sm"
                      placeholder="—"
                    />
                  </label>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void onUpdateSkill(skill, { is_mandatory: !skill.is_mandatory })
                  }
                >
                  {skill.is_mandatory ? "Mover para desejáveis" : "Mover para obrigatórias"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void onRemoveSkill(skill)}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Remover
                </Button>
              </div>
            </div>
          ))}

          {linkedSkills.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] px-4 py-8 text-sm text-[hsl(var(--text-muted))]">
              Nenhuma skill adicionada nesta etapa.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export function JobFormPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const isEditing = Boolean(jobId);
  const [form, setForm] = useState<JobFormValues>(EMPTY_FORM);
  const [activeStep, setActiveStep] = useState<StepId>("basic");
  const [currentJob, setCurrentJob] = useState<Job | null>(null);
  const [jobSkills, setJobSkills] = useState<JobSkill[]>([]);
  const [pendingSkills, setPendingSkills] = useState<PendingJobSkill[]>([]);
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [jobQuality, setJobQuality] = useState<JobQualityResult | null>(null);
  const [pageLoading, setPageLoading] = useState(isEditing);
  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [savingSkillId, setSavingSkillId] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [backendPublishErrors, setBackendPublishErrors] = useState<string[]>([]);
  const [dealBreakerDraft, setDealBreakerDraft] = useState<DealBreakerDraft>(emptyDealBreakerDraft());
  const [skillSearch, setSkillSearch] = useState("");

  const canManage = user?.role === "admin" || user?.role === "recruiter";
  const { alerts } = useJobConfigurationAlerts(form);

  useEffect(() => {
    if (!canManage) return;

    let cancelled = false;
    void skillsService.list().then((items) => {
      if (!cancelled) {
        setAllSkills(items);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [canManage]);

  useEffect(() => {
    if (!isEditing || !jobId) {
      setPageLoading(false);
      setCurrentJob(null);
      setForm(EMPTY_FORM);
      setJobSkills([]);
      setPendingSkills([]);
      setJobQuality(null);
      return;
    }

    let cancelled = false;
    setPageLoading(true);
    setFormErrors([]);
    setBackendPublishErrors([]);

    void Promise.all([getJob(jobId), skillsService.listJobSkills(jobId), getJobQuality(jobId)])
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

  const combinedSkills = useMemo<Array<JobSkill | PendingJobSkill>>(() => {
    if (jobSkills.length === 0) return pendingSkills;

    const items: Array<JobSkill | PendingJobSkill> = [...jobSkills];
    for (const pending of pendingSkills) {
      if (!items.some((skill) => skill.skill_id === pending.skill_id)) {
        items.push(pending);
      }
    }
    return items;
  }, [jobSkills, pendingSkills]);

  const mandatorySkills = useMemo(
    () => combinedSkills.filter((skill) => skill.is_mandatory),
    [combinedSkills],
  );
  const optionalSkills = useMemo(
    () => combinedSkills.filter((skill) => !skill.is_mandatory),
    [combinedSkills],
  );

  const availableSkills = useMemo(() => {
    const linkedIds = new Set(combinedSkills.map((skill) => skill.skill_id));
    return allSkills.filter((skill) => {
      if (linkedIds.has(skill.id)) return false;
      if (!skillSearch.trim()) return true;
      const query = skillSearch.trim().toLowerCase();
      return (
        skill.name.toLowerCase().includes(query) ||
        (skill.category ?? "").toLowerCase().includes(query)
      );
    });
  }, [allSkills, combinedSkills, skillSearch]);

  const frontendBlockers = useMemo(
    () => buildFrontendPublicationBlockers(form, mandatorySkills.length),
    [form, mandatorySkills.length],
  );
  const publicationState = useMemo(
    () => getPublicationPanelState(form, currentJob, jobQuality, frontendBlockers),
    [form, currentJob, jobQuality, frontendBlockers],
  );

  const canTryPublishFrontend = frontendBlockers.length === 0 && mandatorySkills.length >= 2;
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

  async function refreshQuality(jobIdToRefresh: string) {
    try {
      const quality = await getJobQuality(jobIdToRefresh);
      setJobQuality(quality);
      return quality;
    } catch {
      setJobQuality(null);
      return null;
    }
  }

  async function syncPendingSkills(jobIdToSync: string) {
    if (pendingSkills.length === 0) return;

    for (const skill of pendingSkills) {
      await skillsService.addJobSkill(jobIdToSync, {
        skill_id: skill.skill_id,
        is_mandatory: skill.is_mandatory,
        minimum_level: skill.minimum_level ?? undefined,
        minimum_years: skill.minimum_years ?? undefined,
        weight: skill.weight,
      });
    }

    const refreshedSkills = await skillsService.listJobSkills(jobIdToSync);
    setJobSkills(refreshedSkills);
    setPendingSkills([]);
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
      const refreshedSkills = await skillsService.listJobSkills(saved.id);
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

      const quality = await refreshQuality(saved.id);
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

  async function handleAddSkill(skill: Skill, isMandatory: boolean) {
    setSavingSkillId(skill.id);
    setBackendPublishErrors([]);
    try {
      if (currentJob) {
        await skillsService.addJobSkill(currentJob.id, {
          skill_id: skill.id,
          is_mandatory: isMandatory,
          weight: 1,
        });
        const refreshedSkills = await skillsService.listJobSkills(currentJob.id);
        setJobSkills(refreshedSkills);
        await refreshQuality(currentJob.id);
      } else {
        setPendingSkills((current) => [
          ...current,
          {
            skill_id: skill.id,
            skill_name: skill.name,
            is_mandatory: isMandatory,
            minimum_level: null,
            minimum_years: null,
            weight: 1,
          },
        ]);
      }
    } finally {
      setSavingSkillId(null);
    }
  }

  async function handleUpdateSkill(skill: JobSkill | PendingJobSkill, patch: Partial<PendingJobSkill>) {
    if (currentJob && "id" in skill) {
      setSavingSkillId(skill.skill_id);
      try {
        await skillsService.updateJobSkill(currentJob.id, skill.skill_id, {
          is_mandatory: patch.is_mandatory ?? skill.is_mandatory,
          minimum_level: patch.minimum_level ?? skill.minimum_level,
          minimum_years: patch.minimum_years ?? skill.minimum_years,
          weight: patch.weight ?? skill.weight,
        });
        const refreshedSkills = await skillsService.listJobSkills(currentJob.id);
        setJobSkills(refreshedSkills);
        await refreshQuality(currentJob.id);
      } finally {
        setSavingSkillId(null);
      }
      return;
    }

    setPendingSkills((current) =>
      current.map((item) =>
        item.skill_id === skill.skill_id ? { ...item, ...patch } : item,
      ),
    );
  }

  async function handleRemoveSkill(skill: JobSkill | PendingJobSkill) {
    if (currentJob && "id" in skill) {
      setSavingSkillId(skill.skill_id);
      try {
        await skillsService.removeJobSkill(currentJob.id, skill.skill_id);
        const refreshedSkills = await skillsService.listJobSkills(currentJob.id);
        setJobSkills(refreshedSkills);
        await refreshQuality(currentJob.id);
      } finally {
        setSavingSkillId(null);
      }
      return;
    }

    setPendingSkills((current) => current.filter((item) => item.skill_id !== skill.skill_id));
  }

  function addBehavioralRequirement() {
    const value = form.newBehavioralRequirement.trim();
    if (!value) return;
    if (
      form.behavioral_requirements.some(
        (item) => behavioralRequirementKey(item) === behavioralRequirementKey(value),
      )
    ) {
      return;
    }
    setForm((current) => ({
      ...current,
      behavioral_requirements: [...current.behavioral_requirements, value],
      newBehavioralRequirement: "",
    }));
  }

  function addDealBreaker() {
    const allowed = DEAL_BREAKER_OPERATORS[dealBreakerDraft.field] ?? ["equals"];
    if (!dealBreakerDraft.field || !dealBreakerDraft.value.trim() || !dealBreakerDraft.reason.trim()) {
      return;
    }
    if (!allowed.includes(dealBreakerDraft.operator)) {
      return;
    }
    const item: DealBreaker = {
      field: dealBreakerDraft.field,
      operator: dealBreakerDraft.operator,
      value: dealBreakerDraft.value.trim(),
      reason: dealBreakerDraft.reason.trim(),
      is_active: dealBreakerDraft.is_active,
    };
    setForm((current) => ({
      ...current,
      deal_breakers: [...(current.deal_breakers ?? []), item],
    }));
    setDealBreakerDraft(emptyDealBreakerDraft());
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
          <div className="space-y-6">
            <SectionCard
              title="Dados básicos"
              description="Apresente a oportunidade de forma objetiva para dar contexto ao matching."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Título da vaga *">
                  <input
                    value={form.title}
                    onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                    className="ui-input h-11 rounded-xl px-3 text-sm"
                    placeholder="Ex: Analista de Dados Pleno"
                  />
                </Field>
                <Field label="Área *">
                  <select
                    value={form.job_area}
                    onChange={(event) => setForm((current) => ({ ...current, job_area: event.target.value }))}
                    className="ui-input h-11 rounded-xl px-3 text-sm"
                  >
                    <option value="">Selecione</option>
                    {JOB_AREA_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Senioridade *">
                  <select
                    value={form.seniority_level}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, seniority_level: event.target.value }))
                    }
                    className="ui-input h-11 rounded-xl px-3 text-sm"
                  >
                    <option value="">Selecione</option>
                    <option value="intern">Estagiário</option>
                    <option value="junior">Júnior</option>
                    <option value="mid">Pleno</option>
                    <option value="senior">Sênior</option>
                    <option value="lead">Lead</option>
                    <option value="principal">Principal</option>
                    <option value="director">Diretor</option>
                  </select>
                </Field>
                <Field label="Prioridade">
                  <select
                    value={form.priority}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        priority: event.target.value as JobFormValues["priority"],
                      }))
                    }
                    className="ui-input h-11 rounded-xl px-3 text-sm"
                  >
                    {PRIORITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Descrição curta *">
                <textarea
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, description: event.target.value }))
                  }
                  className="ui-input min-h-40 rounded-2xl px-3 py-3 text-sm"
                  placeholder="Explique a missão principal da vaga, contexto do time e objetivo da contratação."
                />
              </Field>
            </SectionCard>
          </div>
        );

      case "requirements":
        return (
          <div className="space-y-6">
            <SectionCard
              title="Requisitos mínimos"
              description="Esses campos estruturam o matching mínimo e influenciam diretamente a publicação."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Escolaridade mínima">
                  <select
                    value={form.minimum_education_level}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        minimum_education_level: event.target.value,
                      }))
                    }
                    className="ui-input h-11 rounded-xl px-3 text-sm"
                  >
                    <option value="">Selecione</option>
                    <option value="none">Nenhuma</option>
                    <option value="high_school">Ensino médio</option>
                    <option value="technical">Técnico</option>
                    <option value="bachelor">Graduação</option>
                    <option value="postgraduate">Pós-graduação</option>
                    <option value="master">Mestrado</option>
                    <option value="phd">Doutorado</option>
                  </select>
                </Field>
                <Field label="Anos mínimos de experiência *">
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={form.minimum_years_experience ?? ""}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        minimum_years_experience: event.target.value
                          ? Number(event.target.value)
                          : undefined,
                      }))
                    }
                    className="ui-input h-11 rounded-xl px-3 text-sm"
                  />
                </Field>
                <Field label="Modelo de trabalho">
                  <select
                    value={form.work_model}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, work_model: event.target.value }))
                    }
                    className="ui-input h-11 rounded-xl px-3 text-sm"
                  >
                    <option value="">Selecione</option>
                    <option value="remote">Remoto</option>
                    <option value="hybrid">Híbrido</option>
                    <option value="onsite">Presencial</option>
                  </select>
                </Field>
                <Field label="Localização">
                  <input
                    value={form.location}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, location: event.target.value }))
                    }
                    className="ui-input h-11 rounded-xl px-3 text-sm"
                    placeholder="Ex: São Paulo/SP ou Remoto"
                  />
                </Field>
              </div>
            </SectionCard>

            <SectionCard
              title="Base descritiva"
              description="Esses campos deixam o matching mais confiável e facilitam a revisão da vaga."
            >
              <div className="space-y-4">
                <Field label="Requisitos">
                  <textarea
                    value={form.requirements}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, requirements: event.target.value }))
                    }
                    className="ui-input min-h-28 rounded-2xl px-3 py-3 text-sm"
                    placeholder="Liste conhecimentos, vivências e critérios essenciais."
                  />
                </Field>
                <Field label="Responsabilidades">
                  <textarea
                    value={form.responsibilities}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, responsibilities: event.target.value }))
                    }
                    className="ui-input min-h-28 rounded-2xl px-3 py-3 text-sm"
                    placeholder="Descreva entregas principais e responsabilidades diárias."
                  />
                </Field>
                <Field label="Contexto de experiência">
                  <textarea
                    value={form.experience_context}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, experience_context: event.target.value }))
                    }
                    className="ui-input min-h-28 rounded-2xl px-3 py-3 text-sm"
                    placeholder="Explique contexto, ambiente, stack ou porte esperado."
                  />
                </Field>
              </div>
            </SectionCard>
          </div>
        );

      case "mandatory-skills":
        return (
          <SkillSection
            title="Skills obrigatórias"
            description="Defina o que realmente impacta o score e o ranking. A publicação exige pelo menos 2 skills obrigatórias."
            emphasis={`${mandatorySkills.length} skill(s) obrigatória(s) • mínimo 2`}
            availableSkills={availableSkills}
            linkedSkills={mandatorySkills}
            search={skillSearch}
            onSearchChange={setSkillSearch}
            addLabel="Obrigatória"
            addMandatory
            savingSkillId={savingSkillId}
            onAddSkill={handleAddSkill}
            onUpdateSkill={handleUpdateSkill}
            onRemoveSkill={handleRemoveSkill}
          />
        );

      case "differentials":
        return (
          <div className="space-y-6">
            <SkillSection
              title="Diferenciais"
              description="Use skills desejáveis para ferramentas, certificações, idiomas e experiências extras que ajudam no matching sem bloquear candidatos."
              emphasis={`${optionalSkills.length} skill(s) desejável(is)`}
              availableSkills={availableSkills}
              linkedSkills={optionalSkills}
              search={skillSearch}
              onSearchChange={setSkillSearch}
              addLabel="Desejável"
              addMandatory={false}
              savingSkillId={savingSkillId}
              onAddSkill={handleAddSkill}
              onUpdateSkill={handleUpdateSkill}
              onRemoveSkill={handleRemoveSkill}
            />

            <SectionCard
              title="Requisitos comportamentais"
              description="Esses itens ajudam a orientar a leitura da vaga e a futura avaliação."
            >
              <div className="flex flex-col gap-3 md:flex-row">
                <input
                  value={form.newBehavioralRequirement}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      newBehavioralRequirement: event.target.value,
                    }))
                  }
                  className="ui-input h-11 flex-1 rounded-xl px-3 text-sm"
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
                      setForm((current) => ({
                        ...current,
                        behavioral_requirements: current.behavioral_requirements.filter(
                          (value) => value !== item,
                        ),
                      }))
                    }
                    className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-3 py-2 text-xs text-[hsl(var(--text))]"
                  >
                    {item}
                    <Trash2 className="h-3.5 w-3.5 text-[hsl(var(--text-muted))]" />
                  </button>
                ))}
                {form.behavioral_requirements.length === 0 ? (
                  <p className="text-sm text-[hsl(var(--text-muted))]">
                    Nenhum requisito comportamental adicionado.
                  </p>
                ) : null}
              </div>
            </SectionCard>
          </div>
        );

      case "deal-breakers":
        return (
          <div className="space-y-6">
            <SectionCard
              title="Critérios eliminatórios"
              description="Use com parcimônia. Esses critérios servem para bloquear casos realmente incompatíveis."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Campo">
                  <select
                    value={dealBreakerDraft.field}
                    onChange={(event) =>
                      setDealBreakerDraft((current) => ({
                        ...current,
                        field: event.target.value,
                        operator: (DEAL_BREAKER_OPERATORS[event.target.value] ?? ["equals"])[0],
                      }))
                    }
                    className="ui-input h-11 rounded-xl px-3 text-sm"
                  >
                    <option value="">Selecione</option>
                    {DEAL_BREAKER_FIELDS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Operador">
                  <select
                    value={dealBreakerDraft.operator}
                    onChange={(event) =>
                      setDealBreakerDraft((current) => ({
                        ...current,
                        operator: event.target.value as DealBreaker["operator"],
                      }))
                    }
                    className="ui-input h-11 rounded-xl px-3 text-sm"
                  >
                    {(DEAL_BREAKER_OPERATORS[dealBreakerDraft.field] ?? ["equals"]).map((operator) => (
                      <option key={operator} value={operator}>
                        {operator}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Valor">
                  <input
                    value={dealBreakerDraft.value}
                    onChange={(event) =>
                      setDealBreakerDraft((current) => ({ ...current, value: event.target.value }))
                    }
                    className="ui-input h-11 rounded-xl px-3 text-sm"
                    placeholder="Ex: remoto, inglês, 5 anos"
                  />
                </Field>
                <Field label="Motivo do bloqueio">
                  <input
                    value={dealBreakerDraft.reason}
                    onChange={(event) =>
                      setDealBreakerDraft((current) => ({ ...current, reason: event.target.value }))
                    }
                    className="ui-input h-11 rounded-xl px-3 text-sm"
                    placeholder="Explique por que esse critério elimina"
                  />
                </Field>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button type="button" onClick={addDealBreaker}>
                  Adicionar critério eliminatório
                </Button>
                <span className="text-xs text-[hsl(var(--text-muted))]">
                  Exemplo: modelo de trabalho diferente de remoto.
                </span>
              </div>
            </SectionCard>

            <SectionCard
              title="Deal breakers configurados"
              description="Revise os critérios ativos antes de publicar."
            >
              <div className="space-y-3">
                {(form.deal_breakers ?? []).map((rule, index) => (
                  <div
                    key={`${rule.field}-${rule.reason}-${index}`}
                    className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/40 p-4"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-[hsl(var(--text))]">
                          {rule.field} • {rule.operator}
                        </p>
                        <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
                          Valor: {rule.value ?? rule.values?.join(", ") ?? "—"}
                        </p>
                        <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">
                          Motivo: {rule.reason}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setForm((current) => ({
                              ...current,
                              deal_breakers: (current.deal_breakers ?? []).map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, is_active: !item.is_active }
                                  : item,
                              ),
                            }))
                          }
                        >
                          {rule.is_active ? "Desativar" : "Ativar"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setForm((current) => ({
                              ...current,
                              deal_breakers: (current.deal_breakers ?? []).filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            }))
                          }
                        >
                          Remover
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                {(form.deal_breakers ?? []).length === 0 ? (
                  <p className="text-sm text-[hsl(var(--text-muted))]">
                    Nenhum critério eliminatório configurado.
                  </p>
                ) : null}
              </div>
            </SectionCard>
          </div>
        );

      case "review":
        return (
          <div className="space-y-6">
            <SectionCard
              title="Resumo da vaga"
              description="Revise os principais campos antes de salvar ou publicar."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <ReviewItem label="Título" value={form.title || "—"} />
                <ReviewItem label="Área" value={form.job_area || "—"} />
                <ReviewItem label="Senioridade" value={formatSeniority(form.seniority_level || null)} />
                <ReviewItem label="Prioridade" value={PRIORITY_OPTIONS.find((item) => item.value === form.priority)?.label ?? form.priority} />
                <ReviewItem label="Escolaridade mínima" value={formatEducationLevel(form.minimum_education_level || null)} />
                <ReviewItem label="Experiência mínima" value={form.minimum_years_experience ? `${form.minimum_years_experience} anos` : "—"} />
                <ReviewItem label="Modelo de trabalho" value={formatWorkModel(form.work_model || null)} />
                <ReviewItem label="Localização" value={form.location || "—"} />
                <ReviewItem label="Skills obrigatórias" value={`${mandatorySkills.length}`} />
                <ReviewItem label="Skills desejáveis" value={`${optionalSkills.length}`} />
                <ReviewItem label="Deal breakers" value={`${(form.deal_breakers ?? []).filter((item) => item.is_active).length}`} />
              </div>
            </SectionCard>

            <SectionCard
              title="Checklist de publicação"
              description="Esses itens precisam estar corretos para a publicação ser liberada."
            >
              <div className="space-y-2">
                {[
                  { ok: trimToNull(form.job_area ?? "") !== null, label: "Área da vaga definida" },
                  { ok: trimToNull(form.seniority_level ?? "") !== null, label: "Senioridade definida" },
                  { ok: (form.minimum_years_experience ?? 0) > 0, label: "Experiência mínima preenchida" },
                  { ok: mandatorySkills.length >= 2, label: "Pelo menos 2 skills obrigatórias" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3 rounded-2xl border border-[hsl(var(--border))] px-4 py-3 text-sm">
                    {item.ok ? (
                      <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
                    ) : (
                      <ShieldAlert className="h-4 w-4 text-[hsl(var(--danger))]" />
                    )}
                    <span className={item.ok ? "text-[hsl(var(--text))]" : "text-[hsl(var(--danger))]"}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard
              title="Mensagens do backend"
              description="Aqui aparecem bloqueios reais de publicação e orientações de qualidade."
            >
              <div className="space-y-4">
                {backendPublishErrors.length > 0 ? (
                  <MessageList
                    tone="danger"
                    title="Publicação bloqueada"
                    items={backendPublishErrors}
                  />
                ) : null}

                {jobQuality?.publication_blockers && jobQuality.publication_blockers.length > 0 ? (
                  <MessageList
                    tone="danger"
                    title="Bloqueios reais"
                    items={jobQuality.publication_blockers.map((blocker) =>
                      formatPublicationBlocker(blocker),
                    )}
                  />
                ) : null}

                {jobQuality?.suggestions && jobQuality.suggestions.length > 0 ? (
                  <MessageList tone="warning" title="Sugestões" items={jobQuality.suggestions} />
                ) : null}

                {jobQuality?.warnings && jobQuality.warnings.length > 0 ? (
                  <MessageList tone="warning" title="Avisos" items={jobQuality.warnings} />
                ) : null}

                {!jobQuality && backendPublishErrors.length === 0 ? (
                  <p className="text-sm text-[hsl(var(--text-muted))]">
                    Salve ou valide a vaga para carregar mensagens do backend.
                  </p>
                ) : null}
              </div>
            </SectionCard>
          </div>
        );
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-6 py-6 pb-12">
      <div className="sticky top-[72px] z-20 rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))]/95 p-4 shadow-sm backdrop-blur">
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {STEPS.map((step, index) => {
                const isActive = step.id === activeStep;
                const isDone = index < currentStepIndex;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => setActiveStep(step.id)}
                    className={[
                      "rounded-2xl border px-4 py-3 text-left transition",
                      isActive
                        ? "border-[hsl(var(--primary))] bg-[hsl(var(--accent-soft))]"
                        : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/35 hover:bg-[hsl(var(--surface-muted))]",
                    ].join(" ")}
                  >
                    <div className="flex items-start gap-3">
                      {isDone ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 text-[hsl(var(--success))]" />
                      ) : isActive ? (
                        <Circle className="mt-0.5 h-4 w-4 fill-[hsl(var(--primary))] text-[hsl(var(--primary))]" />
                      ) : (
                        <Circle className="mt-0.5 h-4 w-4 text-[hsl(var(--text-muted))]" />
                      )}
                      <div>
                        <p className="text-sm font-semibold text-[hsl(var(--text))]">{step.label}</p>
                        <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">{step.hint}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {renderStepContent()}

          <div className="flex flex-col gap-3 rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-5 sm:flex-row sm:items-center sm:justify-between">
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
              <SummaryRow label="Skills obrigatórias" value={`${mandatorySkills.length}`} />
              <SummaryRow label="Skills desejáveis" value={`${optionalSkills.length}`} />
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

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-6">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-[hsl(var(--text))]">{title}</h2>
        <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-[hsl(var(--text))]">
      {label}
      {children}
    </label>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/35 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--text-muted))]">{label}</p>
      <p className="mt-2 text-sm text-[hsl(var(--text))]">{value}</p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[hsl(var(--text-muted))]">{label}</span>
      <span className="font-medium text-[hsl(var(--text))]">{value}</span>
    </div>
  );
}

function MessageList({
  tone,
  title,
  items,
}: {
  tone: "danger" | "warning";
  title: string;
  items: string[];
}) {
  const toneClass =
    tone === "danger"
      ? "border-[hsl(var(--danger))]/20 bg-[hsl(var(--danger-soft))] text-[hsl(var(--danger))]"
      : "border-[hsl(var(--warning))]/20 bg-[hsl(var(--warning-soft))] text-[hsl(var(--warning))]";

  return (
    <div className={`rounded-3xl border p-4 ${toneClass}`}>
      <p className="text-sm font-semibold">{title}</p>
      <ul className="mt-3 space-y-2 text-sm">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-current" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
