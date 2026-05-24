import type { CandidateActiveJobDecision } from "../../../../types/domain";

interface CandidateDecisionSummaryCardProps {
  activeJobDecision: CandidateActiveJobDecision | null;
  activeJobTitle: string | null;
  candidateName: string;
}

export function CandidateDecisionSummaryCard({
  activeJobDecision,
  activeJobTitle,
  candidateName,
}: CandidateDecisionSummaryCardProps) {
  if (!activeJobDecision) {
    return null;
  }

  const getStatusMessage = (scoreStatus: string): string => {
    switch (scoreStatus) {
      case "no_active_job":
        return "Candidato ainda não está vinculado a uma vaga ativa";
      case "waiting_analysis":
        return "Análise ainda não gerada para a vaga ativa";
      case "analysis_processing":
        return "Análise em andamento";
      case "matching_pending":
        return "Análise concluída; matching pendente";
      case "score_ready":
        return "Aderência calculada e pronta para revisão";
      case "score_stale":
        return "Aderência desatualizada";
      case "analysis_failed":
        return "Falha na análise";
      case "needs_repair":
        return "Inconsistência detectada no sistema";
      default:
        return "Estado desconhecido";
    }
  };

  const getNextActionMessage = (nextAction: string): string => {
    switch (nextAction) {
      case "none":
        return "Nenhuma ação necessária agora";
      case "wait_analysis":
        return "Aguardar conclusão da análise";
      case "review_candidate":
        return "Revisar candidato e decidir avanço";
      case "request_analysis":
        return "Solicitar ou reprocessar análise";
      case "run_repair":
        return "Executar diagnóstico/reparo";
      default:
        return "Ação não definida";
    }
  };

  const getWarningMessage = (warning: string): string => {
    switch (warning) {
      case "analysis_from_different_job":
        return "Há análise de outra vaga. Não use como aderência atual.";
      case "analysis_not_current_pipeline":
        return "A análise não corresponde à análise atual da pipeline.";
      case "score_not_ready":
        return "A análise terminou, mas o score ainda está sendo calculado.";
      case "unknown_analysis_status":
        return "Estado da análise não reconhecido.";
      default:
        return warning;
    }
  };

  const getStatusColor = (scoreStatus: string): string => {
    switch (scoreStatus) {
      case "no_active_job":
      case "waiting_analysis":
        return "bg-blue-50 border-blue-200 text-blue-900";
      case "analysis_processing":
        return "bg-amber-50 border-amber-200 text-amber-900";
      case "matching_pending":
        return "bg-blue-50 border-blue-200 text-blue-900";
      case "score_ready":
        return "bg-green-50 border-green-200 text-green-900";
      case "score_stale":
      case "analysis_failed":
        return "bg-red-50 border-red-200 text-red-900";
      case "needs_repair":
        return "bg-purple-50 border-purple-200 text-purple-900";
      default:
        return "bg-gray-50 border-gray-200 text-gray-900";
    }
  };

  const statusMessage = getStatusMessage(activeJobDecision.score_status);
  const nextActionMessage = getNextActionMessage(activeJobDecision.next_action);
  const statusColor = getStatusColor(activeJobDecision.score_status);

  const matchScorePercentage =
    activeJobDecision.match_score !== null
      ? Math.round(activeJobDecision.match_score * 100)
      : null;

  return (
    <div
      className={`rounded-lg border-2 p-4 ${statusColor}`}
      data-testid="decision-summary-card"
    >
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Resumo decisório</h3>
          <p className="mt-1 text-sm">{statusMessage}</p>
        </div>

        {activeJobTitle && activeJobDecision.score_status !== "no_active_job" && (
          <div>
            <div className="text-xs font-medium text-gray-600">Vaga</div>
            <div className="mt-1 text-sm font-medium">{activeJobTitle}</div>
          </div>
        )}

        {matchScorePercentage !== null && (
          <div>
            <div className="text-xs font-medium text-gray-600">Aderência</div>
            <div className="mt-1 text-lg font-semibold">{matchScorePercentage}%</div>
          </div>
        )}

        {activeJobDecision.next_action !== "none" && (
          <div>
            <div className="text-xs font-medium text-gray-600">Próximo passo</div>
            <div className="mt-1 text-sm">{nextActionMessage}</div>
          </div>
        )}

        {activeJobDecision.warnings.length > 0 && (
          <div className="mt-2 space-y-1 border-t-2 border-current pt-2 opacity-75">
            {activeJobDecision.warnings.map((warning, idx) => (
              <div key={idx} className="text-xs leading-relaxed">
                • {getWarningMessage(warning)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
