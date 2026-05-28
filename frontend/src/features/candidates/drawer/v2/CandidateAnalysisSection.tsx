import type { AnalysisResult } from "../../../../types/domain";

interface CandidateAnalysisSectionProps {
  analysisResult: AnalysisResult | null;
  isLoading: boolean;
  isOpen: boolean;
  onToggle: () => void;
}

export function CandidateAnalysisSection({
  analysisResult,
  isLoading,
  isOpen,
  onToggle,
}: CandidateAnalysisSectionProps) {
  if (!analysisResult) {
    return null;
  }

  return (
    <div className="border-t border-border/20">
      <button
        type="button"
        onClick={onToggle}
        disabled={isLoading}
        className="flex w-full items-center justify-between px-6 py-4 text-left transition hover:bg-surface-muted/30 disabled:opacity-50"
      >
        <h3 className="font-semibold text-text">Análise Detalhada</h3>
        <span className={`text-sm font-semibold text-text-muted transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>

      {isOpen && (
        <div className="border-t border-border/20 px-6 py-4">
          {isLoading ? (
            <div className="animate-pulse space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i}>
                  <div className="mb-2 h-4 w-24 rounded bg-surface-muted/40" />
                  <div className="space-y-2">
                    {Array.from({ length: 2 }).map((_, j) => (
                      <div key={j} className="h-3 rounded bg-surface-muted/40" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-5">
              {/* Strengths */}
              {analysisResult.strengths && analysisResult.strengths.length > 0 && (
                <div>
                  <h4 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-green-700">
                    Forças Principais
                  </h4>
                  <ul className="space-y-1.5">
                    {analysisResult.strengths.map((strength, idx) => (
                      <li key={idx} className="flex gap-2.5 text-sm text-text">
                        <span className="shrink-0 font-bold text-green-600">✓</span>
                        <span className="font-medium">{strength}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Weaknesses */}
              {analysisResult.weaknesses && analysisResult.weaknesses.length > 0 && (
                <div>
                  <h4 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-amber-700">
                    Áreas de Atenção
                  </h4>
                  <ul className="space-y-1.5">
                    {analysisResult.weaknesses.map((weakness, idx) => (
                      <li key={idx} className="flex gap-2.5 text-sm text-text">
                        <span className="shrink-0 text-amber-600">⚠️</span>
                        <span className="font-medium">{weakness}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Summary */}
              {analysisResult.candidate_summary && (
                <div>
                  <h4 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-text">
                    Sumário
                  </h4>
                  <p className="text-sm leading-relaxed text-text-muted">
                    {analysisResult.candidate_summary}
                  </p>
                </div>
              )}

              {/* Keywords */}
              {analysisResult.keywords && analysisResult.keywords.length > 0 && (
                <div>
                  <h4 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-text">
                    Palavras-chave
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {analysisResult.keywords.slice(0, 8).map((keyword, idx) => (
                      <span
                        key={idx}
                        className="rounded-full bg-blue-100 px-3 py-1.5 text-xs font-semibold text-blue-700"
                      >
                        {keyword}
                      </span>
                    ))}
                    {analysisResult.keywords.length > 8 && (
                      <span className="rounded-full bg-surface-muted/50 px-3 py-1.5 text-xs font-semibold text-text-muted">
                        +{analysisResult.keywords.length - 8}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
