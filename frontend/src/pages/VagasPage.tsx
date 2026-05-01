import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { CrudPage } from "../components/common/CrudPage";
import { ActionMenu } from "../components/common/ActionMenu";
import type { ActionMenuItem } from "../components/common/ActionMenu";
import { EmptyState } from "../components/common/EmptyState";
import { Modal } from "../components/common/Modal";
import { PageHeader } from "../components/common/PageHeader";
import Pagination from "../components/common/Pagination";
import { StatusPill } from "../components/common/StatusPill";
import { Tabs, type Tab } from "../components/common/Tabs";
import { useAsyncState } from "../hooks/useAsyncState";
import { useJobConfigurationAlerts } from "../hooks/useJobConfigurationAlerts";
import { JobConfigurationPreview } from "../components/job/JobConfigurationPreview";
import { JobSkillsKanban, type PendingJobSkill } from "../components/job/JobSkillsKanban";
import { JobQualityBadge } from "../components/job/JobQualityBadge";
import { Button } from "@/components/ui/button";
import { formatErrorDetails, formatErrorForToast, handleApiError } from "../services/errorHandler";
import {
  listJobs,
  createJob,
  updateJob,
  getJobRanking,
  deleteJob,
  publishJob,
  pauseJob,
  closeJob,
  cancelJob,
  getJobQuality,
  type CreateJobRequestPayload,
  type UpdateJobRequestPayload,
} from "../services/jobsService";
import { skillsService } from "../services/skillsService";
import { toast } from "../services/toast";
import { Job, JobSkill, Skill, DealBreaker, JobQualityResult } from "../types/domain";
import { Paginated } from "../types/api";
import { useAuth } from "../features/auth/useAuth";
import { usePipeline } from "../features/pipeline/PipelineContext";
import {
  formatJobStatus,
  formatSeniority,
  formatWorkModel,
  formatEducationLevel,
  jobStatusTone,
} from "../utils/jobFormatters";

type JobFormValues = {
  title: string;
  description: string;
  requirements?: string;
  responsibilities?: string;
  experience_context?: string;
  behavioral_requirements: string[];
  newBehavioralRequirement: string;
  status: string;
  job_area?: string;
  priority: "low" | "normal" | "high" | "urgent";
  seniority_level?: string;
  minimum_education_level?: string;
  minimum_years_experience?: number;
  deal_breakers?: DealBreaker[];
  work_model?: string;
  location?: string;
  salary_min?: number;
  salary_max?: number;
};

type RankingFreshness = {
  isStale: boolean;
  latestComputedAt: string | null;
};

type QualityFilter = "all" | "attention" | "good" | "unknown";

const EMPTY_FORM: JobFormValues = {
  title: "",
  description: "",
  requirements: "",
  responsibilities: "",
  experience_context: "",
  behavioral_requirements: [],
  newBehavioralRequirement: "",
  status: "draft",
  job_area: "",
  priority: "normal",
  seniority_level: "",
  minimum_education_level: "",
  minimum_years_experience: undefined,
  deal_breakers: [],
  work_model: "",
  location: "",
};

const TEST_JOB_FORM: JobFormValues = {
  title: "Vaga Teste - Backend Pleno",
  description:
    "Buscamos uma pessoa desenvolvedora backend pleno para atuar na evolucao de APIs, integracoes e rotinas de processamento. A pessoa vai trabalhar em parceria com produto e dados para construir servicos confiaveis, monitorados e preparados para escala.",
  requirements:
    "Experiencia com Python, PostgreSQL e Docker. Vivencia com APIs REST, testes automatizados, versionamento com Git e boas praticas de observabilidade.",
  responsibilities:
    "Desenvolver e evoluir APIs backend, integrar serviços internos e apoiar decisões técnicas com times de produto e dados.",
  experience_context:
    "Experiência prática com construção e manutenção de APIs, banco relacional e rotinas de deploy em ambientes de produção.",
  behavioral_requirements: ["Comunicação", "Autonomia", "Organização"],
  newBehavioralRequirement: "",
  status: "draft",
  job_area: "Tecnologia",
  priority: "high",
  seniority_level: "mid",
  minimum_education_level: "bachelor",
  minimum_years_experience: 3,
  deal_breakers: [
    {
      field: "work_model",
      operator: "not_equals",
      value: "remote",
      reason: "Esta vaga e somente remota.",
      is_active: true,
    },
  ],
  work_model: "remote",
  location: "Remoto",
  salary_min: undefined,
  salary_max: undefined,
};

const JOB_AREA_OPTIONS = [
  "Tecnologia",
  "Dados",
  "Financeiro",
  "Fiscal",
  "Contábil",
  "Administrativo",
  "Comercial",
  "Operacional",
  "RH",
  "Liderança",
] as const;

const PRIORITY_OPTIONS: Array<{ value: JobFormValues["priority"]; label: string }> = [
  { value: "low", label: "Baixa" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" },
];

function formatSalary(job: Job): string {
  if (job.salary_min == null && job.salary_max == null) return "—";
  if (job.salary_min != null && job.salary_max != null) {
    return `${job.salary_currency} ${job.salary_min.toLocaleString("pt-BR")} – ${job.salary_max.toLocaleString("pt-BR")}`;
  }
  if (job.salary_min != null) return `A partir de ${job.salary_currency} ${job.salary_min.toLocaleString("pt-BR")}`;
  return `Até ${job.salary_currency} ${job.salary_max?.toLocaleString("pt-BR")}`;
}

function truncate(value: string, max = 100): string {
  return value.length <= max ? value : `${value.slice(0, max).trim()}…`;
}

function buildJobQualitySummary(job: Job): JobQualityResult | null {
  if (job.quality_score == null || !job.quality_status) {
    return null;
  }

  return {
    job_id: job.id,
    quality_score: job.quality_score,
    status: job.quality_status,
    can_publish: job.quality_score >= 50,
    missing_fields: [],
    suggestions: [],
    warnings: [],
  };
}

function getQualityStatusLabel(status: Job["quality_status"]): string {
  if (status === "good") return "Boa";
  if (status === "acceptable") return "Aceitável";
  if (status === "weak") return "Fraca";
  return "Indisponível";
}

function matchesQualityFilter(job: Job, filter: QualityFilter): boolean {
  if (filter === "all") return true;
  if (filter === "attention") return job.quality_status === "weak" || job.quality_status === "acceptable";
  if (filter === "good") return job.quality_status === "good";
  return job.quality_status == null || job.quality_score == null;
}

function getQualityRowClass(job: Job): string {
  if (job.quality_status === "weak") {
    return "border-l-4 border-l-[hsl(var(--danger))] bg-[hsl(var(--danger-soft))]/35";
  }
  if (job.quality_status === "acceptable") {
    return "border-l-4 border-l-[hsl(var(--warning))] bg-[hsl(var(--warning-soft))]/30";
  }
  return "";
}

function formatDealBreakerValue(rule: DealBreaker): string {
  const rawValue = rule.value || rule.values?.join(", ") || "—";

  if (rule.field === "work_model") {
    return rule.values?.length
      ? rule.values.map((value) => formatWorkModel(value)).join(", ")
      : formatWorkModel(rule.value ?? null);
  }

  if (rule.field === "seniority_level") {
    return rule.values?.length
      ? rule.values.map((value) => formatSeniority(value)).join(", ")
      : formatSeniority(rule.value ?? null);
  }

  if (rule.field === "highest_education_level" || rule.field === "education_level") {
    return rule.values?.length
      ? rule.values.map((value) => formatEducationLevel(value)).join(", ")
      : formatEducationLevel(rule.value ?? null);
  }

  if (rule.field === "total_experience_years" || rule.field === "experience_years") {
    return rule.values?.length
      ? rule.values.map((value) => `${value} ano${value === "1" ? "" : "s"}`).join(", ")
      : rule.value
        ? `${rule.value} ano${rule.value === "1" ? "" : "s"}`
        : rawValue;
  }

  return rawValue;
}

function getDealBreakerFieldLabel(field: string): string {
  const fieldLabels: Record<string, string> = {
    work_model: "Modelo de trabalho",
    location: "Localização",
    seniority_level: "Senioridade",
    highest_education_level: "Educação",
    education_level: "Educação",
    total_experience_years: "Experiência",
    experience_years: "Experiência",
  };

  return fieldLabels[field] ?? field;
}

function getDealBreakerOperatorLabel(operator: DealBreaker["operator"]): string {
  const operatorLabels: Record<string, string> = {
    equals: "igual a",
    not_equals: "diferente de",
    contains: "contém",
    in: "está em",
  };

  return operatorLabels[operator] ?? operator;
}

function formatDealBreakerLabel(rule: DealBreaker): string {
  const fieldLabel = getDealBreakerFieldLabel(rule.field);
  const operatorLabel = getDealBreakerOperatorLabel(rule.operator);
  const valueLabel = formatDealBreakerValue(rule);

  return `${fieldLabel} ${operatorLabel} ${valueLabel}`;
}

function trimToNull(value?: string): string | null {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}

function buildCreateJobPayload(form: JobFormValues): CreateJobRequestPayload {
  const payload: CreateJobRequestPayload = {
    title: form.title,
    description: form.description,
    status: form.status,
    priority: form.priority,
  };

  const requirements = trimToNull(form.requirements);
  const responsibilities = trimToNull(form.responsibilities);
  const experienceContext = trimToNull(form.experience_context);
  const jobArea = trimToNull(form.job_area);
  const seniorityLevel = trimToNull(form.seniority_level);
  const minimumEducationLevel = trimToNull(form.minimum_education_level);
  const workModel = trimToNull(form.work_model);
  const location = trimToNull(form.location);
  const behavioralRequirements = form.behavioral_requirements
    .map((item) => item.trim())
    .filter(Boolean);

  if (requirements) payload.requirements = requirements;
  if (responsibilities) payload.responsibilities = responsibilities;
  if (experienceContext) payload.experience_context = experienceContext;
  if (jobArea) payload.job_area = jobArea;
  if (seniorityLevel) payload.seniority_level = seniorityLevel;
  if (minimumEducationLevel) payload.minimum_education_level = minimumEducationLevel;
  // Convert Decimal fields to strings for backend validation
  if (form.minimum_years_experience !== undefined) payload.minimum_years_experience = String(form.minimum_years_experience);
  if ((form.deal_breakers ?? []).length > 0) payload.deal_breakers = form.deal_breakers;
  if (workModel) payload.work_model = workModel;
  if (location) payload.location = location;
  if (form.salary_min !== undefined) payload.salary_min = String(form.salary_min);
  if (form.salary_max !== undefined) payload.salary_max = String(form.salary_max);
  if (behavioralRequirements.length > 0) payload.behavioral_requirements = behavioralRequirements;

  return payload;
}

function buildUpdateJobPayload(form: JobFormValues): UpdateJobRequestPayload {
  return {
    title: form.title,
    description: form.description,
    status: form.status,
    requirements: trimToNull(form.requirements),
    responsibilities: trimToNull(form.responsibilities),
    experience_context: trimToNull(form.experience_context),
    behavioral_requirements: form.behavioral_requirements.map((item) => item.trim()).filter(Boolean),
    job_area: trimToNull(form.job_area),
    priority: form.priority,
    seniority_level: trimToNull(form.seniority_level),
    minimum_education_level: trimToNull(form.minimum_education_level),
    // Convert Decimal fields to strings for backend validation
    minimum_years_experience: form.minimum_years_experience !== undefined ? String(form.minimum_years_experience) : null,
    deal_breakers: form.deal_breakers ?? [],
    work_model: trimToNull(form.work_model),
    location: trimToNull(form.location),
    salary_min: form.salary_min !== undefined ? String(form.salary_min) : null,
    salary_max: form.salary_max !== undefined ? String(form.salary_max) : null,
  };
}

function getLatestRankingComputedAt(computedAtValues: string[]): string | null {
  if (computedAtValues.length === 0) return null;

  return computedAtValues.reduce((latest, current) =>
    new Date(current).getTime() > new Date(latest).getTime() ? current : latest
  );
}

function getRankingFreshness(job: Job, latestComputedAt: string | null): RankingFreshness {
  if (!latestComputedAt) {
    return { isStale: false, latestComputedAt: null };
  }

  return {
    isStale: new Date(job.updated_at).getTime() > new Date(latestComputedAt).getTime(),
    latestComputedAt,
  };
}

export function VagasPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const { data, error, loading, run } = useAsyncState<Paginated<Job>>();

  useEffect(() => { void run(() => listJobs(page, pageSize)); }, [run, page, pageSize]);
  useEffect(() => { setPage(1); }, [pageSize]);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<JobFormValues>(EMPTY_FORM);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState<string | null>(null);

  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [rankingFreshnessByJobId, setRankingFreshnessByJobId] = useState<Record<string, RankingFreshness>>({});
  const [jobSkills, setJobSkills] = useState<JobSkill[]>([]);
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [skillToAdd, setSkillToAdd] = useState("");
  const [isMandatory, setIsMandatory] = useState(false);
  const [addingSkill, setAddingSkill] = useState(false);
  const [skillError, setSkillError] = useState<string | null>(null);
  const selectedJobDetailsRef = useRef<HTMLDivElement | null>(null);

  const [newDealBreaker, setNewDealBreaker] = useState<Partial<DealBreaker>>({
    field: "",
    operator: "equals",
    value: "",
    reason: "",
    is_active: true,
  });
  const [dealBreakerError, setDealBreakerError] = useState<string | null>(null);

  // Skills kanban state
  const [activeTab, setActiveTab] = useState<"info" | "details" | "skills" | "eliminatorios">("info");
  const [pendingSkills, setPendingSkills] = useState<PendingJobSkill[]>([]);
  const [modalJobSkills, setModalJobSkills] = useState<JobSkill[]>([]);

  // Job quality state
  const [jobQuality, setJobQuality] = useState<JobQualityResult | null>(null);
  const [loadingQuality, setLoadingQuality] = useState(false);
  const [showQualityModal, setShowQualityModal] = useState(false);
  const [pendingPublishJobId, setPendingPublishJobId] = useState<string | null>(null);
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>("all");

  const navigate = useNavigate();
  const { user } = useAuth();
  const { invalidateJobState } = usePipeline();
  const canManage = user?.role === "admin" || user?.role === "recruiter";

  // Load ranking freshness only after the selected job state exists.
  useEffect(() => {
    if (!selectedJob) return;

    let isCancelled = false;

    (async () => {
      try {
        const ranking = await getJobRanking(selectedJob.id);
        if (isCancelled) return;

        const latestComputedAt = getLatestRankingComputedAt(
          ranking.candidates.map((candidate) => candidate.computed_at).filter(Boolean),
        );
        const freshness = getRankingFreshness(selectedJob, latestComputedAt);

        setRankingFreshnessByJobId((prev) => ({
          ...prev,
          [selectedJob.id]: freshness,
        }));
      } catch {
        // Silently ignore ranking fetch errors
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [selectedJob?.id, selectedJob?.updated_at]);

  // Load quality score when switching to Skills tab in modal
  useEffect(() => {
    if (!showForm || activeTab !== "skills" || !editingJob) {
      setJobQuality(null);
      return;
    }

    void loadJobQuality(editingJob.id);
  }, [showForm, activeTab, editingJob?.id]);

  function openCreateForm() {
    setEditingJob(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setPendingSkills([]);
    setModalJobSkills([]);
    setActiveTab("info");
    setShowForm(true);
  }

  function normalizeBehavioralRequirement(value: string) {
    return value.trim().replace(/\s+/g, " ");
  }

  function behavioralRequirementKey(value: string) {
    return normalizeBehavioralRequirement(value).toLocaleLowerCase("pt-BR");
  }

  function handleAddBehavioralRequirement() {
    const normalized = normalizeBehavioralRequirement(form.newBehavioralRequirement);
    if (!normalized) {
      setFormError("Requisito comportamental não pode estar vazio.");
      return;
    }
    if (form.behavioral_requirements.some((item) => behavioralRequirementKey(item) === behavioralRequirementKey(normalized))) {
      setFormError("Requisito comportamental duplicado.");
      return;
    }
    setForm((current) => ({
      ...current,
      behavioral_requirements: [...current.behavioral_requirements, normalized],
      newBehavioralRequirement: "",
    }));
    setFormError(null);
  }

  function handleRemoveBehavioralRequirement(value: string) {
    setForm((current) => ({
      ...current,
      behavioral_requirements: current.behavioral_requirements.filter((item) => item !== value),
    }));
  }

  function openTestCreateForm() {
    setEditingJob(null);
    setForm({
      ...TEST_JOB_FORM,
      deal_breakers: TEST_JOB_FORM.deal_breakers?.map((rule) => ({ ...rule })) ?? [],
    });
    setNewDealBreaker({ field: "", operator: "equals", value: "", reason: "", is_active: true });
    setFormError(null);
    setDealBreakerError(null);
    setPendingSkills([]);
    setModalJobSkills([]);
    setActiveTab("info");
    setShowForm(true);
  }

  function toFriendlyText(error: unknown): string {
    return formatErrorDetails(handleApiError(error)).join(" ");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    if (
      form.salary_min !== undefined &&
      form.salary_max !== undefined &&
      form.salary_min > form.salary_max
    ) {
      setFormError("Salário mínimo não pode ser maior que o máximo.");
      setSaving(false);
      return;
    }
    try {
      if (editingJob) {
        const payload = buildUpdateJobPayload(form);
        const updated = await updateJob(editingJob.id, payload);
        await invalidateJobState(updated.id);
        if (selectedJob?.id === updated.id) {
          setSelectedJob(updated);
        }
        toast.success(`Vaga atualizada: ${updated.title}`);
      } else {
        const payload = buildCreateJobPayload(form);
        const created = await createJob(payload);
        await invalidateJobState(created.id);

        // Save pending skills if any
        if (pendingSkills.length > 0) {
          const results = await Promise.allSettled(
            pendingSkills.map((ps) =>
              skillsService.addJobSkill(created.id, {
                skill_id: ps.skill_id,
                is_mandatory: ps.is_mandatory,
                minimum_level: ps.minimum_level ?? undefined,
                minimum_years: ps.minimum_years ?? undefined,
                weight: ps.weight,
              })
            )
          );
          const failed = results.filter((r) => r.status === "rejected").length;
          if (failed > 0) {
            toast.warning(
              `Vaga criada com sucesso, mas ${failed} skill(s) não foram vinculadas.`
            );
          }
        }

        toast.success(`Vaga criada: ${created.title}`);
      }
      setForm(EMPTY_FORM);
      setEditingJob(null);
      setShowForm(false);
      setPendingSkills([]);
      setModalJobSkills([]);
      setActiveTab("info");
      setPage(1);
      void run(() => listJobs(1, pageSize));
    } catch (err) {
      setFormError(toFriendlyText(err) || "Falha ao salvar vaga");
    } finally {
      setSaving(false);
    }
  }

  async function handleTransition(jobId: string, action: "publish" | "pause" | "close" | "cancel") {
    // Intercept publish action to check quality first
    if (action === "publish") {
      setLoadingQuality(true);
      try {
        const quality = await getJobQuality(jobId);
        setJobQuality(quality);
        if (!quality.can_publish) {
          setShowQualityModal(true);
          setPendingPublishJobId(jobId);
          return;
        }
      } catch (err) {
        toast.error(formatErrorForToast(handleApiError(err)));
        return;
      } finally {
        setLoadingQuality(false);
      }
    }

    setTransitioning(jobId);
    try {
      const fns = { publish: publishJob, pause: pauseJob, close: closeJob, cancel: cancelJob };
      const updated = await fns[action](jobId);
      await invalidateJobState(updated.id);
      if (selectedJob?.id === updated.id) {
        setSelectedJob(updated);
      }
      void run(() => listJobs(page, pageSize));
    } catch (err) {
      toast.error(formatErrorForToast(handleApiError(err)));
    } finally {
      setTransitioning(null);
    }
  }

  async function handleDelete() {
    if (!confirmDeleteId) return;
    const job = (data?.data ?? []).find((j) => j.id === confirmDeleteId);
    try {
      await deleteJob(confirmDeleteId);
      await invalidateJobState(confirmDeleteId);
      if (selectedJob?.id === confirmDeleteId) {
        setSelectedJob(null);
        setJobSkills([]);
      }
      toast.success(`Vaga "${job?.title ?? ""}" excluída`);
      void run(() => listJobs(1, pageSize));
    } catch (err) {
      toast.error(formatErrorForToast(handleApiError(err)));
    } finally {
      setConfirmDeleteId(null);
    }
  }

  async function loadJobSkills(jobId: string) {
    try {
      const [skills, allSkillsList] = await Promise.all([
        skillsService.listJobSkills(jobId),
        skillsService.list(),
      ]);
      setJobSkills(skills);
      setAllSkills(allSkillsList);
      // Also update modal view if editing
      setModalJobSkills(skills);
    } catch {
      setJobSkills([]);
      setModalJobSkills([]);
    }
  }

  async function loadJobQuality(jobId: string) {
    setLoadingQuality(true);
    try {
      const quality = await getJobQuality(jobId);
      setJobQuality(quality);
    } catch {
      setJobQuality(null);
    } finally {
      setLoadingQuality(false);
    }
  }

  async function handleConfirmPublish() {
    if (!pendingPublishJobId) return;
    setShowQualityModal(false);
    setPendingPublishJobId(null);
    setTransitioning(pendingPublishJobId);
    try {
      const updated = await publishJob(pendingPublishJobId);
      await invalidateJobState(updated.id);
      if (selectedJob?.id === updated.id) {
        setSelectedJob(updated);
      }
      toast.success("Vaga publicada com sucesso");
      void run(() => listJobs(page, pageSize));
    } catch (err) {
      toast.error(formatErrorForToast(handleApiError(err)));
    } finally {
      setTransitioning(null);
    }
  }

  function handleSelectJob(job: Job) {
    if (selectedJob?.id === job.id) {
      setSelectedJob(null);
      setJobSkills([]);
    } else {
      setSelectedJob(job);
      void loadJobSkills(job.id);
    }
    setSkillError(null);
  }

  useEffect(() => {
    if (!selectedJob || !canManage) return;

    const target = selectedJobDetailsRef.current;
    if (!target) return;

    const frame = window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [selectedJob?.id, canManage]);

  async function handleAddSkill() {
    if (!selectedJob || !skillToAdd) return;
    setAddingSkill(true);
    setSkillError(null);
    try {
      await skillsService.addJobSkill(selectedJob.id, { skill_id: skillToAdd, is_mandatory: isMandatory });
      setSkillToAdd("");
      setIsMandatory(false);
      await loadJobSkills(selectedJob.id);
    } catch (err) {
      setSkillError(toFriendlyText(err) || "Falha ao vincular skill");
    } finally {
      setAddingSkill(false);
    }
  }

  async function handleRemoveSkill(skillId: string) {
    if (!selectedJob) return;
    try {
      await skillsService.removeJobSkill(selectedJob.id, skillId);
      await loadJobSkills(selectedJob.id);
    } catch (err) {
      setSkillError(toFriendlyText(err) || "Falha ao remover skill");
    }
  }

  function handleAddDealBreaker() {
    setDealBreakerError(null);
    if (!newDealBreaker.field) {
      setDealBreakerError("Campo é obrigatório");
      return;
    }
    if (!newDealBreaker.operator) {
      setDealBreakerError("Operador é obrigatório");
      return;
    }
    if (!newDealBreaker.reason) {
      setDealBreakerError("Motivo é obrigatório");
      return;
    }
    // Validate operator is allowed for field
    const allowedOps: Record<string, string[]> = {
      location: ["equals", "not_equals", "contains", "in"],
      work_model: ["equals", "not_equals"],
      education_level: ["equals", ">="],
      experience_years: ["equals", ">=", "<="],
      skill: ["contains", "not_contains"],
      language: ["equals", "contains"],
      availability: ["equals"],
      custom_text: ["contains"],
    };
    const field = newDealBreaker.field as string;
    if (allowedOps[field] && !allowedOps[field].includes(newDealBreaker.operator)) {
      setDealBreakerError(`Operador '${newDealBreaker.operator}' não é permitido para o campo '${field}'`);
      return;
    }
    if (!newDealBreaker.value && newDealBreaker.operator !== "in") {
      setDealBreakerError("Valor é obrigatório");
      return;
    }
    if (newDealBreaker.operator === "in" && !newDealBreaker.value) {
      setDealBreakerError("Valores são obrigatórios para operador 'Em lista'");
      return;
    }

    const dealBreaker: DealBreaker = {
      field: newDealBreaker.field!,
      operator: newDealBreaker.operator as DealBreaker["operator"],
      value: newDealBreaker.operator === "in" ? undefined : newDealBreaker.value,
      values: newDealBreaker.operator === "in" ? (newDealBreaker.value?.split(",").map((v) => v.trim()) ?? []) : undefined,
      reason: newDealBreaker.reason!,
      is_active: newDealBreaker.is_active ?? true,
    };
    setForm((f) => ({
      ...f,
      deal_breakers: [...(f.deal_breakers ?? []), dealBreaker],
    }));
    setNewDealBreaker({ field: "", operator: "equals", value: "", reason: "", is_active: true });
  }

  function handleRemoveDealBreaker(index: number) {
    setForm((f) => ({
      ...f,
      deal_breakers: (f.deal_breakers ?? []).filter((_, i) => i !== index),
    }));
  }

  function handleToggleDealBreaker(index: number) {
    setForm((f) => ({
      ...f,
      deal_breakers: (f.deal_breakers ?? []).map((db, i) => (i === index ? { ...db, is_active: !db.is_active } : db)),
    }));
  }

  // Configuration preview section
  function ConfigurationPreviewSection({ form, editingJob }: { form: JobFormValues; editingJob: Job | null }) {
    const { alerts, summary } = useJobConfigurationAlerts(form);
    return (
      <JobConfigurationPreview
        alerts={alerts}
        summary={summary}
        jobTitle={editingJob ? "Salvar alterações" : "Criar vaga"}
      />
    );
  }

  const total = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;
  const items = data?.data ?? [];
  const filteredItems = items.filter((job) => matchesQualityFilter(job, qualityFilter));
  const selectedJobQualitySummary = selectedJob ? buildJobQualitySummary(selectedJob) : null;
  const qualityCounts = {
    all: items.length,
    attention: items.filter((job) => matchesQualityFilter(job, "attention")).length,
    good: items.filter((job) => matchesQualityFilter(job, "good")).length,
    unknown: items.filter((job) => matchesQualityFilter(job, "unknown")).length,
  };
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const linkedSkillIds = new Set(jobSkills.map((s) => s.skill_id));
  const availableSkills = allSkills.filter((s) => !linkedSkillIds.has(s.id));

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 pb-12">
      <PageHeader
        title="Vagas"
        subtitle="Gestão das oportunidades abertas"
        actions={
          user?.role === "admin" ? (
            <Button type="button" variant="outline" onClick={openTestCreateForm}>
              Criar vaga teste
            </Button>
          ) : null
        }
      />

      {showForm ? (
        <Modal
          title={editingJob ? "Editar vaga" : "Criar vaga"}
          onClose={() => { setShowForm(false); setEditingJob(null); setForm(EMPTY_FORM); setPendingSkills([]); setModalJobSkills([]); setActiveTab("info"); }}
          contentClassName={`flex w-full flex-col max-h-[90vh] overflow-hidden p-0 ${
            activeTab === "skills" ? "max-w-[1100px]" : "max-w-[800px]"
          }`}
        >
          <form onSubmit={(e) => void handleSave(e)} className="flex min-h-0 flex-1 flex-col">
            {/* Tabs */}
            <div className="shrink-0 border-b border-[hsl(var(--border))] px-4 sm:px-6">
              <Tabs
                tabs={[
                  { key: "info", label: "Básico" },
                  { key: "details", label: "Requisitos e detalhes" },
                  { key: "skills", label: "Skills", caption: `${(modalJobSkills.length + pendingSkills.length)} adicionadas` },
                  { key: "eliminatorios", label: "Critérios Eliminatórios" },
                ]}
                active={activeTab}
                onChange={(key) => setActiveTab(key as typeof activeTab)}
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex flex-col gap-6">
                <ConfigurationPreviewSection form={form} editingJob={editingJob} />

                {/* Aba: Informações básicas */}
                {activeTab === "info" ? (
                  <>
                <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/35 p-4 sm:p-5">
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-[hsl(var(--text))]">Informações básicas</h3>
                    <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">Defina o contexto principal da vaga para facilitar entendimento e publicação.</p>
                  </div>
                  <div className="grid gap-4">
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-[hsl(var(--text))]">
                      Título *
                      <input
                        required
                        value={form.title}
                        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                        placeholder="Ex: Engenheiro de Software Sênior"
                        className="ui-input h-10 rounded-md px-3 text-sm"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-[hsl(var(--text))]">
                      Descrição *
                      <textarea
                        required
                        rows={4}
                        value={form.description}
                        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                        placeholder="Descreva as responsabilidades da vaga…"
                        className="ui-input min-h-28 rounded-md px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                </section>

                <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/35 p-4 sm:p-5">
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-[hsl(var(--text))]">Configuração da vaga</h3>
                    <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">Ajuste perfil, formato de trabalho e critérios objetivos da oportunidade.</p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-[hsl(var(--text))]">
                      Status
                      <select
                        value={form.status}
                        onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                        className="ui-input h-10 rounded-md px-3 text-sm"
                      >
                        <option value="draft">Rascunho</option>
                        <option value="published">Publicada</option>
                        <option value="paused">Pausada</option>
                        <option value="closed">Encerrada</option>
                        <option value="cancelled">Cancelada</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-[hsl(var(--text))]">
                      Área da vaga
                      <select
                        value={form.job_area}
                        onChange={(e) => setForm((f) => ({ ...f, job_area: e.target.value }))}
                        className="ui-input h-10 rounded-md px-3 text-sm"
                      >
                        <option value="">—</option>
                        {JOB_AREA_OPTIONS.map((area) => (
                          <option key={area} value={area}>
                            {area}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-[hsl(var(--text))]">
                      Prioridade
                      <select
                        value={form.priority}
                        onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as JobFormValues["priority"] }))}
                        className="ui-input h-10 rounded-md px-3 text-sm"
                      >
                        {PRIORITY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-[hsl(var(--text))]">
                      Senioridade
                      <select
                        value={form.seniority_level}
                        onChange={(e) => setForm((f) => ({ ...f, seniority_level: e.target.value }))}
                        className="ui-input h-10 rounded-md px-3 text-sm"
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
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-[hsl(var(--text))]">
                      Modelo de trabalho
                      <select
                        value={form.work_model}
                        onChange={(e) => setForm((f) => ({ ...f, work_model: e.target.value }))}
                        className="ui-input h-10 rounded-md px-3 text-sm"
                      >
                        <option value="">—</option>
                        <option value="remote">Remoto</option>
                        <option value="hybrid">Híbrido</option>
                        <option value="onsite">Presencial</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-[hsl(var(--text))]">
                      Localização
                      <input
                        value={form.location}
                        onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                        placeholder="São Paulo - SP"
                        className="ui-input h-10 rounded-md px-3 text-sm"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-[hsl(var(--text))]">
                      Educação mínima
                      <select
                        value={form.minimum_education_level}
                        onChange={(e) => setForm((f) => ({ ...f, minimum_education_level: e.target.value }))}
                        className="ui-input h-10 rounded-md px-3 text-sm"
                      >
                        <option value="">—</option>
                        <option value="none">Nenhuma</option>
                        <option value="high_school">Ensino Médio</option>
                        <option value="technical">Técnico</option>
                        <option value="bachelor">Graduação</option>
                        <option value="postgraduate">Pós-Graduação</option>
                        <option value="master">Mestrado</option>
                        <option value="phd">Doutorado</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-[hsl(var(--text))]">
                      Anos mínimos de experiência
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={form.minimum_years_experience ?? ""}
                        onChange={(e) => setForm((f) => ({ ...f, minimum_years_experience: e.target.value ? Number(e.target.value) : undefined }))}
                        placeholder="Ex: 5"
                        className="ui-input h-10 rounded-md px-3 text-sm"
                      />
                    </label>
                  </div>
                </section>

                <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/35 p-4 sm:p-5">
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-[hsl(var(--text))]">Salário</h3>
                    <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">Informe uma faixa salarial clara para orientar alinhamento com candidatos.</p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-[hsl(var(--text))]">
                      Salário mínimo (BRL)
                      <input
                        type="number"
                        min={0}
                        value={form.salary_min ?? ""}
                        onChange={(e) => setForm((f) => ({ ...f, salary_min: e.target.value ? Number(e.target.value) : undefined }))}
                        placeholder="10000"
                        className="ui-input h-10 rounded-md px-3 text-sm"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-[hsl(var(--text))]">
                      Salário máximo (BRL)
                      <input
                        type="number"
                        min={0}
                        value={form.salary_max ?? ""}
                        onChange={(e) => setForm((f) => ({ ...f, salary_max: e.target.value ? Number(e.target.value) : undefined }))}
                        placeholder="15000"
                        className="ui-input h-10 rounded-md px-3 text-sm"
                      />
                    </label>
                  </div>
                </section>
                  </>
                ) : null}

                {activeTab === "details" ? (
                  <>
                    <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/35 p-4 sm:p-5">
                      <div className="mb-4">
                        <h3 className="text-sm font-semibold text-[hsl(var(--text))]">Requisitos e responsabilidades</h3>
                        <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
                          Estruture o contexto da vaga para fortalecer o job profile e o matching futuro.
                        </p>
                      </div>
                      <div className="grid gap-4">
                        <label className="flex flex-col gap-1.5 text-sm font-medium text-[hsl(var(--text))]">
                          Requisitos
                          <textarea
                            rows={4}
                            value={form.requirements}
                            onChange={(e) => setForm((f) => ({ ...f, requirements: e.target.value }))}
                            placeholder="Requisitos técnicos, funcionais e critérios esperados."
                            className="ui-input min-h-28 rounded-md px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="flex flex-col gap-1.5 text-sm font-medium text-[hsl(var(--text))]">
                          Responsabilidades principais
                          <textarea
                            rows={5}
                            value={form.responsibilities}
                            onChange={(e) => setForm((f) => ({ ...f, responsibilities: e.target.value }))}
                            placeholder="Liste as principais entregas e atividades da vaga."
                            className="ui-input min-h-32 rounded-md px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="flex flex-col gap-1.5 text-sm font-medium text-[hsl(var(--text))]">
                          Contexto de experiência
                          <textarea
                            rows={4}
                            value={form.experience_context}
                            onChange={(e) => setForm((f) => ({ ...f, experience_context: e.target.value }))}
                            placeholder="Explique em que tipo de operação, produto, processo ou ambiente essa experiência deve ter acontecido."
                            className="ui-input min-h-28 rounded-md px-3 py-2 text-sm"
                          />
                        </label>
                      </div>
                    </section>

                    <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/35 p-4 sm:p-5">
                      <div className="mb-4">
                        <h3 className="text-sm font-semibold text-[hsl(var(--text))]">Requisitos comportamentais</h3>
                        <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
                          Adicione soft skills esperadas como tags estruturadas.
                        </p>
                      </div>

                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          value={form.newBehavioralRequirement}
                          onChange={(e) => setForm((f) => ({ ...f, newBehavioralRequirement: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddBehavioralRequirement();
                            }
                          }}
                          placeholder="Ex: comunicação, autonomia, organização"
                          className="ui-input h-10 flex-1 rounded-md px-3 text-sm"
                        />
                        <Button type="button" variant="outline" onClick={handleAddBehavioralRequirement}>
                          Adicionar
                        </Button>
                      </div>

                      <div className="mt-3 flex min-h-10 flex-wrap gap-2">
                        {form.behavioral_requirements.length > 0 ? (
                          form.behavioral_requirements.map((item) => (
                            <span
                              key={item}
                              className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-1 text-xs font-medium text-[hsl(var(--text))]"
                            >
                              {item}
                              <button
                                type="button"
                                onClick={() => handleRemoveBehavioralRequirement(item)}
                                className="text-[hsl(var(--text-muted))] transition hover:text-[hsl(var(--danger))]"
                                title={`Remover requisito comportamental ${item}`}
                              >
                                ×
                              </button>
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-[hsl(var(--text-muted))]">
                            Nenhum requisito comportamental cadastrado.
                          </span>
                        )}
                      </div>
                    </section>
                  </>
                ) : null}

                {/* Aba: Skills */}
                {activeTab === "skills" ? (
                  <div className="flex flex-col gap-4">
                    {editingJob && (
                      <div className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/50 p-4">
                        <div>
                          <p className="text-sm font-medium text-[hsl(var(--text))]">Qualidade da vaga</p>
                          <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">Verificação automática de completude e configuração</p>
                        </div>
                        <JobQualityBadge quality={jobQuality} loading={loadingQuality} />
                      </div>
                    )}
                    <JobSkillsKanban
                      jobId={editingJob?.id ?? null}
                      jobSkills={modalJobSkills}
                      allSkills={allSkills}
                      pendingSkills={pendingSkills}
                      onAddPending={(s) => setPendingSkills([...pendingSkills, s])}
                      onRemovePending={(skillId) =>
                        setPendingSkills(pendingSkills.filter((s) => s.skill_id !== skillId))
                      }
                      onUpdatePending={(skillId, patch) =>
                        setPendingSkills(
                          pendingSkills.map((s) =>
                            s.skill_id === skillId ? { ...s, ...patch } : s
                          )
                        )
                      }
                      onSkillAdded={() => void loadJobSkills(editingJob?.id || "")}
                      onSkillUpdated={() => void loadJobSkills(editingJob?.id || "")}
                    />
                  </div>
                ) : null}

                {/* Aba: Critérios Eliminatórios */}
                {activeTab === "eliminatorios" ? (
                <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/35 p-4 sm:p-5">
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-[hsl(var(--text))]">Critérios eliminatórios</h3>
                    <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">Defina regras que eliminam candidatos automaticamente quando um requisito não é atendido.</p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-[hsl(var(--text))]">
                      Campo *
                      <select
                        value={newDealBreaker.field ?? ""}
                        onChange={(e) => {
                          const field = e.target.value as any;
                          // Set operator to the first valid operator for the field
                          const opMap: Record<string, string[]> = {
                            location: ["equals", "not_equals", "contains", "in"],
                            work_model: ["equals", "not_equals"],
                            education_level: ["equals", ">="],
                            experience_years: ["equals", ">=", "<="],
                            skill: ["contains", "not_contains"],
                            language: ["equals", "contains"],
                            availability: ["equals"],
                            custom_text: ["contains"],
                          };
                          const defaultOp = opMap[field]?.[0] ?? "equals";
                          setNewDealBreaker((db) => ({ ...db, field, operator: defaultOp }));
                        }}
                        className="ui-input h-10 rounded-md px-3 text-sm"
                      >
                        <option value="">Selecione um campo</option>
                        <option value="location">Localização</option>
                        <option value="work_model">Modelo de Trabalho</option>
                        <option value="education_level">Nível de Educação</option>
                        <option value="experience_years">Anos de Experiência</option>
                        <option value="skill">Skill</option>
                        <option value="language">Idioma</option>
                        <option value="availability">Disponibilidade</option>
                        <option value="custom_text">Texto Personalizado</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-[hsl(var(--text))]">
                      Operador *
                      <select
                        value={newDealBreaker.operator ?? "equals"}
                        onChange={(e) => setNewDealBreaker((db) => ({ ...db, operator: e.target.value as any }))}
                        className="ui-input h-10 rounded-md px-3 text-sm"
                      >
                        {(() => {
                          const field = newDealBreaker.field as string;
                          const opMap: Record<string, { label: string; value: string }[]> = {
                            location: [
                              { label: "Igual a", value: "equals" },
                              { label: "Diferente de", value: "not_equals" },
                              { label: "Contém", value: "contains" },
                              { label: "Em lista", value: "in" },
                            ],
                            work_model: [
                              { label: "Igual a", value: "equals" },
                              { label: "Diferente de", value: "not_equals" },
                            ],
                            education_level: [
                              { label: "Exatamente", value: "equals" },
                              { label: "Mínimo (>=)", value: ">=" },
                            ],
                            experience_years: [
                              { label: "Igual a", value: "equals" },
                              { label: "Mínimo (>=)", value: ">=" },
                              { label: "Máximo (<=)", value: "<=" },
                            ],
                            skill: [
                              { label: "Tem skill", value: "contains" },
                              { label: "Não tem skill", value: "not_contains" },
                            ],
                            language: [
                              { label: "Exatamente", value: "equals" },
                              { label: "Contém", value: "contains" },
                            ],
                            availability: [
                              { label: "Exatamente", value: "equals" },
                            ],
                            custom_text: [
                              { label: "Contém", value: "contains" },
                            ],
                          };
                          const options = opMap[field] || [];
                          return options.length > 0 ? (
                            options.map((op) => (
                              <option key={op.value} value={op.value}>
                                {op.label}
                              </option>
                            ))
                          ) : (
                            <option disabled>Selecione um campo</option>
                          );
                        })()}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-[hsl(var(--text))]">
                      {newDealBreaker.operator === "in" ? "Valores *" : "Valor *"}
                      {newDealBreaker.operator === "in" ? (
                        <textarea
                          value={newDealBreaker.value ?? ""}
                          onChange={(e) => setNewDealBreaker((db) => ({ ...db, value: e.target.value }))}
                          placeholder={(() => {
                            const field = newDealBreaker.field as string;
                            const examples: Record<string, string> = {
                              location: "São Paulo, Rio de Janeiro, Belo Horizonte",
                              work_model: "remote, hybrid",
                              skill: "Python, Java",
                              language: "English, Spanish",
                            };
                            return examples[field] || "Valor1, Valor2, Valor3";
                          })()}
                          rows={3}
                          className="ui-input min-h-24 rounded-md px-3 py-2 text-sm"
                        />
                      ) : newDealBreaker.field === "experience_years" ? (
                        <input
                          type="number"
                          value={newDealBreaker.value ?? ""}
                          onChange={(e) => setNewDealBreaker((db) => ({ ...db, value: e.target.value }))}
                          placeholder="Ex: 5"
                          className="ui-input h-10 rounded-md px-3 text-sm"
                        />
                      ) : (
                        <textarea
                          value={newDealBreaker.value ?? ""}
                          onChange={(e) => setNewDealBreaker((db) => ({ ...db, value: e.target.value }))}
                          placeholder={(() => {
                            const field = newDealBreaker.field as string;
                            const examples: Record<string, string> = {
                              location: "São Paulo",
                              work_model: "remote",
                              education_level: "bachelor",
                              skill: "Python",
                              language: "English",
                              availability: "immediate",
                              custom_text: "required keyword",
                            };
                            return examples[field] || "Digite um valor";
                          })()}
                          rows={3}
                          className="ui-input min-h-24 rounded-md px-3 py-2 text-sm"
                        />
                      )}
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-[hsl(var(--text))]">
                      Motivo da eliminação *
                      <textarea
                        value={newDealBreaker.reason ?? ""}
                        onChange={(e) => setNewDealBreaker((db) => ({ ...db, reason: e.target.value }))}
                        placeholder="Explique por que este critério é eliminatório"
                        rows={3}
                        className="ui-input min-h-24 rounded-md px-3 py-2 text-sm"
                      />
                    </label>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button type="button" onClick={() => handleAddDealBreaker()}>
                      + Adicionar critério
                    </Button>
                  </div>

                  {dealBreakerError ? (
                    <div className="mt-4 flex items-start gap-2 rounded-lg border border-[hsl(var(--danger))]/20 bg-[hsl(var(--danger-soft))] px-4 py-3 text-sm text-[hsl(var(--danger))]">
                      <span className="font-bold">✕</span>
                      <span>{dealBreakerError}</span>
                    </div>
                  ) : null}

                  {(form.deal_breakers ?? []).length > 0 ? (
                    <div className="mt-4 overflow-hidden rounded-xl border border-[hsl(var(--border))]">
                      <div className="max-h-[250px] overflow-y-auto">
                        <div className="divide-y divide-[hsl(var(--border))] bg-[hsl(var(--surface))] md:hidden">
                          {(form.deal_breakers ?? []).map((db, idx) => (
                            <div key={idx} className="space-y-3 px-4 py-4">
                              <div className="grid grid-cols-1 gap-3">
                                <div>
                                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">Campo</div>
                                  <div className="mt-1 text-sm font-medium text-[hsl(var(--text))]">{getDealBreakerFieldLabel(db.field)}</div>
                                </div>
                                <div>
                                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">Operador</div>
                                  <div className="mt-1 text-sm text-[hsl(var(--text))]">{getDealBreakerOperatorLabel(db.operator)}</div>
                                </div>
                                <div>
                                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">Valor</div>
                                  <div className="mt-1 text-sm text-[hsl(var(--text))] break-words">{formatDealBreakerValue(db)}</div>
                                </div>
                                <div>
                                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">Motivo</div>
                                  <div className="mt-1 text-sm text-[hsl(var(--text))] break-words">{db.reason}</div>
                                </div>
                              </div>
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">Status</div>
                                  <div className="mt-1">
                                    <StatusPill label={db.is_active ? "Ativo" : "Inativo"} tone={db.is_active ? "success" : "neutral"} />
                                  </div>
                                </div>
                                <div className="flex flex-col gap-2 sm:flex-row">
                                  <label className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--text))]">
                                    <input
                                      type="checkbox"
                                      checked={db.is_active}
                                      onChange={() => handleToggleDealBreaker(idx)}
                                      className="h-4 w-4 rounded"
                                    />
                                    Ativo
                                  </label>
                                  <Button type="button" size="sm" variant="destructive" className="min-h-10" onClick={() => handleRemoveDealBreaker(idx)}>
                                    Remover
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <table className="hidden min-w-full divide-y divide-[hsl(var(--border))] text-sm md:table">
                          <thead className="sticky top-0 bg-[hsl(var(--surface-muted))]">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-[hsl(var(--text-muted))]">Regra</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-[hsl(var(--text-muted))]">Ativo</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-[hsl(var(--text-muted))]">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[hsl(var(--border))] bg-[hsl(var(--surface))]">
                            {(form.deal_breakers ?? []).map((db, idx) => (
                              <tr key={idx} className="hover:bg-[hsl(var(--surface-muted))]">
                                <td className="px-3 py-3">
                                  <div className="text-sm font-medium text-[hsl(var(--text))]">{formatDealBreakerLabel(db)}</div>
                                  <div className="mt-1 text-xs text-[hsl(var(--text-muted))]">Motivo: {db.reason}</div>
                                </td>
                                <td className="px-3 py-3 align-top">
                                  <input
                                    type="checkbox"
                                    checked={db.is_active}
                                    onChange={() => handleToggleDealBreaker(idx)}
                                    className="mt-1 h-4 w-4 rounded"
                                  />
                                </td>
                                <td className="px-3 py-3 align-top">
                                  <Button type="button" size="sm" variant="destructive" onClick={() => handleRemoveDealBreaker(idx)}>
                                    Remover
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </section>
                ) : null}
              </div>
            </div>

            <div className="shrink-0 border-t border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-4 py-4 sm:px-6">
              <div className="flex flex-col gap-3">
                {formError ? (
                  <div className="flex items-start gap-2 rounded-lg border border-[hsl(var(--danger))]/20 bg-[hsl(var(--danger-soft))] px-4 py-3 text-sm text-[hsl(var(--danger))]">
                    <span className="font-bold">✕</span>
                    <span>{formError}</span>
                  </div>
                ) : null}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => { setShowForm(false); setEditingJob(null); setForm(EMPTY_FORM); }}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={saving || !form.title || !form.description}>
                    {saving ? "Salvando…" : editingJob ? "Salvar alterações" : "Criar vaga"}
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </Modal>
      ) : null}

      {confirmDeleteId ? (
        <Modal title="Confirmar exclusão" onClose={() => setConfirmDeleteId(null)}>
          <p className="text-sm text-[hsl(var(--text-muted))]">Tem certeza que deseja excluir esta vaga? Esta ação é irreversível.</p>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setConfirmDeleteId(null)}>Cancelar</Button>
            <Button type="button" variant="destructive" onClick={() => void handleDelete()}>Excluir vaga</Button>
          </div>
        </Modal>
      ) : null}

      {showQualityModal && jobQuality ? (
        <Modal
          title={jobQuality.can_publish ? "Publicar com aviso de qualidade" : "Qualidade insuficiente para publicação"}
          onClose={() => { setShowQualityModal(false); setPendingPublishJobId(null); }}
        >
          <div className="space-y-4">
            <div className={`rounded-lg border p-4 ${
              jobQuality.can_publish
                ? "border-[hsl(var(--warning))]/20 bg-[hsl(var(--warning-soft))]"
                : "border-[hsl(var(--danger))]/20 bg-[hsl(var(--danger-soft))]"
            }`}>
              <div className="flex items-start gap-3">
                <div className="text-2xl">{jobQuality.can_publish ? "⚠️" : "🚫"}</div>
                <div>
                  <p className={`font-semibold ${jobQuality.can_publish ? "text-[hsl(var(--warning))]" : "text-[hsl(var(--danger))]"}`}>
                    Pontuação: {jobQuality.quality_score}/100
                  </p>
                  <p className="mt-1 text-sm text-[hsl(var(--text))]">
                    {jobQuality.status === "weak" && "Esta vaga está com qualidade fraca e não pode ser publicada. Melhore a vaga para habilitar a publicação."}
                    {jobQuality.status === "acceptable" && "Esta vaga tem qualidade aceitável. Recomendamos melhorias antes de publicar, mas é possível prosseguir."}
                    {jobQuality.status === "good" && "Esta vaga tem boa qualidade e está pronta para publicação."}
                  </p>
                </div>
              </div>
            </div>

            {jobQuality.missing_fields.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-[hsl(var(--text))]">Campos faltando:</p>
                <ul className="mt-2 space-y-1 text-sm text-[hsl(var(--text-muted))]">
                  {jobQuality.missing_fields.map((field) => (
                    <li key={field} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {field}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {jobQuality.suggestions.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-[hsl(var(--text))]">Sugestões:</p>
                <ul className="mt-2 space-y-1 text-sm text-[hsl(var(--text-muted))]">
                  {jobQuality.suggestions.map((sugg, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {sugg}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!jobQuality.can_publish && (
              <p className="text-sm text-[hsl(var(--danger))]">
                Revise e melhore os campos indicados acima para alcançar uma pontuação de pelo menos 50 pontos.
              </p>
            )}
            {jobQuality.can_publish && jobQuality.status === "acceptable" && (
              <p className="text-sm text-[hsl(var(--text-muted))]">
                Você pode publicar esta vaga, mas recomendamos resolver os pontos indicados para melhor qualidade.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => { setShowQualityModal(false); setPendingPublishJobId(null); }}
            >
              {jobQuality.can_publish ? "Voltar e melhorar" : "Cancelar"}
            </Button>
            {jobQuality.can_publish && (
              <Button
                type="button"
                onClick={() => void handleConfirmPublish()}
                disabled={transitioning === pendingPublishJobId}
              >
                {transitioning === pendingPublishJobId ? "Publicando…" : jobQuality.status === "acceptable" ? "Publicar com alerta" : "Publicar"}
              </Button>
            )}
          </div>
        </Modal>
      ) : null}

      <CrudPage<Job>
        onNew={canManage ? openCreateForm : undefined}
        newLabel="Nova vaga"
        loading={loading}
        error={error}
        isEmpty={!loading && !error && total === 0}
        emptyIcon="💼"
        emptyTitle="Nenhuma vaga cadastrada"
        emptyDescription="Crie a primeira vaga para começar o processo de recrutamento."
        emptyAction={canManage ? { label: "+ Criar vaga", onClick: openCreateForm } : undefined}
        filters={
          <div className="flex flex-wrap items-center gap-2">
            {[
              { key: "all", label: "Todas" },
              { key: "attention", label: "Precisam revisão" },
              { key: "good", label: "Boas" },
              { key: "unknown", label: "Sem avaliação" },
            ].map((option) => {
              const key = option.key as QualityFilter;
              const active = qualityFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setQualityFilter(key)}
                  className={[
                    "inline-flex min-h-9 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition",
                    active
                      ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]"
                      : "border-[hsl(var(--border))] bg-[hsl(var(--surface))] text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text))]",
                  ].join(" ")}
                >
                  <span>{option.label}</span>
                  <span className="rounded-full bg-[hsl(var(--surface-muted))] px-2 py-0.5 text-xs text-[hsl(var(--text))]">
                    {qualityCounts[key]}
                  </span>
                </button>
              );
            })}
          </div>
        }
        columns={[
          "Título",
          "Status",
          "Qualidade",
          "Perfil",
          "Localização / Faixa",
          ...(canManage ? ["Ações"] : []),
        ]}
        items={filteredItems}
        renderRow={(job) => (
          (() => {
            const qualitySummary = buildJobQualitySummary(job);
            const actionItems: ActionMenuItem[] = [
              {
                label: "Editar",
                onClick: () => {
                  setEditingJob(job);
                  setForm({
                    title: job.title,
                    description: job.description,
                    requirements: job.requirements ?? "",
                    responsibilities: job.responsibilities ?? "",
                    experience_context: job.experience_context ?? "",
                    behavioral_requirements: [...(job.behavioral_requirements ?? [])],
                    newBehavioralRequirement: "",
                    status: job.status,
                    job_area: job.job_area ?? "",
                    priority: job.priority ?? "normal",
                    seniority_level: job.seniority_level ?? "",
                    minimum_education_level: job.minimum_education_level ?? "",
                    minimum_years_experience: job.minimum_years_experience ?? undefined,
                    deal_breakers: job.deal_breakers ?? [],
                    work_model: job.work_model ?? "",
                    location: job.location ?? "",
                    salary_min: job.salary_min ?? undefined,
                    salary_max: job.salary_max ?? undefined,
                  });
                  setPendingSkills([]);
                  setModalJobSkills([]);
                  void loadJobSkills(job.id);
                  setActiveTab("info");
                  setShowForm(true);
                  setFormError(null);
                },
              },
              job.status === "draft"
                ? {
                    label: "Publicar",
                    onClick: () => void handleTransition(job.id, "publish"),
                  }
                : null,
              job.status === "published"
                ? {
                    label: "Pausar",
                    onClick: () => void handleTransition(job.id, "pause"),
                  }
                : null,
              job.status === "published"
                ? {
                    label: "Fechar",
                    onClick: () => void handleTransition(job.id, "close"),
                  }
                : null,
              job.status === "paused"
                ? {
                    label: "Republicar",
                    onClick: () => void handleTransition(job.id, "publish"),
                  }
                : null,
              job.status === "paused"
                ? {
                    label: "Fechar",
                    onClick: () => void handleTransition(job.id, "close"),
                  }
                : null,
              {
                label: "Excluir",
                tone: "danger" as const,
                onClick: () => setConfirmDeleteId(job.id),
              },
            ].filter((item): item is ActionMenuItem => Boolean(item));

              return (
              <tr
                key={job.id}
                onClick={() => handleSelectJob(job)}
                className={[
                  "border-b border-[hsl(var(--border))] transition-colors",
                  job.id === selectedJob?.id
                    ? "bg-[hsl(var(--accent-soft))]"
                    : getQualityRowClass(job) || "even:bg-[hsl(var(--surface-muted))]/70 hover:bg-[hsl(var(--surface-muted))]",
                ].join(" ")}
              >
                <td className="min-w-[280px] px-4 py-3 align-top">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-semibold text-[hsl(var(--text))]">{job.title}</div>
                      {rankingFreshnessByJobId[job.id]?.isStale ? (
                        <StatusPill label="Ranking desatualizado" tone="warning" />
                      ) : null}
                    </div>
                    <div className="text-sm leading-5 text-[hsl(var(--text-muted))]">{truncate(job.description, 140)}</div>
                    {job.quality_status && job.quality_status !== "good" ? (
                      <div className={`text-xs ${job.quality_status === "weak" ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--warning))]"}`}>
                        Qualidade {job.quality_score ?? "—"}/100 • {job.quality_score != null && job.quality_score >= 50 ? "Pode publicar com atenção" : "Requer revisão antes de publicar"}
                      </div>
                    ) : null}
                    {rankingFreshnessByJobId[job.id]?.isStale ? (
                      <div className="text-xs text-[hsl(var(--warning))]">Será recalculado automaticamente.</div>
                    ) : null}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 align-top">
                  <StatusPill label={formatJobStatus(job.status)} tone={jobStatusTone(job.status)} />
                </td>
                <td className="min-w-[160px] px-4 py-3 align-top">
                  {qualitySummary ? (
                    <div className="space-y-1">
                      <JobQualityBadge quality={qualitySummary} compact />
                      <div className="text-xs text-[hsl(var(--text-muted))]">
                        {qualitySummary.can_publish ? "Pode publicar" : "Requer revisão"}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-[hsl(var(--text-muted))]">Sem avaliação</div>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-[hsl(var(--text-muted))] align-top">
                  {formatSeniority(job.seniority_level)} · {formatWorkModel(job.work_model)}
                </td>
                <td className="min-w-[220px] px-4 py-3 align-top">
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-[hsl(var(--text))]">{job.location ?? "—"}</div>
                    <div className="text-sm text-[hsl(var(--text-muted))]">{formatSalary(job)}</div>
                  </div>
                </td>
                {canManage ? (
                  <td className="px-4 py-3 align-top" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="default" size="sm" type="button" onClick={() => navigate(`/pipeline/${job.id}`)}>
                        Abrir pipeline
                      </Button>
                      <ActionMenu
                        buttonLabel={`Ações de ${job.title}`}
                        items={actionItems}
                      />
                    </div>
                  </td>
                ) : null}
              </tr>
            );
          })()
        )}
        footer={
          total > 0 ? (
            <>
              <span className="text-sm text-muted-foreground">
                {qualityFilter === "all"
                  ? `Mostrando ${start}–${end} de ${total}`
                  : `Filtro ativo: ${filteredItems.length} de ${items.length} vagas nesta página`}
              </span>
              <Pagination
                page={page}
                totalPages={totalPages}
                onPageChange={(p) => setPage(p)}
                pageSize={pageSize}
                onPageSizeChange={(s) => setPageSize(s)}
                total={total}
              />
            </>
          ) : undefined
        }
      >
        {selectedJob && canManage ? (
          <div ref={selectedJobDetailsRef} className="ui-card scroll-mt-6 overflow-hidden rounded-xl shadow-sm">
            <div className="border-b border-[hsl(var(--border))] px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold text-[hsl(var(--text))]">{selectedJob.title}</h3>
                  {rankingFreshnessByJobId[selectedJob.id]?.isStale ? (
                    <StatusPill label="Ranking desatualizado" tone="warning" />
                  ) : null}
                </div>
                {selectedJobQualitySummary ? (
                  <JobQualityBadge quality={selectedJobQualitySummary} />
                ) : null}
              </div>
              {rankingFreshnessByJobId[selectedJob.id]?.isStale ? (
                <p className="mt-2 text-sm text-[hsl(var(--warning))]">Será recalculado automaticamente.</p>
              ) : null}
            </div>

            <div className="grid gap-4 px-6 py-5 md:grid-cols-[160px_1fr] md:gap-x-6">
              <span className="text-sm font-medium text-[hsl(var(--text-muted))]">Status</span>
              <span>
                <StatusPill label={formatJobStatus(selectedJob.status)} tone={jobStatusTone(selectedJob.status)} />
              </span>
              <span className="text-sm font-medium text-[hsl(var(--text-muted))]">Perfil</span>
              <span className="text-sm text-[hsl(var(--text-muted))]">{formatSeniority(selectedJob.seniority_level)} · {formatWorkModel(selectedJob.work_model)}</span>
              <span className="text-sm font-medium text-[hsl(var(--text-muted))]">Qualidade da vaga</span>
              <span className="flex flex-wrap items-center gap-2 text-sm text-[hsl(var(--text-muted))]">
                {selectedJob.quality_score != null && selectedJob.quality_status ? (
                  <>
                    <span className="font-medium text-[hsl(var(--text))]">
                      {selectedJob.quality_score}/100
                    </span>
                    <span>•</span>
                    <span>{getQualityStatusLabel(selectedJob.quality_status)}</span>
                    <span>•</span>
                    <span>{selectedJob.quality_score >= 50 ? "Pronta para publicação" : "Requer revisão"}</span>
                  </>
                ) : (
                  "Sem avaliação"
                )}
              </span>
              <span className="text-sm font-medium text-[hsl(var(--text-muted))]">Área / prioridade</span>
              <span className="text-sm text-[hsl(var(--text-muted))]">{selectedJob.job_area ?? "—"} · {selectedJob.priority ?? "normal"}</span>
              <span className="text-sm font-medium text-[hsl(var(--text-muted))]">Educação mínima</span>
              <span className="text-sm text-[hsl(var(--text-muted))]">{selectedJob.minimum_education_level ? formatEducationLevel(selectedJob.minimum_education_level) : "—"}</span>
              <span className="text-sm font-medium text-[hsl(var(--text-muted))]">Experiência mínima</span>
              <span className="text-sm text-[hsl(var(--text-muted))]">{selectedJob.minimum_years_experience !== null && selectedJob.minimum_years_experience !== undefined ? `${selectedJob.minimum_years_experience} ano${selectedJob.minimum_years_experience === 1 ? "" : "s"}` : "—"}</span>
              <span className="text-sm font-medium text-[hsl(var(--text-muted))]">Localização</span>
              <span className="text-sm text-[hsl(var(--text-muted))]">{selectedJob.location ?? "—"}</span>
              <span className="text-sm font-medium text-[hsl(var(--text-muted))]">Faixa salarial</span>
              <span className="text-sm text-[hsl(var(--text-muted))]">{formatSalary(selectedJob)}</span>
              <span className="text-sm font-medium text-[hsl(var(--text-muted))]">Descrição</span>
              <span className="text-sm leading-6 text-[hsl(var(--text-muted))]">{selectedJob.description}</span>
              {selectedJob.requirements ? (
                <>
                  <span className="text-sm font-medium text-[hsl(var(--text-muted))]">Requisitos</span>
                  <span className="text-sm leading-6 text-[hsl(var(--text-muted))]">{selectedJob.requirements}</span>
                </>
              ) : null}
              {selectedJob.responsibilities ? (
                <>
                  <span className="text-sm font-medium text-[hsl(var(--text-muted))]">Responsabilidades</span>
                  <span className="text-sm leading-6 text-[hsl(var(--text-muted))]">{selectedJob.responsibilities}</span>
                </>
              ) : null}
              {selectedJob.experience_context ? (
                <>
                  <span className="text-sm font-medium text-[hsl(var(--text-muted))]">Contexto de experiência</span>
                  <span className="text-sm leading-6 text-[hsl(var(--text-muted))]">{selectedJob.experience_context}</span>
                </>
              ) : null}
              {selectedJob.behavioral_requirements?.length ? (
                <>
                  <span className="text-sm font-medium text-[hsl(var(--text-muted))]">Comportamental</span>
                  <span className="flex flex-wrap gap-2">
                    {selectedJob.behavioral_requirements.map((item) => (
                      <StatusPill key={item} label={item} tone="neutral" />
                    ))}
                  </span>
                </>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2 border-t border-[hsl(var(--border))] px-6 py-4">
              <Button type="button" onClick={() => navigate(`/pipeline/${selectedJob.id}`)}>
                Abrir pipeline
              </Button>
            </div>

            {selectedJob.deal_breakers && selectedJob.deal_breakers.length > 0 ? (
              <>
                <div className="border-t border-[hsl(var(--border))] px-6 py-4">
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">Critérios eliminatórios</h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-[hsl(var(--border))]">
                    <thead className="bg-[hsl(var(--surface-muted))]">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">Regra</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[hsl(var(--border))] bg-[hsl(var(--surface))]">
                      {selectedJob.deal_breakers.map((db, idx) => (
                        <tr key={idx} className="hover:bg-[hsl(var(--surface-muted))]">
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-[hsl(var(--text))]">{formatDealBreakerLabel(db)}</div>
                            <div className="mt-1 text-sm text-[hsl(var(--text-muted))]">Motivo: {db.reason}</div>
                          </td>
                          <td className="px-4 py-3">
                            <StatusPill label={db.is_active ? "Ativo" : "Inativo"} tone={db.is_active ? "success" : "neutral"} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}

            <div className="border-t border-[hsl(var(--border))] px-6 py-4">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">Skills vinculadas</h4>
            </div>
            {jobSkills.length === 0 ? (
              <div className="px-6 pb-6">
                <EmptyState icon="🔧" title="Nenhuma skill vinculada" description="Adicione skills para refinar o ranking de candidatos." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[hsl(var(--border))]">
                  <thead className="bg-[hsl(var(--surface-muted))]">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">Skill</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">Obrigatória</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">Nível mín.</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">Anos mín.</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">Peso</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[hsl(var(--border))] bg-[hsl(var(--surface))]">
                    {jobSkills.map((js) => (
                      <tr key={js.id} className="hover:bg-[hsl(var(--surface-muted))]">
                        <td className="px-4 py-3 text-sm font-medium text-[hsl(var(--text))]">{js.skill_name}</td>
                        <td className="px-4 py-3">
                          <StatusPill label={js.is_mandatory ? "Obrigatória" : "Opcional"} tone={js.is_mandatory ? "warning" : "neutral"} />
                        </td>
                        <td className="px-4 py-3 text-sm text-[hsl(var(--text-muted))]">{js.minimum_level ?? "—"}</td>
                        <td className="px-4 py-3 text-sm text-[hsl(var(--text-muted))]">{js.minimum_years ?? "—"}</td>
                        <td className="px-4 py-3 text-sm text-[hsl(var(--text-muted))]">{js.weight}</td>
                        <td className="px-4 py-3 text-right">
                          <Button variant="destructive" size="sm" type="button" onClick={() => void handleRemoveSkill(js.skill_id)}>
                            Remover
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-col gap-3 border-t border-[hsl(var(--border))] px-6 py-5 lg:flex-row lg:items-center">
              <select
                value={skillToAdd}
                onChange={(e) => setSkillToAdd(e.target.value)}
                className="ui-input min-h-10 w-full rounded-md px-3 text-sm shadow-sm lg:min-w-[180px] lg:flex-1"
              >
                <option value="">Selecione uma skill…</option>
                {availableSkills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.category ? ` (${s.category})` : ""}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm text-[hsl(var(--text-muted))]">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-[hsl(var(--border-strong))] text-[hsl(var(--primary))] focus:ring-[hsl(var(--primary))]"
                  checked={isMandatory}
                  onChange={(e) => setIsMandatory(e.target.checked)}
                />
                Obrigatória
              </label>
              <Button type="button" disabled={!skillToAdd || addingSkill} onClick={() => void handleAddSkill()}>
                {addingSkill ? "Adicionando…" : "Vincular"}
              </Button>
            </div>

            {skillError ? (
              <div className="mx-6 mb-6 flex items-center gap-2 rounded-lg border border-[hsl(var(--danger))]/20 bg-[hsl(var(--danger-soft))] px-4 py-3 text-sm text-[hsl(var(--danger))]">
                <span className="font-bold">✕</span>
                <span>{skillError}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </CrudPage>
    </div>
  );
}
