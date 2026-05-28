import { useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminDiagnosticsService } from "@/services/adminDiagnosticsService";
import { candidatesService } from "@/services/candidatesService";
import { HttpError } from "@/services/http";
import type { CandidateListSummary } from "@/types/domain";
import type {
  CandidateJobFlowDiagnostic,
  CandidateJobFlowReasonCode,
  CandidateJobFlowRepairResponse,
} from "@/types/adminDiagnostics";

export const REASON_CODE_LABELS: Record<CandidateJobFlowReasonCode, string> = {
  flow_consistent: "Fluxo consistente",
  missing_active_pipeline: "Pipeline ativo não encontrado",
  missing_current_analysis: "Análise atual ausente",
  analysis_not_completed: "Análise ainda não concluída",
  completed_analysis_missing_score: "Análise concluída sem score",
  score_source_analysis_mismatch: "Score desalinhado da análise atual",
  match_points_to_inactive_job_profile: "Match aponta para perfil de vaga inativo",
  missing_active_job_profile: "Perfil ativo da vaga ausente",
  ranking_score_unavailable: "Score indisponível no ranking",
};

const ACTION_LABELS: Record<string, string> = {
  stale_mismatched_scores: "Scores desalinhados marcados como stale",
  stale_inactive_profile_matches: "Matches com perfil inativo marcados como stale",
  recomputed_from_completed_analysis: "Score recomposto a partir da análise concluída",
  recomputed_ranking_only: "Ranking recomposto com contexto disponível",
  recompute_skipped_no_context: "Recomposição automática não tinha contexto seguro",
};

type ChecklistRow = {
  key: string;
  label: string;
  icon: string;
  detail: string;
};

type CandidateProblemSuggestion = {
  candidate_id: string;
  candidate_name: string;
  job_id: string;
  job_title: string | null;
  reason_code: CandidateJobFlowReasonCode;
};

function toFriendlyError(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.status === 401 || error.status === 403) {
      return "Acesso negado. Esta funcionalidade é restrita a administradores.";
    }
    if (error.status >= 500) {
      return "Não foi possível concluir a operação agora. Tente novamente em instantes.";
    }
    return error.message;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Falha inesperada ao consultar diagnóstico.";
}

function mapActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function mapChecklist(diagnostic: CandidateJobFlowDiagnostic): ChecklistRow[] {
  const status = diagnostic.current_analysis_status;
  const analysisStatusIcon = !diagnostic.current_analysis_exists
    ? "❌"
    : status === "completed"
      ? "✅"
      : "⚠️";
  const analysisStatusDetail = !diagnostic.current_analysis_exists
    ? "ausente"
    : status ?? "desconhecido";

  return [
    {
      key: "pipeline",
      label: "Pipeline ativo",
      icon: diagnostic.active_pipeline_exists ? "✅" : "❌",
      detail: diagnostic.active_pipeline_exists ? "sim" : "não",
    },
    {
      key: "current-analysis",
      label: "Current analysis",
      icon: diagnostic.current_analysis_id_exists ? "✅" : "❌",
      detail: diagnostic.current_analysis_id_exists ? "sim" : "não",
    },
    {
      key: "analysis-exists",
      label: "Análise existe",
      icon: diagnostic.current_analysis_exists ? "✅" : "❌",
      detail: diagnostic.current_analysis_exists ? "sim" : "não",
    },
    {
      key: "analysis-status",
      label: "Status da análise",
      icon: analysisStatusIcon,
      detail: analysisStatusDetail,
    },
    {
      key: "active-job-profile",
      label: "Job profile ativo",
      icon: diagnostic.active_job_profile_exists ? "✅" : "❌",
      detail: diagnostic.active_job_profile_exists ? "sim" : "não",
    },
    {
      key: "match-exists",
      label: "Match existe",
      icon: diagnostic.match_exists ? "✅" : "❌",
      detail: diagnostic.match_exists ? "sim" : "não",
    },
    {
      key: "match-active-profile",
      label: "Match aponta para profile ativo",
      icon: diagnostic.match_points_to_active_job_profile ? "✅" : "❌",
      detail: diagnostic.match_points_to_active_job_profile ? "sim" : "não",
    },
    {
      key: "score-exists",
      label: "Score existe",
      icon: diagnostic.score_exists ? "✅" : "❌",
      detail: diagnostic.score_exists ? "sim" : "não",
    },
    {
      key: "score-source-analysis",
      label: "Score bate com análise atual",
      icon: diagnostic.score_source_analysis_matches_current ? "✅" : "❌",
      detail: diagnostic.score_source_analysis_matches_current ? "sim" : "não",
    },
    {
      key: "ranking",
      label: "Candidato aparece no ranking",
      icon: diagnostic.candidate_in_ranking ? "✅" : "❌",
      detail: diagnostic.candidate_in_ranking ? "sim" : "não",
    },
  ];
}

export function CandidateJobFlowDiagnosticsCard() {
  const [candidateId, setCandidateId] = useState("");
  const [jobId, setJobId] = useState("");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidateResults, setCandidateResults] = useState<CandidateListSummary[]>([]);
  const [candidateSearchLoading, setCandidateSearchLoading] = useState(false);
  const [problemSuggestions, setProblemSuggestions] = useState<CandidateProblemSuggestion[]>([]);
  const [problemSuggestionsLoading, setProblemSuggestionsLoading] = useState(false);
  const [diagnostic, setDiagnostic] = useState<CandidateJobFlowDiagnostic | null>(null);
  const [repairResult, setRepairResult] = useState<CandidateJobFlowRepairResponse | null>(null);
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [repairLoading, setRepairLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const checklist = useMemo(
    () => (diagnostic ? mapChecklist(diagnostic) : []),
    [diagnostic],
  );

  const isConsistent = diagnostic?.reason_code === "flow_consistent";
  const hasIds = candidateId.trim().length > 0 && jobId.trim().length > 0;

  const selectedCandidate = useMemo(
    () => candidateResults.find((candidate) => candidate.id === candidateId) ?? null,
    [candidateId, candidateResults],
  );

  const selectedCandidateName = selectedCandidate?.full_name ?? candidateSearch;

  const runCandidateSearch = async (search: string) => {
    const normalized = search.trim();
    setCandidateSearch(search);
    setCandidateId("");
    if (!normalized || normalized.length < 2) {
      setCandidateResults([]);
      return;
    }

    setCandidateSearchLoading(true);
    setErrorMessage(null);
    try {
      const response = await candidatesService.listSummaries(
        1,
        8,
        normalized,
        undefined,
        undefined,
        false,
      );
      setCandidateResults(response.data);
    } catch (error) {
      setErrorMessage(toFriendlyError(error));
    } finally {
      setCandidateSearchLoading(false);
    }
  };

  const selectCandidate = (candidate: CandidateListSummary) => {
    setCandidateId(candidate.id);
    setCandidateSearch(candidate.full_name);
    setCandidateResults((current) => {
      if (current.some((item) => item.id === candidate.id)) return current;
      return [candidate, ...current];
    });
    if (candidate.active_job_id) {
      setJobId(candidate.active_job_id);
    }
  };

  const runDiagnostic = async (preserveRepair = false) => {
    if (!hasIds) {
      setErrorMessage("Preencha candidate_id e job_id antes de diagnosticar.");
      return;
    }

    setDiagnosticLoading(true);
    setErrorMessage(null);
    if (!preserveRepair) {
      setRepairResult(null);
    }

    try {
      const response = await adminDiagnosticsService.getCandidateJobFlowDiagnostic(
        candidateId.trim(),
        jobId.trim(),
      );
      setDiagnostic(response);
    } catch (error) {
      setErrorMessage(toFriendlyError(error));
    } finally {
      setDiagnosticLoading(false);
    }
  };

  const runRepair = async () => {
    if (!hasIds) {
      setErrorMessage("Preencha candidate_id e job_id antes de reparar.");
      return;
    }

    setRepairLoading(true);
    setErrorMessage(null);

    try {
      const response = await adminDiagnosticsService.repairCandidateJobFlow(
        candidateId.trim(),
        jobId.trim(),
      );

      setRepairResult(response);
      setDiagnostic(response.after);
      await runDiagnostic(true);
    } catch (error) {
      setErrorMessage(toFriendlyError(error));
    } finally {
      setRepairLoading(false);
    }
  };

  const runProblemSuggestionsScan = async () => {
    setProblemSuggestionsLoading(true);
    setErrorMessage(null);
    setProblemSuggestions([]);

    try {
      const response = await candidatesService.listSummaries(
        1,
        25,
        candidateSearch.trim() || undefined,
        undefined,
        undefined,
        false,
      );

      const candidatesWithActiveJob = response.data.filter((candidate) => candidate.active_job_id);
      const diagnostics = await Promise.all(
        candidatesWithActiveJob.slice(0, 12).map(async (candidate) => {
          try {
            const result = await adminDiagnosticsService.getCandidateJobFlowDiagnostic(
              candidate.id,
              candidate.active_job_id as string,
            );
            return {
              candidate,
              result,
            };
          } catch {
            return null;
          }
        }),
      );

      const inconsistent = diagnostics
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .filter((item) => item.result.reason_code !== "flow_consistent")
        .map((item) => ({
          candidate_id: item.candidate.id,
          candidate_name: item.candidate.full_name,
          job_id: item.candidate.active_job_id as string,
          job_title: item.candidate.active_job_title,
          reason_code: item.result.reason_code,
        }));

      setProblemSuggestions(inconsistent);
    } catch (error) {
      setErrorMessage(toFriendlyError(error));
    } finally {
      setProblemSuggestionsLoading(false);
    }
  };

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle>Diagnóstico Candidato/Vaga</CardTitle>
        <CardDescription>
          Diagnostique e repare inconsistências de análise e aderência por
          <span className="font-mono"> candidate_id + job_id</span>.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="candidate-name-search">Filtro por candidato</Label>
            <Input
              id="candidate-name-search"
              value={candidateSearch}
              onChange={(event) => void runCandidateSearch(event.target.value)}
              placeholder="Digite nome ou email do candidato"
            />
            <p className="text-xs text-text-muted">
              {candidateSearchLoading
                ? "Buscando candidatos..."
                : selectedCandidateName
                  ? `Selecionado: ${selectedCandidateName}`
                  : "Use pelo menos 2 caracteres para buscar."}
            </p>
            {candidateResults.length > 0 ? (
              <ul className="max-h-52 space-y-1 overflow-auto rounded-md border border-border p-2 text-sm">
                {candidateResults.map((candidate) => (
                  <li key={candidate.id}>
                    <button
                      type="button"
                      className="w-full rounded px-2 py-1 text-left hover:bg-surface-muted"
                      onClick={() => selectCandidate(candidate)}
                    >
                      <span className="font-medium">{candidate.full_name}</span>
                      <span className="ml-2 text-xs text-text-muted">
                        {candidate.email ?? candidate.id}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="job-flow-id">Job ID</Label>
            <Input
              id="job-flow-id"
              value={jobId}
              onChange={(event) => setJobId(event.target.value)}
              placeholder="bb6aa5f2-a040-461a-adef-c79a5ef88872"
            />
            {selectedCandidate?.active_job_title ? (
              <p className="text-xs text-text-muted">
                Vaga ativa sugerida: {selectedCandidate.active_job_title}
              </p>
            ) : null}
            <p className="text-xs text-text-muted">
              Candidate ID selecionado:{" "}
              <span className="font-mono">{candidateId || "nenhum"}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void runDiagnostic()} disabled={diagnosticLoading}>
            {diagnosticLoading ? "Diagnóstico em andamento..." : "Diagnosticar"}
          </Button>
          <Button type="button" onClick={() => void runRepair()} disabled={repairLoading || diagnosticLoading}>
            {repairLoading ? "Reparo em andamento..." : "Reparar"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void runProblemSuggestionsScan()}
            disabled={problemSuggestionsLoading || diagnosticLoading || repairLoading}
          >
            {problemSuggestionsLoading ? "Buscando problemas..." : "Sugerir candidatos com problema"}
          </Button>
        </div>

        {problemSuggestions.length > 0 ? (
          <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">Candidatos com problema detectado</p>
            <ul className="space-y-1">
              {problemSuggestions.map((suggestion) => (
                <li key={`${suggestion.candidate_id}:${suggestion.job_id}`}>
                  <button
                    type="button"
                    className="w-full rounded px-2 py-1 text-left hover:bg-amber-100"
                    onClick={() => {
                      setCandidateId(suggestion.candidate_id);
                      setCandidateSearch(suggestion.candidate_name);
                      setJobId(suggestion.job_id);
                    }}
                  >
                    {`${suggestion.candidate_name} · ${suggestion.job_title ?? "Vaga sem título"} · ${REASON_CODE_LABELS[suggestion.reason_code]}`}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {errorMessage ? (
          <Alert variant="destructive">
            <AlertTitle>Falha na operação</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        {diagnostic ? (
          <Alert variant={isConsistent ? "success" : "warning"}>
            <AlertTitle>{REASON_CODE_LABELS[diagnostic.reason_code]}</AlertTitle>
            <AlertDescription>
              {isConsistent ? "Fluxo consistente" : "Fluxo com inconsistência"}
            </AlertDescription>
          </Alert>
        ) : null}

        {diagnostic ? (
          <div className="rounded-md border border-border">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold text-text">
              Checklist do fluxo
            </div>
            <ul className="space-y-2 px-4 py-3 text-sm text-text">
              {checklist.map((row) => (
                <li key={row.key}>{`${row.label}: ${row.icon} ${row.detail}`}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {repairResult ? (
          <div className="space-y-2 rounded-md border border-border px-4 py-3 text-sm text-text">
            <p className="font-semibold">{repairResult.repaired ? "Reparo executado." : "Nenhuma correção automática segura foi aplicada."}</p>
            <p>{`Antes: ${REASON_CODE_LABELS[repairResult.before.reason_code]}`}</p>
            <p>{`Depois: ${REASON_CODE_LABELS[repairResult.after.reason_code]}`}</p>
            <div>
              <p className="font-medium">Ações</p>
              {repairResult.actions.length === 0 ? (
                <p>Nenhuma ação executada.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {repairResult.actions.map((action) => (
                    <li key={action}>{`• ${mapActionLabel(action)}`}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
