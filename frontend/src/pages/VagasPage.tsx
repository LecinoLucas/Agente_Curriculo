import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Card } from "../components/common/Card";
import { EmptyState } from "../components/common/EmptyState";
import { Modal } from "../components/common/Modal";
import { PageHeader } from "../components/common/PageHeader";
import Pagination from "../components/common/Pagination";
import { SkeletonRows } from "../components/common/Skeleton";
import { StatusPill } from "../components/common/StatusPill";
import { useAsyncState } from "../hooks/useAsyncState";
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

function formatJobStatus(status: string): string {
  const labels: Record<string, string> = {
    draft: "Rascunho",
    published: "Publicada",
    paused: "Pausada",
    closed: "Encerrada",
    cancelled: "Cancelada",
  };
  return labels[status] ?? status;
}

function formatWorkModel(value: string | null | undefined): string {
  const labels: Record<string, string> = {
    remote: "Remoto",
    hybrid: "Híbrido",
    onsite: "Presencial",
  };
  return value ? (labels[value] ?? value) : "Não informado";
}

function formatSeniority(value: string | null | undefined): string {
  const labels: Record<string, string> = {
    intern: "Estagiário",
    junior: "Júnior",
    mid: "Pleno",
    senior: "Sênior",
    lead: "Lead",
    principal: "Principal",
    director: "Diretoria",
  };
  return value ? (labels[value] ?? value) : "Não informada";
}

function formatSalary(job: Job): string {
  if (job.salary_min == null && job.salary_max == null) return "Faixa não informada";
  if (job.salary_min != null && job.salary_max != null) {
    return `${job.salary_currency} ${job.salary_min.toLocaleString("pt-BR")} - ${job.salary_max.toLocaleString("pt-BR")}`;
  }
  if (job.salary_min != null) {
    return `A partir de ${job.salary_currency} ${job.salary_min.toLocaleString("pt-BR")}`;
  }
  return `Até ${job.salary_currency} ${job.salary_max?.toLocaleString("pt-BR")}`;
}

function truncateText(value: string, max = 110): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max).trim()}…`;
}

function jobStatusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "published") return "success";
  if (status === "closed" || status === "cancelled") return "danger";
  if (status === "paused") return "warning";
  return "neutral";
}

export function VagasPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data, error, loading, run } = useAsyncState<Paginated<Job>>();

  useEffect(() => {
    void run(() => listJobs(page, pageSize));
  }, [run, page, pageSize]);

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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    if (
      form.salary_min !== undefined &&
      form.salary_max !== undefined &&
      form.salary_min > form.salary_max
    ) {
      setFormError("Salário mínimo não pode ser maior que o salário máximo.");
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

  async function handleTransitionStatus(
    jobId: string,
    action: "publish" | "pause" | "close" | "cancel"
  ) {
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

  async function confirmDelete() {
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
      await skillsService.addJobSkill(selectedJob.id, {
        skill_id: skillToAdd,
        is_mandatory: isMandatory,
      });
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
  const publishedCount = items.filter((job) => job.status === "published").length;
  const draftCount = items.filter((job) => job.status === "draft").length;
  const pausedCount = items.filter((job) => job.status === "paused").length;
  const linkedSkillIds = new Set(jobSkills.map((s) => s.skill_id));
  const availableSkills = allSkills.filter((s) => !linkedSkillIds.has(s.id));

  return (
    <div className="page-grid">
      <PageHeader title="Vagas" subtitle="Painel de gestão das oportunidades e critérios de ranking" />

      <div className="stats-mini">
        <div className="stat-mini">
          <div className="stat-mini-label">Vagas na página</div>
          <div className="stat-mini-value">{items.length}</div>
        </div>
        <div className="stat-mini">
          <div className="stat-mini-label">Publicadas</div>
          <div className="stat-mini-value">{publishedCount}</div>
        </div>
        <div className="stat-mini">
          <div className="stat-mini-label">Em rascunho</div>
          <div className="stat-mini-value">{draftCount}</div>
        </div>
        <div className="stat-mini">
          <div className="stat-mini-label">Pausadas</div>
          <div className="stat-mini-value">{pausedCount}</div>
        </div>
      </div>

      {canManage ? (
        <div className="page-toolbar">
          <button className="btn" type="button" onClick={openCreateForm}>
            + Nova vaga
          </button>
        </div>
      ) : null}

      {showForm ? (
        <Modal
          title={editingJob ? "Editar vaga" : "Criar vaga"}
          onClose={() => { setShowForm(false); setEditingJob(null); setForm(EMPTY_FORM); }}
        >
          <form onSubmit={(e) => void handleCreate(e)} style={{ display: "grid", gap: 12 }}>
            <label>
              Título *
              <input
                required
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Ex: Engenheiro de Software Sênior"
              />
            </label>
            <label>
              Descrição *
              <textarea
                required
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Descreva as responsabilidades da vaga…"
              />
            </label>
            <label>
              Requisitos
              <textarea
                rows={2}
                value={form.requirements}
                onChange={(e) => setForm((f) => ({ ...f, requirements: e.target.value }))}
                placeholder="Requisitos técnicos e comportamentais…"
              />
            </label>
            <div className="form-grid-3">
              <label>
                Status
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                >
                  <option value="draft">Rascunho</option>
                  <option value="published">Publicada</option>
                  <option value="paused">Pausada</option>
                  <option value="closed">Encerrada</option>
                  <option value="cancelled">Cancelada</option>
                </select>
              </label>
              <label>
                Senioridade
                <select
                  value={form.seniority_level}
                  onChange={(e) => setForm((f) => ({ ...f, seniority_level: e.target.value }))}
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
              <label>
                Modelo de trabalho
                <select
                  value={form.work_model}
                  onChange={(e) => setForm((f) => ({ ...f, work_model: e.target.value }))}
                >
                  <option value="">—</option>
                  <option value="remote">Remoto</option>
                  <option value="hybrid">Híbrido</option>
                  <option value="onsite">Presencial</option>
                </select>
              </label>
            </div>
            <label>
              Localização
              <input
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="São Paulo - SP"
              />
            </label>
            <div className="form-grid-2">
              <label>
                Salário mínimo (BRL)
                <input
                  type="number"
                  min={0}
                  value={form.salary_min ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, salary_min: e.target.value ? Number(e.target.value) : undefined }))
                  }
                  placeholder="10000"
                />
              </label>
              <label>
                Salário máximo (BRL)
                <input
                  type="number"
                  min={0}
                  value={form.salary_max ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, salary_max: e.target.value ? Number(e.target.value) : undefined }))
                  }
                  placeholder="15000"
                />
              </label>
            </div>
            {formError ? (
              <div className="alert alert-error">
                <span className="alert-icon">✕</span>
                <span>{formError}</span>
              </div>
            ) : null}
            <div className="form-actions">
              <button
                className="btn"
                type="submit"
                disabled={saving || !form.title || !form.description}
              >
                {saving ? "Salvando…" : editingJob ? "Salvar alterações" : "Criar vaga"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { setShowForm(false); setEditingJob(null); setForm(EMPTY_FORM); }}
              >
                Cancelar
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {confirmDeleteId ? (
        <Modal title="Confirmar exclusão" onClose={() => setConfirmDeleteId(null)}>
          <p>Tem certeza que deseja excluir esta vaga? Esta ação é irreversível.</p>
          <div className="form-actions" style={{ marginTop: 12 }}>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setConfirmDeleteId(null)}
            >
              Cancelar
            </button>
            <button
              className="btn btn-danger"
              type="button"
              onClick={() => void confirmDelete()}
            >
              Excluir vaga
            </button>
          </div>
        </Modal>
      ) : null}

      <Card
        title="Vagas cadastradas"
        description="Selecione uma vaga para ver contexto completo e gerenciar as skills vinculadas"
      >
        {loading ? <SkeletonRows rows={6} /> : null}
        {error ? (
          <div className="page-error">
            <span className="page-error-icon">✕</span>
            <span>{error}</span>
          </div>
        ) : null}
        {!loading && !error && total === 0 ? (
          <EmptyState
            icon="💼"
            title="Nenhuma vaga cadastrada"
            description="Crie a primeira vaga para começar o processo de recrutamento."
            action={canManage ? { label: "+ Criar vaga", onClick: openCreateForm } : undefined}
          />
        ) : null}

        {items.length > 0 ? (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Status</th>
                  <th>Perfil</th>
                  <th>Localização e faixa</th>
                  {canManage ? <th>Ações</th> : null}
                </tr>
              </thead>
              <tbody>
                {items.map((job) => (
                  <tr
                    key={job.id}
                    onClick={() => handleSelectJob(job)}
                    className={job.id === selectedJob?.id ? "table-row-selected" : "table-row-clickable"}
                  >
                    <td>
                      <div>{job.title}</div>
                      <div className="text-muted" style={{ fontSize: 12 }}>
                        {truncateText(job.description)}
                      </div>
                    </td>
                    <td>
                      <StatusPill label={formatJobStatus(job.status)} tone={jobStatusTone(job.status)} />
                    </td>
                    <td className="text-muted">
                      {formatSeniority(job.seniority_level)} • {formatWorkModel(job.work_model)}
                    </td>
                    <td className="text-muted">
                      <div>{job.location ?? "Local não informado"}</div>
                      <div style={{ fontSize: 12 }}>{formatSalary(job)}</div>
                    </td>
                    {canManage ? (
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="actions-cell">
                          <button
                            className="btn btn-sm"
                            type="button"
                            onClick={() => navigate(`/vagas/${job.id}`)}
                          >
                            Detalhes
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            type="button"
                            onClick={() => {
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
                            }}
                          >
                            Editar
                          </button>
                          {job.status === "draft" ? (
                            <button
                              className="btn btn-sm"
                              type="button"
                              disabled={transitioning === job.id}
                              onClick={() => void handleTransitionStatus(job.id, "publish")}
                            >
                              Publicar
                            </button>
                          ) : null}
                          {job.status === "published" ? (
                            <>
                              <button
                                className="btn btn-secondary btn-sm"
                                type="button"
                                disabled={transitioning === job.id}
                                onClick={() => void handleTransitionStatus(job.id, "pause")}
                              >
                                Pausar
                              </button>
                              <button
                                className="btn btn-secondary btn-sm"
                                type="button"
                                disabled={transitioning === job.id}
                                onClick={() => void handleTransitionStatus(job.id, "close")}
                              >
                                Fechar
                              </button>
                            </>
                          ) : null}
                          {job.status === "paused" ? (
                            <>
                              <button
                                className="btn btn-sm"
                                type="button"
                                disabled={transitioning === job.id}
                                onClick={() => void handleTransitionStatus(job.id, "publish")}
                              >
                                Republicar
                              </button>
                              <button
                                className="btn btn-secondary btn-sm"
                                type="button"
                                disabled={transitioning === job.id}
                                onClick={() => void handleTransitionStatus(job.id, "close")}
                              >
                                Fechar
                              </button>
                            </>
                          ) : null}
                          <button
                            className="btn btn-danger btn-sm"
                            type="button"
                            onClick={() => setConfirmDeleteId(job.id)}
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="table-footer">
              <span className="pagination-summary">Mostrando {start}–{end} de {total}</span>
              <Pagination
                page={page}
                totalPages={totalPages}
                onPageChange={(p) => setPage(p)}
                pageSize={pageSize}
                onPageSizeChange={(s) => setPageSize(s)}
                total={total}
              />
            </div>
          </>
        ) : null}
      </Card>

      {selectedJob && canManage ? (
        <Card
          title={selectedJob.title}
          description="Resumo da vaga e gestão das skills obrigatórias e opcionais"
        >
          <div className="info-grid" style={{ marginBottom: 16 }}>
            <div className="info-row">
              <span className="info-label">Status</span>
              <span className="info-value">
                <StatusPill label={formatJobStatus(selectedJob.status)} tone={jobStatusTone(selectedJob.status)} />
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">Perfil esperado</span>
              <span className="info-value">
                {formatSeniority(selectedJob.seniority_level)} • {formatWorkModel(selectedJob.work_model)}
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">Localização</span>
              <span className="info-value">{selectedJob.location ?? "Não informada"}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Faixa salarial</span>
              <span className="info-value">{formatSalary(selectedJob)}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Descrição</span>
              <span className="info-value">{selectedJob.description}</span>
            </div>
            {selectedJob.requirements ? (
              <div className="info-row">
                <span className="info-label">Requisitos</span>
                <span className="info-value">{selectedJob.requirements}</span>
              </div>
            ) : null}
          </div>

          <h4 className="section-title">Skills vinculadas</h4>
          {jobSkills.length === 0 ? (
            <EmptyState icon="🔧" title="Nenhuma skill vinculada" description="Adicione skills para refinar o ranking de candidatos." />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Skill</th>
                  <th>Obrigatória</th>
                  <th>Nível mínimo</th>
                  <th>Anos mín.</th>
                  <th>Peso</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {jobSkills.map((js) => (
                  <tr key={js.id}>
                    <td>{js.skill_name}</td>
                    <td>
                      <StatusPill
                        label={js.is_mandatory ? "Obrigatória" : "Opcional"}
                        tone={js.is_mandatory ? "warning" : "neutral"}
                      />
                    </td>
                    <td className="text-muted">{js.minimum_level ?? "—"}</td>
                    <td className="text-muted">{js.minimum_years ?? "—"}</td>
                    <td className="text-muted">{js.weight}</td>
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        type="button"
                        onClick={() => void handleRemoveSkill(js.skill_id)}
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="filters-row" style={{ marginTop: 16 }}>
            <div className="filter-group" style={{ flex: 1, minWidth: 200 }}>
              <label>Adicionar skill</label>
              <select value={skillToAdd} onChange={(e) => setSkillToAdd(e.target.value)}>
                <option value="">Selecione uma skill…</option>
                {availableSkills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.category ? ` (${s.category})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", paddingBottom: 10 }}>
              <input
                type="checkbox"
                style={{ width: "auto", margin: 0 }}
                checked={isMandatory}
                onChange={(e) => setIsMandatory(e.target.checked)}
              />
              Obrigatória
            </label>
            <button
              className="btn"
              type="button"
              disabled={!skillToAdd || addingSkill}
              onClick={() => void handleAddSkill()}
            >
              {addingSkill ? "Adicionando…" : "Vincular"}
            </button>
          </div>

          {skillError ? (
            <div className="page-error" style={{ marginTop: 8 }}>
              <span className="page-error-icon">✕</span>
              <span>{skillError}</span>
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
