import { useEffect, useState } from "react";

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
  if (!rawNotes) {
    return { autoNotes: [] as string[], manualNotes: "" };
  }

  const lines = rawNotes
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const autoNotes = lines
    .filter((line) => line.startsWith("[AUTO-PRECADASTRO]"))
    .map((line) => line.replace("[AUTO-PRECADASTRO]", "").trim());

  const manualNotes = lines
    .filter((line) => !line.startsWith("[AUTO-PRECADASTRO]"))
    .join("\n");

  return { autoNotes, manualNotes };
}

export function CandidatosPage() {
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

  const [selected, setSelected] = useState<Candidate | null>(null);
  const [selectedOverview, setSelectedOverview] = useState<CandidateOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);

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
    <div className="page-grid">
      <PageHeader title="Candidatos" subtitle="Gestão dos candidatos cadastrados" />

      <div className="page-toolbar">
        <form className="search-form" onSubmit={handleSearchSubmit}>
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por nome ou e-mail…"
          />
          <button className="btn" type="submit">Buscar</button>
          {search ? (
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => { setSearch(""); setSearchInput(""); setPage(1); }}
            >
              Limpar
            </button>
          ) : null}
        </form>
        <button className="btn" type="button" onClick={openCreateForm}>
          + Novo candidato
        </button>
      </div>

      {showForm ? (
        <Modal
          title={editingCandidate ? "Editar candidato" : "Cadastrar candidato"}
          onClose={closeForm}
        >
          <form onSubmit={(e) => void handleSave(e)} style={{ display: "grid", gap: 12 }}>
            <label>
              Nome completo *
              <input
                required
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                placeholder="Nome completo"
              />
              {formErrors.full_name ? <span className="field-error">{formErrors.full_name}</span> : null}
            </label>
            <label>
              E-mail
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="email@exemplo.com"
              />
              {formErrors.email ? <span className="field-error">{formErrors.email}</span> : null}
            </label>
            <label>
              Telefone
              <input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+55 11 91234-5678"
              />
            </label>
            <div className="form-grid-2">
              <label>
                Cidade
                <input
                  value={form.location_city}
                  onChange={(e) => setForm((f) => ({ ...f, location_city: e.target.value }))}
                  placeholder="São Paulo"
                />
              </label>
              <label>
                Estado
                <input
                  value={form.location_state}
                  onChange={(e) => setForm((f) => ({ ...f, location_state: e.target.value }))}
                  placeholder="SP"
                />
              </label>
            </div>
            <label>
              LinkedIn URL
              <input
                value={form.linkedin_url}
                onChange={(e) => setForm((f) => ({ ...f, linkedin_url: e.target.value }))}
                placeholder="https://linkedin.com/in/…"
              />
            </label>
            <label>
              GitHub URL
              <input
                value={form.github_url}
                onChange={(e) => setForm((f) => ({ ...f, github_url: e.target.value }))}
                placeholder="https://github.com/…"
              />
            </label>
            <label>
              Portfolio URL
              <input
                value={form.portfolio_url}
                onChange={(e) => setForm((f) => ({ ...f, portfolio_url: e.target.value }))}
                placeholder="https://portfolio.exemplo.com"
              />
            </label>
            <label>
              Notas internas
              <textarea
                rows={2}
                value={form.internal_notes}
                onChange={(e) => setForm((f) => ({ ...f, internal_notes: e.target.value }))}
                placeholder="Observações internas sobre o candidato…"
              />
            </label>
            <label>
              Tags (separadas por vírgula)
              <input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="python, backend, senior"
              />
            </label>
            {saveError ? (
              <div className="alert alert-error">
                <span className="alert-icon">✕</span>
                <span>{saveError}</span>
              </div>
            ) : null}
            <div className="form-actions">
              <button className="btn" type="submit" disabled={saving}>
                {saving ? "Salvando…" : editingCandidate ? "Salvar alterações" : "Salvar candidato"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={closeForm}>Cancelar</button>
            </div>
          </form>
        </Modal>
      ) : null}

      <div className="card">
        <div className="card-header">
          <h3>
            Candidatos{" "}
            {total > 0 ? <span className="text-muted">({total})</span> : null}
          </h3>
        </div>

        {loading ? <SkeletonRows rows={8} /> : null}

        {loadError ? (
          <div className="page-error">
            <span className="page-error-icon">✕</span>
            <span>{loadError}</span>
          </div>
        ) : null}

        {!loading && !loadError && total === 0 ? (
          <EmptyState
            icon="👤"
            title="Nenhum candidato encontrado"
            description={search ? `Nenhum resultado para "${search}".` : "Adicione o primeiro candidato para começar."}
            action={search ? { label: "Limpar busca", onClick: () => { setSearch(""); setSearchInput(""); } } : { label: "+ Novo candidato", onClick: openCreateForm }}
          />
        ) : null}

        {items.length > 0 ? (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Localização</th>
                  <th>Cadastrado em</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr
                    key={c.id}
                    className={c.id === selected?.id ? "table-row-selected" : "table-row-clickable"}
                    onClick={() => setSelected(c.id === selected?.id ? null : c)}
                  >
                    <td>{c.full_name}</td>
                    <td className="text-muted">{c.email ?? "—"}</td>
                    <td className="text-muted">
                      {[c.location_city, c.location_state].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="text-muted">{new Date(c.created_at).toLocaleDateString("pt-BR")}</td>
                    <td>
                      <div className="actions-cell">
                        <button
                          className="btn btn-secondary btn-sm"
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openEditForm(c); }}
                        >
                          Editar
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          type="button"
                          onClick={(e) => { e.stopPropagation(); void handleDelete(c.id); }}
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="table-footer">
              <span className="pagination-summary">
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
            </div>
          </>
        ) : null}
      </div>

      {selected ? (
        <div className="card">
          <div className="card-header">
            <h3>{selected.full_name}</h3>
            <p className="text-muted">Perfil consolidado · ID: {selected.id.slice(0, 8)}…</p>
          </div>

          {overviewLoading ? <SkeletonRows rows={4} /> : null}

          {overviewError ? (
            <div className="page-error">
              <span className="page-error-icon">✕</span>
              <span>{overviewError}</span>
            </div>
          ) : null}

          {!overviewLoading && !overviewError && selectedOverview ? (
            <>
              <div className="stats-mini">
                <div className="stat-mini">
                  <div className="stat-mini-label">Currículos</div>
                  <div className="stat-mini-value">{selectedOverview.resumes.length}</div>
                </div>
                <div className="stat-mini">
                  <div className="stat-mini-label">Última análise</div>
                  <div className="stat-mini-value" style={{ fontSize: 15 }}>
                    {selectedOverview.latest_analysis ? (
                      <StatusPill
                        label={selectedOverview.latest_analysis.status}
                        tone={
                          selectedOverview.latest_analysis.status === "completed" ? "success"
                          : selectedOverview.latest_analysis.status === "failed" ? "danger"
                          : "warning"
                        }
                      />
                    ) : "—"}
                  </div>
                </div>
                {selectedOverview.latest_analysis_pipeline ? (
                  <div className="stat-mini">
                    <div className="stat-mini-label">Ranking</div>
                    <div className="stat-mini-value" style={{ fontSize: 15 }}>
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
                ) : null}
                <div className="stat-mini">
                  <div className="stat-mini-label">Melhor match</div>
                  <div className="stat-mini-value">
                    {selectedOverview.top_matches[0]?.match_score != null
                      ? formatScore(selectedOverview.top_matches[0].match_score)
                      : "—"}
                  </div>
                </div>
                {selectedOverview.latest_analysis?.overall_score != null ? (
                  <div className="stat-mini">
                    <div className="stat-mini-label">Score geral</div>
                    <div className="stat-mini-value">
                      {formatScore(selectedOverview.latest_analysis.overall_score)}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="info-grid" style={{ marginTop: 16 }}>
                <div className="info-row">
                  <span className="info-label">E-mail</span>
                  <span className="info-value">{selectedOverview.candidate.email ?? "—"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Telefone</span>
                  <span className="info-value">{selectedOverview.candidate.phone ?? "—"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Localização</span>
                  <span className="info-value">
                    {[
                      selectedOverview.candidate.location_city,
                      selectedOverview.candidate.location_state,
                      selectedOverview.candidate.location_country,
                    ].filter(Boolean).join(", ") || "—"}
                  </span>
                </div>
                {(selectedOverview.candidate.linkedin_url || selectedOverview.candidate.github_url || selectedOverview.candidate.portfolio_url) ? (
                  <div className="info-row">
                    <span className="info-label">Links</span>
                    <span className="info-value">
                      <div className="candidate-links">
                        {selectedOverview.candidate.linkedin_url ? (
                          <a className="candidate-link" href={selectedOverview.candidate.linkedin_url} target="_blank" rel="noreferrer">
                            LinkedIn
                          </a>
                        ) : null}
                        {selectedOverview.candidate.github_url ? (
                          <a className="candidate-link" href={selectedOverview.candidate.github_url} target="_blank" rel="noreferrer">
                            GitHub
                          </a>
                        ) : null}
                        {selectedOverview.candidate.portfolio_url ? (
                          <a className="candidate-link" href={selectedOverview.candidate.portfolio_url} target="_blank" rel="noreferrer">
                            Portfolio
                          </a>
                        ) : null}
                      </div>
                    </span>
                  </div>
                ) : null}
                {selectedOverview.candidate.tags.length > 0 ? (
                  <div className="info-row">
                    <span className="info-label">Tags</span>
                    <span className="info-value">
                      <div className="tags-row">
                        {selectedOverview.candidate.tags.map((tag) => (
                          <span key={tag} className="tag">{tag}</span>
                        ))}
                      </div>
                    </span>
                  </div>
                ) : null}
                {candidateNotes.manualNotes ? (
                  <div className="info-row">
                    <span className="info-label">Notas</span>
                    <span className="info-value">{candidateNotes.manualNotes}</span>
                  </div>
                ) : null}
              </div>

              {candidateNotes.autoNotes.length > 0 ? (
                <>
                  <h4 className="section-title">Dados detectados do currículo</h4>
                  <div className="alert alert-success">
                    <span className="alert-icon">✓</span>
                    <span>Este candidato já recebeu pré-cadastro automático a partir do currículo enviado.</span>
                  </div>
                  <div className="info-grid" style={{ marginTop: 12 }}>
                    {candidateNotes.autoNotes.map((note) => (
                      <div key={note} className="info-row">
                        <span className="info-label">Detecção</span>
                        <span className="info-value">{note}</span>
                      </div>
                    ))}
                    <div className="info-row">
                      <span className="info-label">Resumo atual</span>
                      <span className="info-value">
                        {[selectedOverview.candidate.email, selectedOverview.candidate.phone]
                          .filter(Boolean)
                          .join(" • ") || "Contato não detectado"}
                      </span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Perfis detectados</span>
                      <span className="info-value">
                        {[
                          selectedOverview.candidate.linkedin_url ? "LinkedIn" : null,
                          selectedOverview.candidate.github_url ? "GitHub" : null,
                          selectedOverview.candidate.portfolio_url ? "Portfólio" : null,
                        ]
                          .filter(Boolean)
                          .join(" • ") || "Nenhum link detectado"}
                      </span>
                    </div>
                  </div>
                </>
              ) : null}

              {selectedOverview.latest_analysis ? (
                <>
                  <h4 className="section-title">Última análise</h4>
                  <div className="info-grid">
                    <div className="info-row">
                      <span className="info-label">Currículo</span>
                      <span className="info-value">{selectedOverview.latest_analysis.resume_title}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Senioridade</span>
                      <span className="info-value">{selectedOverview.latest_analysis.seniority_level ?? "—"}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Experiência</span>
                      <span className="info-value">
                        {selectedOverview.latest_analysis.total_experience_years != null
                          ? `${selectedOverview.latest_analysis.total_experience_years} anos`
                          : "—"}
                      </span>
                    </div>
                    {selectedOverview.latest_analysis_pipeline ? (
                      <>
                        <div className="info-row">
                          <span className="info-label">Ranking</span>
                          <span className="info-value">
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
                          </span>
                        </div>
                        <div className="info-row">
                          <span className="info-label">Vagas publicadas</span>
                          <span className="info-value">{selectedOverview.latest_analysis_pipeline.published_jobs_total}</span>
                        </div>
                        <div className="info-row">
                          <span className="info-label">Matches prontos</span>
                          <span className="info-value">{selectedOverview.latest_analysis_pipeline.matched_jobs_count}</span>
                        </div>
                        <div className="info-row">
                          <span className="info-label">Pendentes</span>
                          <span className="info-value">{selectedOverview.latest_analysis_pipeline.pending_jobs_count}</span>
                        </div>
                      </>
                    ) : null}
                  </div>
                </>
              ) : null}

              <h4 className="section-title">Currículos</h4>
              {selectedOverview.resumes.length === 0 ? (
                <EmptyState icon="📄" title="Nenhum currículo associado" />
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Título</th>
                      <th>Status</th>
                      <th>Arquivo</th>
                      <th>Extração</th>
                      <th>Atualizado em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOverview.resumes.map((resume) => (
                      <tr key={resume.resume_id}>
                        <td>
                          {resume.title}{" "}
                          <span className="text-muted">v{resume.current_version}</span>
                        </td>
                        <td><StatusPill label={resume.status} tone={resume.status === "active" ? "success" : "neutral"} /></td>
                        <td className="text-muted">{resume.current_file_name ?? "—"}</td>
                        <td className="text-muted">{resume.extraction_status ?? "—"}</td>
                        <td className="text-muted">{new Date(resume.updated_at).toLocaleString("pt-BR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <h4 className="section-title">Top vagas</h4>
              {selectedOverview.top_matches.length === 0 ? (
                <EmptyState icon="🎯" title="Nenhum match registrado para vagas" />
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Vaga</th>
                      <th>Status</th>
                      <th>Match</th>
                      <th>Recomendação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOverview.top_matches.map((match) => (
                      <tr key={`${match.analysis_id}-${match.job_id}`}>
                        <td>{match.job_title}</td>
                        <td>
                          <StatusPill
                            label={match.job_status}
                            tone={match.job_status === "published" ? "success" : match.job_status === "closed" ? "danger" : "warning"}
                          />
                        </td>
                        <td>{match.match_score != null ? formatScore(match.match_score) : "—"}</td>
                        <td className="text-muted">{match.recommendation ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
