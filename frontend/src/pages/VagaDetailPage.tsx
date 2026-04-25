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
import { Button } from "@/components/ui/button";
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
  const tone = scoreTone(data.match_score);
  const scoreClass =
    tone === "high" ? "text-green-600" : tone === "mid" ? "text-amber-600" : "text-red-600";

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4 lg:flex-row lg:items-center lg:justify-between">
        <strong className={`text-4xl font-semibold tracking-tight ${scoreClass}`}>{formatScore(data.match_score)}</strong>
        <p className="max-w-3xl text-sm leading-6 text-gray-600">{data.recommendation}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Skills obrigatórias</div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div className="h-full rounded-full bg-blue-600" style={{ width: `${mandatoryPct}%` }} />
          </div>
          <div className="mt-2 text-sm text-gray-500">
            {data.mandatory_skills_matched} de {data.mandatory_skills_total} ({mandatoryPct}%)
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Skills opcionais</div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div className="h-full rounded-full bg-blue-600" style={{ width: `${optionalPct}%` }} />
          </div>
          <div className="mt-2 text-sm text-gray-500">
            {data.optional_skills_matched} de {data.optional_skills_total} ({optionalPct}%)
          </div>
        </div>
      </div>

      {(data.candidate_seniority || data.job_seniority) ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
          <span className="font-medium text-gray-500">Senioridade</span>
          {data.candidate_seniority ? (
            <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1">
              Candidato: <strong className="text-gray-900">{data.candidate_seniority}</strong>
            </span>
          ) : null}
          {data.job_seniority ? (
            <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1">
              Vaga: <strong className="text-gray-900">{data.job_seniority}</strong>
            </span>
          ) : null}
          <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1">
            Score senioridade: <strong className="text-gray-900">{formatScore(data.seniority_score)}</strong>
          </span>
        </div>
      ) : null}
    </div>
  );
}

export function VagaDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: jobData, error: jobError, loading: jobLoading, run: runJob } = useAsyncState<any>();
  const { data: candidateData, error: candidateError, loading: candidateLoading, run: runCandidates } =
    useAsyncState<Paginated<JobCandidate>>();
  const { data: matchData, error: matchError, loading: matchLoading, run: runMatch } =
    useAsyncState<AnalysisMatch>();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [minScore, setMinScore] = useState<number | undefined>(undefined);
  const [seniority, setSeniority] = useState<string | undefined>(undefined);
  const [analysisIdForMatch, setAnalysisIdForMatch] = useState<string>("");

  useEffect(() => {
    if (!id) return;
    void runJob(() => getJob(id));
  }, [id, runJob]);

  useEffect(() => {
    if (!id) return;
    void runCandidates(() => listJobCandidates(id, page, pageSize, minScore, seniority));
  }, [id, page, pageSize, minScore, seniority, runCandidates]);

  useEffect(() => {
    setPage(1);
  }, [minScore, seniority, pageSize]);

  const total = candidateData?.total ?? 0;
  const totalPages = candidateData?.total_pages ?? 1;
  const items = candidateData?.data ?? [];
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const jobSubtitle = [jobData?.location, jobData?.seniority_level].filter(Boolean).join(" · ");
  const topMatch = [...items].filter((candidate) => candidate.match_score != null).sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0))[0];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 pb-12">
      <nav className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
        <Button variant="ghost" size="sm" onClick={() => navigate("/vagas")}>
          Vagas
        </Button>
        <span>/</span>
        <span>{jobLoading ? "Carregando…" : jobData?.title ?? "Detalhe"}</span>
      </nav>

      <PageHeader
        title={jobData?.title ?? "—"}
        subtitle={jobSubtitle || "Detalhes e candidatos ranqueados"}
        actions={
          <Button variant="outline" onClick={() => navigate(`/ranking${id ? `?jobId=${id}` : ""}`)}>
            Abrir ranking
          </Button>
        }
      />

      {jobError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {jobError}
        </div>
      ) : null}

      {jobData ? (
        <Card
          title="Resumo da oportunidade"
          description="Use este painel para entender o contexto da vaga, acompanhar a aderência dos candidatos e fazer uma leitura rápida da competitividade do funil."
          className="rounded-2xl border border-gray-200 bg-white shadow-sm"
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Status</div>
              <div className="mt-3">
                <StatusPill label={formatJobStatus(jobData.status)} tone={jobStatusTone(jobData.status)} />
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Candidatos ranqueados</div>
              <div className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">{total}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Melhor aderência atual</div>
              <div className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">
                {topMatch?.match_score != null ? formatScore(topMatch.match_score) : "—"}
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Faixa de perfil</div>
              <div className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">{formatSeniority(jobData.seniority_level)}</div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Modelo de trabalho</div>
              <div className="mt-1 text-sm text-gray-900">{formatWorkModel(jobData.work_model)}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Localização</div>
              <div className="mt-1 text-sm text-gray-900">{jobData.location ?? "Não informada"}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 md:col-span-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Descrição</div>
              <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-700">
                {jobData.description ?? "Sem descrição cadastrada."}
              </div>
            </div>
            {jobData.requirements ? (
              <div className="rounded-xl border border-gray-200 bg-white p-4 md:col-span-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Requisitos</div>
                <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-700">{jobData.requirements}</div>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      <Card
        title="Candidatos ranqueados"
        description="Filtre a lista para identificar rapidamente quem já demonstra melhor aderência para esta oportunidade."
        className="rounded-2xl border border-gray-200 bg-white shadow-sm"
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Score mínimo</label>
            <input
              type="number"
              value={minScore ?? ""}
              onChange={(e) => setMinScore(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Senioridade</label>
            <select
              value={seniority ?? ""}
              onChange={(e) => setSeniority(e.target.value || undefined)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">Todos</option>
              <option value="intern">Estágio</option>
              <option value="junior">Júnior</option>
              <option value="mid">Pleno</option>
              <option value="senior">Sênior</option>
              <option value="lead">Lead</option>
              <option value="principal">Principal</option>
              <option value="director">Diretoria</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Por página</label>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
            </select>
          </div>
        </div>

        {candidateLoading ? <SkeletonRows rows={pageSize > 10 ? 10 : pageSize} /> : null}

        {candidateError ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {candidateError}
          </div>
        ) : null}

        {!candidateLoading && !candidateError && total === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon="👥"
              title="Nenhum candidato encontrado"
              description="Não há candidatos associados a esta vaga ou nenhum corresponde aos filtros aplicados."
            />
          </div>
        ) : null}

        {items.length > 0 ? (
          <>
            <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Candidato</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Aderência</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Score geral</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Senioridade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {items.map((c) => (
                    <tr key={c.candidate_id} className="border-b border-gray-200 transition-colors even:bg-gray-50/50 hover:bg-gray-100">
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <strong className="text-sm font-medium text-gray-900">{c.candidate_name}</strong>
                          <span className="text-sm text-gray-500">{c.email ?? "E-mail não informado"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{c.match_score != null ? formatScore(c.match_score) : "—"}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{c.overall_score ?? "—"}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{c.seniority_level ? formatSeniority(c.seniority_level) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-col gap-3 border-t border-gray-200 pt-4 lg:flex-row lg:items-center lg:justify-between">
              <span className="text-sm text-gray-500">
                Mostrando {start}–{end} de {total}
              </span>
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
        className="rounded-2xl border border-gray-200 bg-white shadow-sm"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex-1 space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Identificador da análise</label>
            <input
              placeholder="Cole aqui a referência da análise que deseja comparar"
              value={analysisIdForMatch}
              onChange={(e) => setAnalysisIdForMatch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <Button
            type="button"
            disabled={!id || !analysisIdForMatch || matchLoading}
            onClick={() => {
              if (!id) return;
              void runMatch(() => matchToJob(analysisIdForMatch, id));
            }}
          >
            {matchLoading ? "Calculando…" : "Calcular match"}
          </Button>
        </div>

        {matchError ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {matchError}
          </div>
        ) : null}

        {matchData ? <div className="mt-4"><MatchResult data={matchData} /></div> : null}
      </Card>
    </div>
  );
}
