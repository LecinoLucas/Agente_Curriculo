import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Card } from "../components/common/Card";
import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import Pagination from "../components/common/Pagination";
import { StatusPill } from "../components/common/StatusPill";
import { SkeletonRows } from "../components/common/Skeleton";
import { useAsyncState } from "../hooks/useAsyncState";
import { matchToJob } from "../services/analysisService";
import { getJob, listJobCandidates } from "../services/jobsService";
import { Paginated } from "../types/api";
import { AnalysisMatch, JobCandidate } from "../types/domain";

function formatScore(score: number): string {
  return score > 1 ? `${Math.round(score)}%` : `${Math.round(score * 100)}%`;
}

function scoreTone(score: number): "high" | "mid" | "low" {
  const normalized = score > 1 ? score / 100 : score;
  if (normalized >= 0.7) return "high";
  if (normalized >= 0.4) return "mid";
  return "low";
}

function skillPct(matched: number, total: number): number {
  return total > 0 ? Math.round((matched / total) * 100) : 0;
}

function formatJobStatus(status?: string | null) {
  switch (status) {
    case "draft":
      return "Rascunho";
    case "published":
      return "Publicada";
    case "paused":
      return "Pausada";
    case "closed":
      return "Encerrada";
    case "cancelled":
      return "Cancelada";
    default:
      return status ?? "Sem status";
  }
}

function jobStatusTone(status?: string | null): "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "published":
      return "success";
    case "paused":
      return "warning";
    case "cancelled":
      return "danger";
    default:
      return "neutral";
  }
}

function formatSeniority(level?: string | null) {
  switch (level) {
    case "intern":
      return "Estágio";
    case "junior":
      return "Júnior";
    case "mid":
      return "Pleno";
    case "senior":
      return "Sênior";
    case "lead":
      return "Lead";
    case "principal":
      return "Principal";
    case "director":
      return "Diretoria";
    default:
      return level ?? "Não definido";
  }
}

function formatWorkModel(model?: string | null) {
  switch (model) {
    case "remote":
      return "Remoto";
    case "hybrid":
      return "Híbrido";
    case "onsite":
      return "Presencial";
    default:
      return model ?? "Não informado";
  }
}

function MatchResult({ data }: { data: AnalysisMatch }) {
  const mandatoryPct = skillPct(data.mandatory_skills_matched, data.mandatory_skills_total);
  const optionalPct = skillPct(data.optional_skills_matched, data.optional_skills_total);

  return (
    <div className="match-result">
      <div className="match-score-row">
        <strong className={`match-score-badge ${scoreTone(data.match_score)}`}>
          {formatScore(data.match_score)}
        </strong>
        <p className="match-recommendation">{data.recommendation}</p>
      </div>

      <div className="match-skills-grid">
        <div className="match-skill-item">
          <strong>Skills obrigatórias</strong>
          <div className="match-skill-bar">
            <div className="match-skill-fill" style={{ width: `${mandatoryPct}%` }} />
          </div>
          <span className="text-muted">
            {data.mandatory_skills_matched} de {data.mandatory_skills_total} ({mandatoryPct}%)
          </span>
        </div>
        <div className="match-skill-item">
          <strong>Skills opcionais</strong>
          <div className="match-skill-bar">
            <div className="match-skill-fill" style={{ width: `${optionalPct}%` }} />
          </div>
          <span className="text-muted">
            {data.optional_skills_matched} de {data.optional_skills_total} ({optionalPct}%)
          </span>
        </div>
      </div>

      {(data.candidate_seniority || data.job_seniority) && (
        <div className="match-seniority-row">
          <span className="text-muted">Senioridade:</span>
          {data.candidate_seniority && (
            <span className="seniority-tag">
              Candidato: <strong>{data.candidate_seniority}</strong>
            </span>
          )}
          {data.job_seniority && (
            <span className="seniority-tag">
              Vaga: <strong>{data.job_seniority}</strong>
            </span>
          )}
          <span className="seniority-tag">
            Score senioridade: <strong>{formatScore(data.seniority_score)}</strong>
          </span>
        </div>
      )}
    </div>
  );
}

export function VagaDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: jobData, error: jobError, loading: jobLoading, run: runJob } = useAsyncState<any>();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [minScore, setMinScore] = useState<number | undefined>(undefined);
  const [seniority, setSeniority] = useState<string | undefined>(undefined);

  const {
    data: candidateData,
    error: candidateError,
    loading: candidateLoading,
    run: runCandidates,
  } = useAsyncState<Paginated<JobCandidate>>();

  useEffect(() => {
    if (!id) return;
    void runJob(() => getJob(id));
  }, [id, runJob]);

  useEffect(() => {
    if (!id) return;
    void runCandidates(() => listJobCandidates(id, page, pageSize, minScore, seniority));
  }, [id, page, pageSize, minScore, seniority, runCandidates]);

  useEffect(() => { setPage(1); }, [minScore, seniority, pageSize]);

  const total = candidateData?.total ?? 0;
  const totalPages = candidateData?.total_pages ?? 1;
  const items = candidateData?.data ?? [];
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  const { data: matchData, error: matchError, loading: matchLoading, run: runMatch } =
    useAsyncState<AnalysisMatch>();
  const [analysisIdForMatch, setAnalysisIdForMatch] = useState<string>("");

  const jobSubtitle = [jobData?.location, jobData?.seniority_level].filter(Boolean).join(" · ");
  const topMatch = [...items]
    .filter((candidate) => candidate.match_score != null)
    .sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0))[0];

  return (
    <div className="page-grid">
      <nav className="breadcrumb">
        <button type="button" onClick={() => navigate("/vagas")}>Vagas</button>
        <span className="breadcrumb-sep">/</span>
        <span>{jobLoading ? "Carregando…" : (jobData?.title ?? "Detalhe")}</span>
      </nav>

      <PageHeader
        title={jobData?.title ?? "—"}
        subtitle={jobSubtitle || "Detalhes e candidatos ranqueados"}
      />

      {jobError ? (
        <div className="page-error">
          <span className="page-error-icon">✕</span>
          <span>{jobError}</span>
        </div>
      ) : null}

      {jobData ? (
        <Card
          title="Resumo da oportunidade"
          description="Use este painel para entender o contexto da vaga, acompanhar a aderência dos candidatos e fazer uma leitura rápida da competitividade do funil."
        >
          <div className="stats-mini">
            <div className="stat-mini">
              <div className="stat-mini-label">Status</div>
              <div style={{ marginTop: 6 }}>
                <StatusPill label={formatJobStatus(jobData.status)} tone={jobStatusTone(jobData.status)} />
              </div>
            </div>
            <div className="stat-mini">
              <div className="stat-mini-label">Candidatos ranqueados</div>
              <div className="stat-mini-value">{total}</div>
            </div>
            <div className="stat-mini">
              <div className="stat-mini-label">Melhor aderência atual</div>
              <div className="stat-mini-value">{topMatch?.match_score != null ? formatScore(topMatch.match_score) : "—"}</div>
            </div>
            <div className="stat-mini">
              <div className="stat-mini-label">Faixa de perfil</div>
              <div className="stat-mini-value">{formatSeniority(jobData.seniority_level)}</div>
            </div>
          </div>

          <div className="info-grid" style={{ marginTop: 16 }}>
            <div className="info-row">
              <span className="info-label">Modelo de trabalho</span>
              <span className="info-value">{formatWorkModel(jobData.work_model)}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Localização</span>
              <span className="info-value">{jobData.location ?? "Não informada"}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Descrição</span>
              <span className="info-value" style={{ whiteSpace: "pre-wrap" }}>
                {jobData.description ?? "Sem descrição cadastrada."}
              </span>
            </div>
            {jobData.requirements ? (
              <div className="info-row">
                <span className="info-label">Requisitos</span>
                <span className="info-value" style={{ whiteSpace: "pre-wrap" }}>{jobData.requirements}</span>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      <Card
        title="Candidatos ranqueados"
        description="Filtre a lista para identificar rapidamente quem já demonstra melhor aderência para esta oportunidade."
      >
        <div className="filters-row">
          <div className="filter-group">
            <label>Score mínimo</label>
            <input
              type="number"
              value={minScore ?? ""}
              onChange={(e) => setMinScore(e.target.value ? Number(e.target.value) : undefined)}
            />
          </div>
          <div className="filter-group">
            <label>Senioridade</label>
            <select value={seniority ?? ""} onChange={(e) => setSeniority(e.target.value || undefined)}>
              <option value="">Todos</option>
              <option value="intern">Intern</option>
              <option value="junior">Junior</option>
              <option value="mid">Mid</option>
              <option value="senior">Senior</option>
              <option value="lead">Lead</option>
              <option value="principal">Principal</option>
              <option value="director">Director</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Por página</label>
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
            </select>
          </div>
        </div>

        {candidateLoading ? <SkeletonRows rows={pageSize > 10 ? 10 : pageSize} /> : null}

        {candidateError ? (
          <div className="page-error">
            <span className="page-error-icon">✕</span>
            <span>{candidateError}</span>
          </div>
        ) : null}

        {!candidateLoading && !candidateError && total === 0 ? (
          <EmptyState
            icon="👥"
            title="Nenhum candidato encontrado"
            description="Não há candidatos associados a esta vaga ou nenhum corresponde aos filtros aplicados."
          />
        ) : null}

        {items.length > 0 ? (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>Candidato</th>
                  <th>Aderência</th>
                  <th>Score geral</th>
                  <th>Senioridade</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.candidate_id}>
                    <td>
                      <div style={{ display: "grid", gap: 4 }}>
                        <strong>{c.candidate_name}</strong>
                        <span className="text-muted">{c.email ?? "E-mail não informado"}</span>
                      </div>
                    </td>
                    <td>{c.match_score != null ? formatScore(c.match_score) : "—"}</td>
                    <td>{c.overall_score ?? "—"}</td>
                    <td>{c.seniority_level ? formatSeniority(c.seniority_level) : "—"}</td>
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

      <Card
        title="Simulação pontual de match"
        description="Use este teste quando quiser comparar manualmente uma análise específica com esta vaga, sem depender apenas do ranking já persistido."
      >
        <div className="filters-row">
          <div className="filter-group" style={{ flex: 1, minWidth: 280 }}>
            <label>Identificador da análise</label>
            <input
              placeholder="Cole aqui a referência da análise que deseja comparar"
              value={analysisIdForMatch}
              onChange={(e) => setAnalysisIdForMatch(e.target.value)}
            />
          </div>
          <button
            className="btn"
            type="button"
            disabled={!id || !analysisIdForMatch || matchLoading}
            onClick={() => {
              if (!id) return;
              void runMatch(() => matchToJob(analysisIdForMatch, id));
            }}
          >
            {matchLoading ? "Calculando…" : "Calcular match"}
          </button>
        </div>

        {matchError ? (
          <div className="page-error">
            <span className="page-error-icon">✕</span>
            <span>{matchError}</span>
          </div>
        ) : null}

        {matchData ? <MatchResult data={matchData} /> : null}
      </Card>
    </div>
  );
}
