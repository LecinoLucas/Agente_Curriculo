import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ActionMenu } from "../components/common/ActionMenu";
import { CrudPage } from "../components/common/CrudPage";
import { EmptyState } from "../components/common/EmptyState";
import { Modal } from "../components/common/Modal";
import { PageHeader } from "../components/common/PageHeader";
import Pagination from "../components/common/Pagination";
import { SkeletonRows } from "../components/common/Skeleton";
import { StatusPill } from "../components/common/StatusPill";
import { candidatesService, CreateCandidatePayload } from "../services/candidatesService";
import { toast } from "../services/toast";
import { Candidate, CandidateOverview } from "../types/domain";
import { Paginated } from "../types/api";
import { Button } from "@/components/ui/button";

const EMPTY_FORM: CreateCandidatePayload = {
  full_name: "",
  email: "",
  phone: "",
  location_city: "",
  location_state: "",
  location_country: "BR",
  linkedin_url: "",
  github_url: "",
  portfolio_url: "",
  internal_notes: "",
  tags: [],
};

function formatScore(score: number): string {
  return score > 1 ? `${Math.round(score)}%` : `${Math.round(score * 100)}%`;
}

function splitCandidateNotes(notes: string | null | undefined) {
  const rawNotes = (notes ?? "").trim();
  if (!rawNotes) return { autoNotes: [] as string[], manualNotes: "" };

  const lines = rawNotes.split("\n").map((l) => l.trim()).filter(Boolean);
  const autoNotes = lines
    .filter((l) => l.startsWith("[AUTO-PRECADASTRO]"))
    .map((l) => l.replace("[AUTO-PRECADASTRO]", "").trim());
  const manualNotes = lines.filter((l) => !l.startsWith("[AUTO-PRECADASTRO]")).join("\n");

  return { autoNotes, manualNotes };
}

export function CandidatosPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [data, setData] = useState<Paginated<Candidate> | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateCandidatePayload>(EMPTY_FORM);
  const [tagsInput, setTagsInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);

  const [selected, setSelected] = useState<Candidate | null>(null);
  const [selectedOverview, setSelectedOverview] = useState<CandidateOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      setData(await candidatesService.list(page, pageSize, search || undefined));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Falha ao carregar candidatos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [page, pageSize, search]);

  useEffect(() => {
    if (!selected) {
      setSelectedOverview(null);
      setOverviewError(null);
      setOverviewLoading(false);
      return;
    }
    let active = true;
    setOverviewLoading(true);
    setOverviewError(null);
    void candidatesService
      .getOverview(selected.id)
      .then((overview) => { if (active) setSelectedOverview(overview); })
      .catch((err) => {
        if (active) {
          setSelectedOverview(null);
          setOverviewError(err instanceof Error ? err.message : "Falha ao carregar perfil");
        }
      })
      .finally(() => { if (active) setOverviewLoading(false); });
    return () => { active = false; };
  }, [selected]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  }

  function openCreateForm() {
    setEditingCandidate(null);
    setForm(EMPTY_FORM);
    setTagsInput("");
    setFormErrors({});
    setSaveError(null);
    setShowForm(true);
  }

  function openEditForm(c: Candidate) {
    setEditingCandidate(c);
    setForm({
      full_name: c.full_name,
      email: c.email ?? "",
      phone: c.phone ?? "",
      location_city: c.location_city ?? "",
      location_state: c.location_state ?? "",
      location_country: c.location_country ?? "BR",
      linkedin_url: c.linkedin_url ?? "",
      github_url: c.github_url ?? "",
      portfolio_url: c.portfolio_url ?? "",
      internal_notes: c.internal_notes ?? "",
      tags: c.tags ?? [],
    });
    setTagsInput((c.tags ?? []).join(", "));
    setFormErrors({});
    setSaveError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingCandidate(null);
    setForm(EMPTY_FORM);
    setTagsInput("");
    setFormErrors({});
    setSaveError(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    const errors: Record<string, string> = {};
    if (!form.full_name?.trim()) errors.full_name = "Nome completo é obrigatório";
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) errors.email = "E-mail inválido";
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      const payload: CreateCandidatePayload = {
        ...form,
        email: form.email || undefined,
        phone: form.phone || undefined,
        location_city: form.location_city || undefined,
        location_state: form.location_state || undefined,
        linkedin_url: form.linkedin_url || undefined,
        github_url: form.github_url || undefined,
        portfolio_url: form.portfolio_url || undefined,
        internal_notes: form.internal_notes || undefined,
        tags: tagsInput ? tagsInput.split(",").map((t) => t.trim()).filter(Boolean) : [],
      };
      if (editingCandidate) {
        const updated = await candidatesService.update(editingCandidate.id, payload);
        toast.success(`Candidato atualizado: ${updated.full_name}`);
      } else {
        const created = await candidatesService.create(payload);
        toast.success(`Candidato criado: ${created.full_name}`);
      }
      closeForm();
      setPage(1);
      await load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Falha ao salvar candidato");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Excluir este candidato?")) return;
    try {
      await candidatesService.delete(id);
      toast.success("Candidato excluído");
      if (selected?.id === id) setSelected(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao excluir candidato");
    }
  }

  const total = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;
  const items = data?.data ?? [];
  const candidateNotes = splitCandidateNotes(selectedOverview?.candidate.internal_notes);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 pb-12">
      <PageHeader
        title="Candidatos"
        subtitle="Gestão dos candidatos cadastrados"
        actions={
          <Button variant="outline" onClick={() => navigate("/ranking")}>
            Ver ranking
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Candidatos</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{total}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Página atual</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{page}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Resultados</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{items.length}</div>
        </div>
      </div>

      {showForm ? (
        <Modal
          title={editingCandidate ? "Editar candidato" : "Cadastrar candidato"}
          onClose={closeForm}
        >
          <form onSubmit={(e) => void handleSave(e)} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900">
              Nome completo *
              <input
                required
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                placeholder="Nome completo"
                className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              {formErrors.full_name ? <span className="text-xs text-red-600">{formErrors.full_name}</span> : null}
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900">
              E-mail
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="email@exemplo.com"
                className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              {formErrors.email ? <span className="text-xs text-red-600">{formErrors.email}</span> : null}
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900">
              Telefone
              <input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+55 11 91234-5678"
                className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900">
                Cidade
                <input
                  value={form.location_city}
                  onChange={(e) => setForm((f) => ({ ...f, location_city: e.target.value }))}
                  placeholder="São Paulo"
                  className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900">
                Estado
                <input
                  value={form.location_state}
                  onChange={(e) => setForm((f) => ({ ...f, location_state: e.target.value }))}
                  placeholder="SP"
                  className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900">
              LinkedIn URL
              <input
                value={form.linkedin_url}
                onChange={(e) => setForm((f) => ({ ...f, linkedin_url: e.target.value }))}
                placeholder="https://linkedin.com/in/…"
                className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900">
              GitHub URL
              <input
                value={form.github_url}
                onChange={(e) => setForm((f) => ({ ...f, github_url: e.target.value }))}
                placeholder="https://github.com/…"
                className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900">
              Portfolio URL
              <input
                value={form.portfolio_url}
                onChange={(e) => setForm((f) => ({ ...f, portfolio_url: e.target.value }))}
                placeholder="https://portfolio.exemplo.com"
                className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900">
              Notas internas
              <textarea
                rows={2}
                value={form.internal_notes}
                onChange={(e) => setForm((f) => ({ ...f, internal_notes: e.target.value }))}
                placeholder="Observações internas sobre o candidato…"
                className="min-h-20 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900">
              Tags (separadas por vírgula)
              <input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="python, backend, senior"
                className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </label>
            {saveError ? (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <span className="font-bold">✕</span>
                <span>{saveError}</span>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando…" : editingCandidate ? "Salvar alterações" : "Salvar candidato"}
              </Button>
              <Button type="button" variant="outline" onClick={closeForm}>Cancelar</Button>
            </div>
          </form>
        </Modal>
      ) : null}

      <CrudPage<Candidate>
        onNew={openCreateForm}
        newLabel="Novo candidato"
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        onSearchSubmit={handleSearchSubmit}
        onSearchClear={search ? () => { setSearch(""); setSearchInput(""); setPage(1); } : undefined}
        searchPlaceholder="Buscar por nome ou e-mail…"
        loading={loading}
        error={loadError}
        count={total}
        isEmpty={!loading && !loadError && total === 0}
        emptyIcon="👤"
        emptyTitle="Nenhum candidato encontrado"
        emptyDescription={search ? `Nenhum resultado para "${search}".` : "Adicione o primeiro candidato para começar."}
        emptyAction={
          search
            ? { label: "Limpar busca", onClick: () => { setSearch(""); setSearchInput(""); } }
            : { label: "+ Novo candidato", onClick: openCreateForm }
        }
        columns={["Nome", "E-mail", "Localização", "Cadastrado em", "Ações"]}
        items={items}
        renderRow={(c) => (
          <tr
            key={c.id}
            className={[
              "border-b border-gray-200 transition-colors",
              c.id === selected?.id ? "bg-blue-50/70" : "even:bg-gray-50/50 hover:bg-gray-100",
            ].join(" ")}
            onClick={() => setSelected(c.id === selected?.id ? null : c)}
          >
            <td className="px-4 py-3">
              <div className="font-semibold text-gray-900">{c.full_name}</div>
            </td>
            <td className="px-4 py-3 text-sm text-gray-700">{c.email ?? "—"}</td>
            <td className="px-4 py-3 text-sm text-gray-700">
              {[c.location_city, c.location_state].filter(Boolean).join(", ") || "—"}
            </td>
            <td className="px-4 py-3 text-sm text-gray-700">{new Date(c.created_at).toLocaleDateString("pt-BR")}</td>
            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-end gap-2">
                <ActionMenu
                  buttonLabel={`Ações de ${c.full_name}`}
                  items={[
                    { label: "Editar", onClick: () => openEditForm(c) },
                    { label: "Excluir", tone: "danger", onClick: () => void handleDelete(c.id) },
                  ]}
                />
              </div>
            </td>
          </tr>
        )}
        footer={
          total > 0 ? (
            <>
              <span className="text-sm text-gray-500">
                {total} candidato{total !== 1 ? "s" : ""}
              </span>
              <Pagination
                page={page}
                totalPages={totalPages}
                onPageChange={(p) => setPage(p)}
                pageSize={pageSize}
                onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
                total={total}
              />
            </>
          ) : undefined
        }
      >
        {selected ? (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">{selected.full_name}</h3>
              <p className="text-sm text-gray-500">Perfil consolidado · ID: {selected.id.slice(0, 8)}…</p>
            </div>

            {overviewLoading ? <SkeletonRows rows={4} /> : null}

            {overviewError ? (
              <div className="flex items-start gap-2 px-6 py-4 text-sm text-red-600">
                <span className="font-bold">✕</span>
                <span>{overviewError}</span>
              </div>
            ) : null}

            {!overviewLoading && !overviewError && selectedOverview ? (
              <div className="px-6 py-5 space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">E-mail</div>
                    <div className="text-sm text-gray-900">{selectedOverview.candidate.email ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Telefone</div>
                    <div className="text-sm text-gray-700">{selectedOverview.candidate.phone ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Localização</div>
                    <div className="text-sm text-gray-700">
                      {[
                        selectedOverview.candidate.location_city,
                        selectedOverview.candidate.location_state,
                        selectedOverview.candidate.location_country,
                      ].filter(Boolean).join(", ") || "—"}
                    </div>
                  </div>
                  {(selectedOverview.candidate.linkedin_url ||
                    selectedOverview.candidate.github_url ||
                    selectedOverview.candidate.portfolio_url) ? (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Links</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                          {selectedOverview.candidate.linkedin_url ? (
                            <a className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-gray-100" href={selectedOverview.candidate.linkedin_url} target="_blank" rel="noreferrer">
                              LinkedIn
                            </a>
                          ) : null}
                          {selectedOverview.candidate.github_url ? (
                            <a className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-gray-100" href={selectedOverview.candidate.github_url} target="_blank" rel="noreferrer">
                              GitHub
                            </a>
                          ) : null}
                          {selectedOverview.candidate.portfolio_url ? (
                            <a className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-gray-100" href={selectedOverview.candidate.portfolio_url} target="_blank" rel="noreferrer">
                              Portfolio
                            </a>
                          ) : null}
                      </div>
                    </div>
                  ) : null}
                  {selectedOverview.candidate.tags.length > 0 ? (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Tags</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                          {selectedOverview.candidate.tags.map((tag) => (
                            <span key={tag} className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">{tag}</span>
                          ))}
                      </div>
                    </div>
                  ) : null}
                  {candidateNotes.manualNotes ? (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Notas</div>
                      <div className="text-sm text-gray-700 whitespace-pre-line">{candidateNotes.manualNotes}</div>
                    </div>
                  ) : null}
                </div>

                {candidateNotes.autoNotes.length > 0 ? (
                  <>
                    <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Dados detectados do currículo</h4>
                    <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                      <span className="font-bold">✓</span>
                      <span>Pré-cadastro automático a partir do currículo enviado.</span>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      {candidateNotes.autoNotes.map((note) => (
                        <div key={note} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Detecção</div>
                          <div className="mt-1 text-sm text-gray-700">{note}</div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}

                {selectedOverview.latest_analysis ? (
                  <>
                    <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Última análise</h4>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Currículo</div>
                        <div className="text-sm text-gray-900">{selectedOverview.latest_analysis.resume_title}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Senioridade</div>
                        <div className="text-sm text-gray-700">{selectedOverview.latest_analysis.seniority_level ?? "—"}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Experiência</div>
                        <div className="text-sm text-gray-700">
                          {selectedOverview.latest_analysis.total_experience_years != null
                            ? `${selectedOverview.latest_analysis.total_experience_years} anos`
                            : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Score geral</div>
                        <div className="text-sm text-gray-700">
                          {selectedOverview.latest_analysis.overall_score != null
                            ? formatScore(selectedOverview.latest_analysis.overall_score)
                            : "—"}
                        </div>
                      </div>
                      {selectedOverview.latest_analysis_pipeline ? (
                        <>
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Ranking</div>
                            <div className="mt-2">
                              <StatusPill
                                label={selectedOverview.latest_analysis_pipeline.matching_status}
                                tone={
                                  selectedOverview.latest_analysis_pipeline.matching_status === "completed" ||
                                  selectedOverview.latest_analysis_pipeline.matching_status === "idle"
                                    ? "success"
                                    : selectedOverview.latest_analysis_pipeline.matching_status === "blocked"
                                      ? "danger"
                                    : "warning"
                                }
                              />
                            </div>
                          </div>
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Matches prontos</div>
                            <div className="text-sm text-gray-700">{selectedOverview.latest_analysis_pipeline.matched_jobs_count}</div>
                          </div>
                        </>
                      ) : null}
                    </div>
                  </>
                ) : null}

                <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Currículos</h4>
                {selectedOverview.resumes.length === 0 ? (
                  <EmptyState icon="📄" title="Nenhum currículo associado" />
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Título</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Arquivo</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Extração</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Atualizado em</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                      {selectedOverview.resumes.map((resume) => (
                        <tr key={resume.resume_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            {resume.title} <span className="text-gray-500">v{resume.current_version}</span>
                          </td>
                          <td className="px-4 py-3">
                            <StatusPill
                              label={resume.status}
                              tone={resume.status === "active" ? "success" : "neutral"}
                            />
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">{resume.current_file_name ?? "—"}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{resume.extraction_status ?? "—"}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{new Date(resume.updated_at).toLocaleString("pt-BR")}</td>
                        </tr>
                      ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Top vagas</h4>
                {selectedOverview.top_matches.length === 0 ? (
                  <EmptyState icon="🎯" title="Nenhum match registrado" />
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Vaga</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Match</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Recomendação</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                      {selectedOverview.top_matches.map((match) => (
                        <tr key={`${match.analysis_id}-${match.job_id}`} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{match.job_title}</td>
                          <td className="px-4 py-3">
                            <StatusPill
                              label={match.job_status}
                              tone={
                                match.job_status === "published" ? "success"
                                : match.job_status === "closed" ? "danger"
                                : "warning"
                              }
                            />
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">{match.match_score != null ? formatScore(match.match_score) : "—"}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{match.recommendation ?? "—"}</td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigate(`/ranking?jobId=${match.job_id}`)}
                            >
                              Ranking
                            </Button>
                          </td>
                        </tr>
                      ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </CrudPage>
    </div>
  );
}
