import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, X } from "lucide-react";

import { CandidateScoreDimensionsCard } from "./CandidateScoreDimensionsCard";
import { useCandidateOverview } from "../hooks/useCandidateOverview";
import {
  ANALYSIS_STATUS_LABEL,
  STAGE_LABEL,
  deriveNextAction,
  derivePendencies,
  formatLatestMovement,
  formatScorePercent,
  getActiveJobScore,
  getActivePipelineEntry,
  getInitials,
  getPrimaryResume,
} from "../utils/profile";

export type CandidatePreviewDrawerProps = {
  candidateId: string | null;
  onClose: () => void;
};

export function CandidatePreviewDrawer({ candidateId, onClose }: CandidatePreviewDrawerProps) {
  if (!candidateId) return null;
  return <DrawerPanel candidateId={candidateId} onClose={onClose} />;
}

function DrawerPanel({ candidateId, onClose }: { candidateId: string; onClose: () => void }) {
  const navigate = useNavigate();
  const { overview, loading, error, notFound, reload } = useCandidateOverview(candidateId);

  const candidate = overview?.candidate ?? null;
  const activeEntry = getActivePipelineEntry(overview);
  const pendencies = derivePendencies(overview);
  const nextAction = deriveNextAction(overview, activeEntry);
  const activeJobScore = getActiveJobScore(overview, activeEntry);
  const lastNote = overview?.latest_note ?? null;
  const skillPreview = overview?.active_job_skill_preview ?? null;
  const scoreDimensions = overview?.active_job_score_dimensions ?? null;
  const primaryResume = getPrimaryResume(overview);
  const latestMovement = formatLatestMovement(overview);
  const location = [candidate?.location_city, candidate?.location_state]
    .filter(Boolean)
    .join(", ");

  const openFullProfile = () => {
    navigate(`/candidatos/${candidateId}`);
  };

  const openResume = () => {
    navigate(`/candidatos/${candidateId}?tab=documents`);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
        data-testid="preview-backdrop"
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-label="Preview do candidato"
        className="fixed inset-y-0 right-0 z-50 flex w-[420px] max-w-[calc(100vw-16px)] flex-col overflow-hidden bg-[hsl(var(--surface))] shadow-xl"
        data-testid="preview-drawer"
      >
        {loading ? <PreviewSkeleton /> : null}

        {!loading && notFound ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center">
            <p className="text-sm text-[hsl(var(--text-muted))]">Candidato não encontrado.</p>
          </div>
        ) : null}

        {!loading && error ? (
          <div
            className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center"
            data-testid="preview-error"
          >
            <p className="text-sm text-[hsl(var(--danger))]">{error}</p>
            <button
              type="button"
              onClick={() => void reload()}
              className="text-sm font-medium text-[hsl(var(--primary))] hover:underline"
            >
              Tentar novamente
            </button>
          </div>
        ) : null}

        {!loading && !error && !notFound && overview && candidate ? (
          <>
            <div className="flex items-start gap-3 border-b border-[hsl(var(--border))] p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary))]/10 text-base font-semibold text-[hsl(var(--primary))]">
                {getInitials(candidate.full_name)}
              </div>

              <div className="min-w-0 flex-1">
                <h2 className="truncate font-semibold text-[hsl(var(--text))]" data-testid="preview-name">
                  {candidate.full_name}
                </h2>
                <div className="mt-1 flex flex-col gap-0.5 text-xs text-[hsl(var(--text-muted))]">
                  {candidate.email ? <span className="truncate">{candidate.email}</span> : null}
                  {candidate.phone ? <span>{candidate.phone}</span> : null}
                  {location ? <span>{location}</span> : null}
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                data-testid="preview-close"
                aria-label="Fechar preview"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[hsl(var(--text-muted))] transition-colors hover:bg-[hsl(var(--surface-muted))] hover:text-[hsl(var(--text))]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <SectionCard testId="preview-active-job">
                <SectionLabel>Vaga ativa</SectionLabel>
                {activeEntry ? (
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-medium text-[hsl(var(--text))]">
                      {activeEntry.job_title}
                    </span>
                    <span
                      className="shrink-0 rounded-full bg-[hsl(var(--primary))]/10 px-2 py-0.5 text-xs font-medium text-[hsl(var(--primary))]"
                      data-testid="preview-stage-badge"
                    >
                      {STAGE_LABEL[activeEntry.stage] ?? activeEntry.stage}
                    </span>
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-[hsl(var(--text-muted))]" data-testid="preview-no-job">
                    Aguardando vaga
                  </p>
                )}
              </SectionCard>

              <SectionCard testId="preview-adherence">
                <SectionLabel>Aderência</SectionLabel>
                <div className="mt-1.5 flex items-center gap-2">
                  {activeJobScore != null ? (
                    <span className="text-2xl font-bold text-[hsl(var(--text))]" data-testid="preview-score-value">
                      {formatScorePercent(activeJobScore)}
                    </span>
                  ) : (
                    <span className="text-sm text-[hsl(var(--text-muted))]">-</span>
                  )}
                  {overview.active_job_decision?.analysis_status ? (
                    <span className="text-xs text-[hsl(var(--text-muted))]">
                      {ANALYSIS_STATUS_LABEL[overview.active_job_decision.analysis_status] ?? ""}
                    </span>
                  ) : null}
                </div>
              </SectionCard>

              {activeEntry ? <CandidateScoreDimensionsCard dimensions={scoreDimensions} /> : null}

              <SectionCard testId="preview-skills">
                <SectionLabel>Skills da vaga</SectionLabel>
                {skillPreview?.matched_skills.length || skillPreview?.attention_points.length ? (
                  <div className="mt-2 space-y-3">
                    <SkillList
                      title="Skills compatíveis"
                      items={skillPreview.matched_skills.slice(0, 3)}
                      testId="preview-matched-skills"
                    />
                    <SkillList
                      title="Pontos de atenção"
                      items={skillPreview.attention_points.slice(0, 3)}
                      testId="preview-attention-skills"
                      tone="warning"
                    />
                  </div>
                ) : (
                  <p className="mt-1.5 text-sm text-[hsl(var(--text-muted))]">
                    Skills ainda não disponíveis.
                  </p>
                )}
              </SectionCard>

              <SectionCard testId="preview-resume">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <SectionLabel>Currículo</SectionLabel>
                    <p className="mt-1 truncate text-sm text-[hsl(var(--text-muted))]">
                      {primaryResume?.current_file_name ?? primaryResume?.title ?? "Currículo não enviado"}
                    </p>
                  </div>
                  {primaryResume ? (
                    <button
                      type="button"
                      onClick={openResume}
                      data-testid="preview-open-resume"
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-xs font-semibold text-[hsl(var(--text))] transition-colors hover:bg-[hsl(var(--surface-muted))]"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Ver currículo
                    </button>
                  ) : null}
                </div>
              </SectionCard>

              <SectionCard testId="preview-pendencies">
                <SectionLabel>Pendências</SectionLabel>
                {pendencies.length > 0 ? (
                  <ul className="mt-1.5 space-y-1">
                    {pendencies.map((pendency) => (
                      <li key={pendency.id} className="flex items-center gap-1.5 text-sm">
                        <span
                          className={[
                            "h-1.5 w-1.5 rounded-full",
                            pendency.tone === "warning"
                              ? "bg-[hsl(var(--warning))]"
                              : "bg-[hsl(var(--primary))]",
                          ].join(" ")}
                        />
                        <span className="text-[hsl(var(--text-muted))]">{pendency.label}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1.5 text-sm text-[hsl(var(--text-muted))]">Nenhuma pendência.</p>
                )}
              </SectionCard>

              <SectionCard testId="preview-last-note">
                <SectionLabel>Última observação</SectionLabel>
                {lastNote ? (
                  <p className="mt-1.5 line-clamp-3 text-sm text-[hsl(var(--text-muted))]">
                    {lastNote.note_text}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">
                    Nenhuma observação registrada.
                  </p>
                )}
              </SectionCard>

              <SectionCard testId="preview-latest-movement">
                <SectionLabel>Última movimentação</SectionLabel>
                <p className="mt-1.5 text-sm text-[hsl(var(--text-muted))]">
                  {latestMovement ?? "Nenhuma movimentação recente."}
                </p>
              </SectionCard>

              <SectionCard testId="preview-next-action">
                <SectionLabel>Próxima ação sugerida</SectionLabel>
                <p className="mt-1.5 text-sm font-medium text-[hsl(var(--text))]">
                  {nextAction.label}
                </p>
                <p className="text-xs text-[hsl(var(--text-muted))]">{nextAction.hint}</p>
              </SectionCard>
            </div>

            <div className="flex gap-3 border-t border-[hsl(var(--border))] p-5">
              <button
                type="button"
                onClick={openFullProfile}
                data-testid="preview-open-full"
                className="flex-1 rounded-lg bg-[hsl(var(--primary))] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[hsl(var(--primary))]/90"
              >
                Abrir perfil completo
              </button>
              <button
                type="button"
                onClick={onClose}
                data-testid="preview-close-action"
                className="rounded-lg border border-[hsl(var(--border))] px-4 py-2.5 text-sm font-medium text-[hsl(var(--text-muted))] transition-colors hover:bg-[hsl(var(--surface-muted))]"
              >
                Fechar
              </button>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}

function PreviewSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-5" data-testid="preview-skeleton">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-[hsl(var(--surface-muted))]" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-3/4 rounded bg-[hsl(var(--surface-muted))]" />
          <div className="h-3 w-1/2 rounded bg-[hsl(var(--surface-muted))]" />
        </div>
      </div>
      {[1, 2, 3].map((item) => (
        <div key={item} className="space-y-2">
          <div className="h-3 w-1/4 rounded bg-[hsl(var(--surface-muted))]" />
          <div className="h-4 w-3/4 rounded bg-[hsl(var(--surface-muted))]" />
        </div>
      ))}
    </div>
  );
}

function SectionCard({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <div
      data-testid={testId}
      className="rounded-lg border border-[hsl(var(--border))]/70 bg-[hsl(var(--bg))]/60 p-3"
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
      {children}
    </p>
  );
}

function SkillList({
  title,
  items,
  testId,
  tone = "default",
}: {
  title: string;
  items: string[];
  testId: string;
  tone?: "default" | "warning";
}) {
  if (items.length === 0) return null;

  return (
    <div data-testid={testId}>
      <p className="text-xs font-medium text-[hsl(var(--text-muted))]">{title}</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item}
            className={[
              "rounded-full px-2 py-0.5 text-xs font-medium",
              tone === "warning"
                ? "bg-amber-50 text-amber-800"
                : "bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]",
            ].join(" ")}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
