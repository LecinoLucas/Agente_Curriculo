import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

import { managerService, ManagerJobResponse, ManagerCandidateSummary, ManagerCandidateDetailResponse } from "../../services/managerService";

export function ManagerReviewPage() {
  const [jobs, setJobs] = useState<ManagerJobResponse[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ManagerCandidateSummary[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<ManagerCandidateDetailResponse | null>(null);

  const [loadingJobs, setLoadingJobs] = useState(true);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadJobs();
  }, []);

  async function loadJobs() {
    try {
      setLoadingJobs(true);
      setError(null);
      const response = await managerService.listJobs();
      setJobs(response.jobs);
      if (response.jobs.length > 0) {
        setSelectedJobId(response.jobs[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar vagas");
    } finally {
      setLoadingJobs(false);
    }
  }

  async function loadCandidates(jobId: string) {
    try {
      setLoadingCandidates(true);
      setError(null);
      setCandidates([]);
      setSelectedCandidate(null);
      const response = await managerService.listCandidates(jobId);
      setCandidates(response.candidates);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar candidatos");
    } finally {
      setLoadingCandidates(false);
    }
  }

  async function loadCandidateSummary(jobId: string, candidateId: string) {
    try {
      setLoadingSummary(true);
      setError(null);
      const response = await managerService.getCandidateSummary(jobId, candidateId);
      setSelectedCandidate(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar resumo do candidato");
    } finally {
      setLoadingSummary(false);
    }
  }

  const handleJobSelect = (jobId: string) => {
    setSelectedJobId(jobId);
    loadCandidates(jobId);
  };

  const handleCandidateSelect = (candidateId: string) => {
    if (selectedJobId) {
      loadCandidateSummary(selectedJobId, candidateId);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Revisão de Candidatos</h1>
        <p className="text-sm text-gray-600">Acompanhe os candidatos atribuídos a você</p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex gap-3 text-sm text-red-800">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Lista de vagas */}
        <div className="space-y-3">
          <h2 className="font-semibold text-sm">Minhas Vagas</h2>
          {loadingJobs ? (
            <div className="flex items-center justify-center h-40 text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-gray-600">
              Nenhuma vaga atribuída no momento
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {jobs.map((job) => (
                <button
                  key={job.id}
                  onClick={() => handleJobSelect(job.id)}
                  className={`w-full text-left rounded-lg border p-3 transition-all text-sm ${
                    selectedJobId === job.id
                      ? "border-blue-500 bg-blue-50 text-blue-900"
                      : "border-gray-200 hover:border-gray-300 bg-white text-gray-900"
                  }`}
                >
                  <p className="font-medium">{job.title}</p>
                  <p className="text-xs text-gray-600 mt-1">
                    {job.assigned_count} / {job.candidate_count} candidatos
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Lista de candidatos */}
        <div className="space-y-3">
          <h2 className="font-semibold text-sm">Candidatos</h2>
          {loadingCandidates ? (
            <div className="flex items-center justify-center h-40 text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : candidates.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-gray-600">
              {selectedJobId ? "Nenhum candidato atribuído" : "Selecione uma vaga"}
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {candidates.map((candidate) => (
                <button
                  key={candidate.id}
                  onClick={() => handleCandidateSelect(candidate.id)}
                  className={`w-full text-left rounded-lg border p-3 transition-all text-sm ${
                    selectedCandidate?.id === candidate.id
                      ? "border-blue-500 bg-blue-50 text-blue-900"
                      : "border-gray-200 hover:border-gray-300 bg-white text-gray-900"
                  }`}
                >
                  <p className="font-medium truncate">{candidate.name}</p>
                  <p className="text-xs text-gray-600 truncate">{candidate.email}</p>
                  {candidate.scorecard_status && (
                    <p className="text-xs text-gray-600 mt-1">
                      Scorecard: <span className="capitalize">{candidate.scorecard_status}</span>
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Resumo do candidato */}
        <div className="space-y-3">
          <h2 className="font-semibold text-sm">Resumo</h2>
          {loadingSummary ? (
            <div className="flex items-center justify-center h-40 text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : !selectedCandidate ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-gray-600">
              Selecione um candidato
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 p-4 space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-600">Nome</p>
                <p className="text-sm font-semibold">{selectedCandidate.name}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-600">Email</p>
                <p className="text-sm">{selectedCandidate.email}</p>
              </div>

              {selectedCandidate.pipeline_stage && (
                <div>
                  <p className="text-sm font-medium text-gray-600">Etapa</p>
                  <p className="text-sm capitalize">{selectedCandidate.pipeline_stage}</p>
                </div>
              )}

              {selectedCandidate.scorecard && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-600">Scorecard</p>
                  <div className="rounded bg-gray-50 p-3 space-y-2">
                    <div>
                      <p className="text-xs text-gray-600">Status</p>
                      <p className="text-sm capitalize font-medium">{selectedCandidate.scorecard.status}</p>
                    </div>

                    {selectedCandidate.scorecard.recommendation && (
                      <div>
                        <p className="text-xs text-gray-600">Recomendação</p>
                        <p className="text-sm capitalize font-medium">
                          {selectedCandidate.scorecard.recommendation.replace(/_/g, " ")}
                        </p>
                      </div>
                    )}

                    {selectedCandidate.scorecard.submitted_at && (
                      <div>
                        <p className="text-xs text-gray-600">Enviado em</p>
                        <p className="text-sm">
                          {new Date(selectedCandidate.scorecard.submitted_at).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="rounded bg-yellow-50 border border-yellow-200 p-3 text-xs text-yellow-800">
                <p className="font-medium mb-1">Dados sensíveis omitidos:</p>
                <ul className="space-y-1 text-yellow-700">
                  <li>• Documentos e arquivos</li>
                  <li>• Payload de ERP</li>
                  <li>• Detalhes técnicos de IA</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
