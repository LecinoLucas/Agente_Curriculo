import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowUpRight, Filter, Target } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import Pagination from "../components/common/Pagination";
import { SkeletonRows } from "../components/common/Skeleton";
import { StatusBadge } from "../components/common/StatusBadge";
import { useAsyncState } from "../hooks/useAsyncState";
import { listJobs, listJobCandidates } from "../services/jobsService";
import { Job, JobCandidate } from "../types/domain";
import { Paginated } from "../types/api";

function formatScore(score: number | null | undefined): string {
  if (score == null) return "—";
  return score > 1 ? `${Math.round(score)}%` : `${Math.round(score * 100)}%`;
}

function scoreTone(score: number | null | undefined): "success" | "warning" | "danger" | "neutral" {
  const normalized = score == null ? 0 : score > 1 ? score / 100 : score;
  if (normalized >= 0.75) return "success";
  if (normalized >= 0.5) return "warning";
  return "danger";
}

function formatSeniority(level?: string | null): string {
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
      return level ?? "Não informado";
  }
}

function jobStatusLabel(status: string): string {
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
      return status;
  }
}

function scoreBand(score: number | null | undefined): string {
  const normalized = score == null ? 0 : score > 1 ? score / 100 : score;
  if (normalized >= 0.75) return "Aderência alta";
  if (normalized >= 0.5) return "Aderência média";
  return "Aderência baixa";
}

function cleanScore(value: number | null | undefined): number {
  if (value == null) return 0;
  return value > 1 ? value / 100 : value;
}

export function RankingPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [minScore, setMinScore] = useState<number | "">("");
  const [seniority, setSeniority] = useState<string>("");

  const { data: jobsData, error: jobsError, loading: jobsLoading, run: runJobs } = useAsyncState<Job[]>();
  const { data: rankingData, error: rankingError, loading: rankingLoading, run: runRanking } =
    useAsyncState<Paginated<JobCandidate>>();

  useEffect(() => {
    void runJobs(async () => {
      const response = await listJobs(1, 100);
      return response.data ?? [];
    });
  }, [runJobs]);

  useEffect(() => {
    if (!jobsData || jobsData.length === 0) return;
    const requestedJobId = searchParams.get("jobId") ?? "";
    const validRequestedJob = requestedJobId && jobsData.some((job) => job.id === requestedJobId);
    if (validRequestedJob && selectedJobId !== requestedJobId) {
      setSelectedJobId(requestedJobId);
      return;
    }
    if (!selectedJobId) {
      setSelectedJobId(jobsData[0].id);
    } else if (!jobsData.some((job) => job.id === selectedJobId)) {
      setSelectedJobId(jobsData[0].id);
    }
  }, [jobsData, selectedJobId, searchParams]);

  useEffect(() => {
    if (!selectedJobId) return;
    const current = searchParams.get("jobId");
    if (current !== selectedJobId) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("jobId", selectedJobId);
        return next;
      }, { replace: true });
    }
  }, [searchParams, selectedJobId, setSearchParams]);

  useEffect(() => {
    if (!selectedJobId) return;
    void runRanking(() => listJobCandidates(selectedJobId, page, pageSize, minScore === "" ? undefined : minScore, seniority || undefined));
  }, [selectedJobId, page, pageSize, minScore, seniority, runRanking]);

  useEffect(() => {
    setPage(1);
  }, [selectedJobId, minScore, seniority, pageSize]);

  const selectedJob = useMemo(
    () => jobsData?.find((job) => job.id === selectedJobId) ?? null,
    [jobsData, selectedJobId],
  );

  const rankingItems = rankingData?.data ?? [];
  const total = rankingData?.total ?? 0;
  const totalPages = rankingData?.total_pages ?? 1;
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const topCandidate = rankingItems[0] ?? null;

  const summary = useMemo(() => {
    const scores = rankingItems.map((item) => cleanScore(item.match_score)).filter((value) => value > 0);
    const average = scores.length > 0 ? Math.round((scores.reduce((sum, value) => sum + value, 0) / scores.length) * 100) : 0;
    const strong = rankingItems.filter((item) => cleanScore(item.match_score) >= 0.75).length;
    return { average, strong };
  }, [rankingItems]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 pb-12">
      <PageHeader
        title="Ranking de currículos"
        subtitle="Veja rapidamente quais candidatos deram match e qual score cada um recebeu por vaga"
        actions={
          <>
            <Button variant="outline" onClick={() => navigate("/vagas")}>
              Voltar para vagas
            </Button>
          </>
        }
      />

      {jobsError ? (
        <Alert variant="destructive">
          <AlertDescription>{jobsError}</AlertDescription>
        </Alert>
      ) : null}

      {rankingError ? (
        <Alert variant="destructive">
          <AlertDescription>{rankingError}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="border-gray-200 bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-900 text-white shadow-lg shadow-blue-950/10">
        <CardContent className="grid gap-4 p-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-white/90">
              <Target className="h-3.5 w-3.5" />
              Leitura rápida
            </div>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Ranking pronto para bater o olho e entender quem deu match.
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-slate-200 sm:text-base">
              Escolha uma vaga e compare os currículos com score, faixa de senioridade e recomendação sem precisar abrir várias telas.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">Candidatos</div>
              <div className="mt-2 text-3xl font-semibold tracking-tight text-white">{total}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">Score médio</div>
              <div className="mt-2 text-3xl font-semibold tracking-tight text-white">{summary.average ? `${summary.average}%` : "—"}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">Acima de 75%</div>
              <div className="mt-2 text-3xl font-semibold tracking-tight text-white">{summary.strong}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-gray-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-blue-600" />
            Filtros
          </CardTitle>
          <CardDescription>Refine o ranking para encontrar os currículos com maior aderência rapidamente.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900 lg:col-span-2">
            Vaga
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              disabled={jobsLoading}
            >
              {jobsLoading ? (
                <option>Carregando vagas…</option>
              ) : (
                (jobsData ?? []).map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title} · {job.status === "published" ? "Publicada" : job.status}
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900">
            Score mínimo
            <select
              value={minScore}
              onChange={(e) => setMinScore(e.target.value === "" ? "" : Number(e.target.value))}
              className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">Todos</option>
              <option value={20}>20%</option>
              <option value={40}>40%</option>
              <option value={60}>60%</option>
              <option value={75}>75%</option>
              <option value={85}>85%</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900">
            Senioridade
            <select
              value={seniority}
              onChange={(e) => setSeniority(e.target.value)}
              className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">Todas</option>
              <option value="intern">Estágio</option>
              <option value="junior">Júnior</option>
              <option value="mid">Pleno</option>
              <option value="senior">Sênior</option>
              <option value="lead">Lead</option>
            </select>
          </label>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="border-gray-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Contexto da vaga</CardTitle>
            <CardDescription>{selectedJob ? selectedJob.title : "Selecione uma vaga para ver o contexto"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedJob ? (
              <>
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Status</div>
                  <div className="mt-2">
                    <StatusBadge label={jobStatusLabel(selectedJob.status)} tone={selectedJob.status === "published" ? "success" : selectedJob.status === "paused" ? "warning" : "neutral"} />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Localização</div>
                    <div className="mt-2 font-medium text-gray-950">{selectedJob.location ?? "Não informada"}</div>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Perfil</div>
                    <div className="mt-2 font-medium text-gray-950">{formatSeniority(selectedJob.seniority_level)}</div>
                  </div>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Descrição</div>
                  <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">{selectedJob.description}</div>
                </div>
                {topCandidate ? (
                  <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Melhor match</div>
                    <div className="mt-2 text-xl font-semibold text-gray-950">{topCandidate.candidate_name}</div>
                    <p className="mt-1 text-sm text-gray-600">
                      {formatScore(topCandidate.match_score)} · {scoreBand(topCandidate.match_score)}
                    </p>
                  </div>
                ) : null}
              </>
            ) : (
              <EmptyState
                icon="📄"
                title="Nenhuma vaga selecionada"
                description="Escolha uma vaga para visualizar o ranking dos currículos."
              />
            )}
          </CardContent>
        </Card>

        <Card className="border-gray-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Ranking dos candidatos</CardTitle>
            <CardDescription>{selectedJob ? `Currículos ranqueados para ${selectedJob.title}` : "Escolha uma vaga para ver os candidatos ranqueados"}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {rankingLoading ? (
              <SkeletonRows rows={5} />
            ) : rankingItems.length === 0 ? (
              <EmptyState
                icon="🏷️"
                title="Sem candidatos nessa visão"
                description="Quando houver match para a vaga selecionada, o ranking aparece aqui."
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr className="border-b border-gray-200">
                        <th className="h-11 px-4 text-left text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Candidato</th>
                        <th className="h-11 px-4 text-left text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Match</th>
                        <th className="h-11 px-4 text-left text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Score geral</th>
                        <th className="h-11 px-4 text-left text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Senioridade</th>
                        <th className="h-11 px-4 text-left text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Recomendação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {rankingItems.map((candidate) => (
                        <tr key={candidate.candidate_id} className="border-b border-gray-200 transition-colors even:bg-gray-50/50 hover:bg-gray-100">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-gray-950">{candidate.candidate_name}</div>
                            <div className="text-xs text-gray-500">{candidate.email ?? "Sem e-mail"}</div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={scoreTone(candidate.match_score)}>
                              {scoreBand(candidate.match_score)}
                            </Badge>
                            <div className="mt-2 text-sm text-gray-600">{formatScore(candidate.match_score)}</div>
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                            {candidate.overall_score != null ? `${Math.round(candidate.overall_score)}%` : "—"}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {candidate.seniority_level ? formatSeniority(candidate.seniority_level) : "—"}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {candidate.recommendation ?? "Sem recomendação"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">
                  <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-gray-500">
                      Mostrando {start}–{end} de {total}
                    </div>
                    <Pagination
                      page={page}
                      totalPages={totalPages}
                      onPageChange={setPage}
                      pageSize={pageSize}
                      onPageSizeChange={setPageSize}
                      total={total}
                    />
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
