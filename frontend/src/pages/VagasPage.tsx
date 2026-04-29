import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { CrudPage } from "../components/common/CrudPage";
import { ActionMenu } from "../components/common/ActionMenu";
import type { ActionMenuItem } from "../components/common/ActionMenu";
import { EmptyState } from "../components/common/EmptyState";
import { Modal } from "../components/common/Modal";
import { PageHeader } from "../components/common/PageHeader";
import Pagination from "../components/common/Pagination";
import { StatusPill } from "../components/common/StatusPill";
import { useAsyncState } from "../hooks/useAsyncState";
import { useJobConfigurationAlerts } from "../hooks/useJobConfigurationAlerts";
import { JobConfigurationPreview } from "../components/job/JobConfigurationPreview";
import { Button } from "@/components/ui/button";
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
  type CreateJobRequestPayload,
  type UpdateJobRequestPayload,
} from "../services/jobsService";
import { skillsService } from "../services/skillsService";
import { toast } from "../services/toast";
import { Job, JobSkill, Skill, DealBreaker } from "../types/domain";
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
  status: string;
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

const EMPTY_FORM: JobFormValues = {
  title: "",
  description: "",
  requirements: "",
  status: "draft",
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
  status: "draft",
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
  };

  const requirements = trimToNull(form.requirements);
  const seniorityLevel = trimToNull(form.seniority_level);
  const minimumEducationLevel = trimToNull(form.minimum_education_level);
  const workModel = trimToNull(form.work_model);
  const location = trimToNull(form.location);

  if (requirements) payload.requirements = requirements;
  if (seniorityLevel) payload.seniority_level = seniorityLevel;
  if (minimumEducationLevel) payload.minimum_education_level = minimumEducationLevel;
  if (form.minimum_years_experience !== undefined) payload.minimum_years_experience = form.minimum_years_experience;
  if ((form.deal_breakers ?? []).length > 0) payload.deal_breakers = form.deal_breakers;
  if (workModel) payload.work_model = workModel;
  if (location) payload.location = location;
  if (form.salary_min !== undefined) payload.salary_min = form.salary_min;
  if (form.salary_max !== undefined) payload.salary_max = form.salary_max;

  return payload;
}

function buildUpdateJobPayload(form: JobFormValues): UpdateJobRequestPayload {
  return {
    title: form.title,
    description: form.description,
    status: form.status,
    requirements: trimToNull(form.requirements),
    seniority_level: trimToNull(form.seniority_level),
    minimum_education_level: trimToNull(form.minimum_education_level),
    minimum_years_experience: form.minimum_years_experience ?? null,
    deal_breakers: form.deal_breakers ?? [],
    work_model: trimToNull(form.work_model),
    location: trimToNull(form.location),
    salary_min: form.salary_min ?? null,
    salary_max: form.salary_max ?? null,
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

  const [newDealBreaker, setNewDealBreaker] = useState<Partial<DealBreaker>>({
    field: "",
    operator: "equals",
    value: "",
    reason: "",
    is_active: true,
  });
  const [dealBreakerError, setDealBreakerError] = useState<string | null>(null);

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

  function openCreateForm() {
    setEditingJob(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
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
    setShowForm(true);
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
        toast.success(`Vaga criada: ${created.title}`);
      }
      setForm(EMPTY_FORM);
      setEditingJob(null);
      setShowForm(false);
      setPage(1);
      void run(() => listJobs(1, pageSize));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Falha ao salvar vaga");
    } finally {
      setSaving(false);
    }
  }

  async function handleTransition(jobId: string, action: "publish" | "pause" | "close" | "cancel") {
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
      toast.error(err instanceof Error ? err.message : `Falha ao executar ação "${action}"`);
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
      toast.error(err instanceof Error ? err.message : "Falha ao excluir vaga");
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
    } catch {
      setJobSkills([]);
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
      setSkillError(err instanceof Error ? err.message : "Falha ao vincular skill");
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
      setSkillError(err instanceof Error ? err.message : "Falha ao remover skill");
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
          onClose={() => { setShowForm(false); setEditingJob(null); setForm(EMPTY_FORM); }}
          contentClassName="flex w-full max-w-[800px] max-h-[90vh] overflow-hidden p-0"
        >
          <form onSubmit={(e) => void handleSave(e)} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex flex-col gap-6">
                <ConfigurationPreviewSection form={form} editingJob={editingJob} />

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
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-[hsl(var(--text))]">
                      Requisitos
                      <textarea
                        rows={3}
                        value={form.requirements}
                        onChange={(e) => setForm((f) => ({ ...f, requirements: e.target.value }))}
                        placeholder="Requisitos técnicos e comportamentais…"
                        className="ui-input min-h-24 rounded-md px-3 py-2 text-sm"
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
                        onChange={(e) => setNewDealBreaker((db) => ({ ...db, field: e.target.value as any, operator: "equals" }))}
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
        columns={["Título", "Status", "Perfil", "Localização / Faixa", ...(canManage ? ["Ações"] : [])]}
        items={items}
        renderRow={(job) => (
          (() => {
            const actionItems: ActionMenuItem[] = [
              {
                label: "Editar",
                onClick: () => {
                  setEditingJob(job);
                  setForm({
                    title: job.title,
                    description: job.description,
                    requirements: job.requirements ?? "",
                    status: job.status,
                    seniority_level: job.seniority_level ?? "",
                    minimum_education_level: job.minimum_education_level ?? "",
                    minimum_years_experience: job.minimum_years_experience ?? undefined,
                    deal_breakers: job.deal_breakers ?? [],
                    work_model: job.work_model ?? "",
                    location: job.location ?? "",
                    salary_min: job.salary_min ?? undefined,
                    salary_max: job.salary_max ?? undefined,
                  });
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
                  job.id === selectedJob?.id ? "bg-[hsl(var(--accent-soft))]" : "even:bg-[hsl(var(--surface-muted))]/70 hover:bg-[hsl(var(--surface-muted))]",
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
                    {rankingFreshnessByJobId[job.id]?.isStale ? (
                      <div className="text-xs text-[hsl(var(--warning))]">Será recalculado automaticamente.</div>
                    ) : null}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 align-top">
                  <StatusPill label={formatJobStatus(job.status)} tone={jobStatusTone(job.status)} />
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
              <span className="text-sm text-muted-foreground">Mostrando {start}–{end} de {total}</span>
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
          <div className="ui-card overflow-hidden rounded-xl shadow-sm">
            <div className="border-b border-[hsl(var(--border))] px-6 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold text-[hsl(var(--text))]">{selectedJob.title}</h3>
                {rankingFreshnessByJobId[selectedJob.id]?.isStale ? (
                  <StatusPill label="Ranking desatualizado" tone="warning" />
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
