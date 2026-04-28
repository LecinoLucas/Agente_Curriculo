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
import { Button } from "@/components/ui/button";
import {
  listJobs,
  createJob,
  updateJob,
  deleteJob,
  publishJob,
  pauseJob,
  closeJob,
  cancelJob,
} from "../services/jobsService";
import { skillsService } from "../services/skillsService";
import { toast } from "../services/toast";
import { Job, JobSkill, Skill } from "../types/domain";
import { Paginated } from "../types/api";
import { useAuth } from "../features/auth/useAuth";
import {
  formatJobStatus,
  formatSeniority,
  formatWorkModel,
  jobStatusTone,
} from "../utils/jobFormatters";

type CreateJobPayload = {
  title: string;
  description: string;
  requirements?: string;
  status: string;
  seniority_level?: string;
  work_model?: string;
  location?: string;
  salary_min?: number;
  salary_max?: number;
};

const EMPTY_FORM: CreateJobPayload = {
  title: "",
  description: "",
  requirements: "",
  status: "draft",
  seniority_level: "",
  work_model: "",
  location: "",
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

export function VagasPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const { data, error, loading, run } = useAsyncState<Paginated<Job>>();

  useEffect(() => { void run(() => listJobs(page, pageSize)); }, [run, page, pageSize]);
  useEffect(() => { setPage(1); }, [pageSize]);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateJobPayload>(EMPTY_FORM);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState<string | null>(null);

  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [jobSkills, setJobSkills] = useState<JobSkill[]>([]);
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [skillToAdd, setSkillToAdd] = useState("");
  const [isMandatory, setIsMandatory] = useState(false);
  const [addingSkill, setAddingSkill] = useState(false);
  const [skillError, setSkillError] = useState<string | null>(null);

  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "recruiter";

  function openCreateForm() {
    setEditingJob(null);
    setForm(EMPTY_FORM);
    setFormError(null);
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
      const payload: Record<string, unknown> = {
        title: form.title,
        description: form.description,
        status: form.status,
      };
      if (form.requirements) payload.requirements = form.requirements;
      if (form.seniority_level) payload.seniority_level = form.seniority_level;
      if (form.work_model) payload.work_model = form.work_model;
      if (form.location) payload.location = form.location;
      if (form.salary_min) payload.salary_min = form.salary_min;
      if (form.salary_max) payload.salary_max = form.salary_max;

      if (editingJob) {
        const updated = await updateJob(editingJob.id, payload);
        toast.success(`Vaga atualizada: ${updated.title}`);
      } else {
        const created = await createJob(payload);
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
      await fns[action](jobId);
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
      />

      {showForm ? (
        <Modal
          title={editingJob ? "Editar vaga" : "Criar vaga"}
          onClose={() => { setShowForm(false); setEditingJob(null); setForm(EMPTY_FORM); }}
        >
          <form onSubmit={(e) => void handleSave(e)} className="flex flex-col gap-4">
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
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Descreva as responsabilidades da vaga…"
                className="ui-input min-h-24 rounded-md px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-[hsl(var(--text))]">
              Requisitos
              <textarea
                rows={2}
                value={form.requirements}
                onChange={(e) => setForm((f) => ({ ...f, requirements: e.target.value }))}
                placeholder="Requisitos técnicos e comportamentais…"
                className="ui-input min-h-20 rounded-md px-3 py-2 text-sm"
              />
            </label>
            <div className="grid gap-3 md:grid-cols-3">
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
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-[hsl(var(--text))]">
              Localização
              <input
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="São Paulo - SP"
                className="ui-input h-10 rounded-md px-3 text-sm"
              />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
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
            {formError ? (
              <div className="flex items-start gap-2 rounded-lg border border-[hsl(var(--danger))]/20 bg-[hsl(var(--danger-soft))] px-4 py-3 text-sm text-[hsl(var(--danger))]">
                <span className="font-bold">✕</span>
                <span>{formError}</span>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button type="submit" disabled={saving || !form.title || !form.description}>
                {saving ? "Salvando…" : editingJob ? "Salvar alterações" : "Criar vaga"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => { setShowForm(false); setEditingJob(null); setForm(EMPTY_FORM); }}
              >
                Cancelar
              </Button>
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
                    <div className="font-semibold text-[hsl(var(--text))]">{job.title}</div>
                    <div className="text-sm leading-5 text-[hsl(var(--text-muted))]">{truncate(job.description, 140)}</div>
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
              <h3 className="text-lg font-semibold text-[hsl(var(--text))]">{selectedJob.title}</h3>
            </div>

            <div className="grid gap-4 px-6 py-5 md:grid-cols-[160px_1fr] md:gap-x-6">
              <span className="text-sm font-medium text-[hsl(var(--text-muted))]">Status</span>
              <span>
                <StatusPill label={formatJobStatus(selectedJob.status)} tone={jobStatusTone(selectedJob.status)} />
              </span>
              <span className="text-sm font-medium text-[hsl(var(--text-muted))]">Perfil</span>
              <span className="text-sm text-[hsl(var(--text-muted))]">{formatSeniority(selectedJob.seniority_level)} · {formatWorkModel(selectedJob.work_model)}</span>
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
