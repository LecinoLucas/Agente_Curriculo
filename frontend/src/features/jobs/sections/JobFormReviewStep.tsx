import { CheckCircle2, ShieldAlert, ArrowRight } from "lucide-react";
import type { JobQualityResult, JobSkill } from "../../../types/domain";
import { SectionCard } from "../../../shared/components/layout/SectionCard";
import { ReviewItem } from "../../../shared/components/data-display/ReviewItem";
import { MessageList } from "../../../shared/components/feedback/MessageList";
import { PRIORITY_OPTIONS, formatJobArea, type JobFormValues, type PendingJobSkill, formatPublicationBlocker } from "../jobFormConfig";
import {
  formatEducationLevel,
  formatSeniority,
  formatWorkModel,
} from "../../../utils/jobFormatters";
import { JobQualityBadge } from "../../../components/job/JobQualityBadge";
import { getPanelToneClasses } from "../utils/publicationState";
import { Button } from "../../../components/ui/button";
import type { MacroStepId } from "../../../pages/JobFormPage";

type JobFormReviewStepProps = {
  form: JobFormValues;
  mandatorySkills: Array<JobSkill | PendingJobSkill>;
  optionalSkills: Array<JobSkill | PendingJobSkill>;
  eliminatorySkills: Array<JobSkill | PendingJobSkill>;
  jobQuality: JobQualityResult | null;
  backendPublishErrors: string[];
  selectedTemplateStatus?: "active" | "draft" | "archived" | null;
  frontendBlockers: string[];
  publicationState: { label: string; description: string; tone: "success" | "warning" | "danger" };
  onNavigateToStep: (stepId: MacroStepId) => void;
};

const BLOCKER_STEP_MAP: Record<string, MacroStepId> = {
  job_area: "context",
  seniority_level: "context",
  minimum_years_experience: "requirements",
  priority_skills: "skills",
  behavioral_template_id: "screening",
};

export function JobFormReviewStep({
  form,
  mandatorySkills,
  optionalSkills,
  eliminatorySkills,
  jobQuality,
  backendPublishErrors,
  selectedTemplateStatus,
  frontendBlockers,
  publicationState,
  onNavigateToStep,
}: JobFormReviewStepProps) {
  
  // Deduplicate blockers
  const allBlockersSet = new Set<string>();
  frontendBlockers.forEach(b => allBlockersSet.add(b));
  jobQuality?.publication_blockers?.forEach(b => allBlockersSet.add(b));
  
  const blockingItems = Array.from(allBlockersSet);

  // Group by step for the checklist
  const blockersByStep: Record<MacroStepId, string[]> = {
    context: [],
    requirements: [],
    skills: [],
    screening: [],
    review: [],
  };
  
  blockingItems.forEach(b => {
    const step = BLOCKER_STEP_MAP[b];
    if (step) {
      blockersByStep[step].push(b);
    }
  });

  return (
    <div className="space-y-6" data-testid="step-review">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-3xl border border-border bg-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Painel de qualidade
          </p>
          <div className="mt-4">
            {jobQuality ? (
              <JobQualityBadge quality={jobQuality} />
            ) : (
              <div className="rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm text-text-muted">
                Salve a vaga para calcular a qualidade.
              </div>
            )}
          </div>
          <div
            className={`mt-4 rounded-2xl border px-4 py-4 ${getPanelToneClasses(publicationState.tone)}`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide">
              Status de publicação
            </p>
            <p className="mt-2 text-base font-semibold">{publicationState.label}</p>
            <p className="mt-2 text-sm opacity-90">{publicationState.description}</p>
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-surface p-5">
          <p className="text-sm font-semibold text-text">Resumo da vaga</p>
          <div className="mt-3 grid gap-3 text-sm">
            <ReviewItem label="Título" value={form.title || "—"} />
            <ReviewItem label="Área" value={formatJobArea(form.job_area || null)} />
            <ReviewItem label="Senioridade" value={formatSeniority(form.seniority_level || null)} />
            <ReviewItem label="Essenciais" value={`${mandatorySkills.length}`} />
            <ReviewItem label="Diferenciais" value={`${optionalSkills.length}`} />
            <ReviewItem label="Eliminatórias" value={`${eliminatorySkills.length}`} />
            <ReviewItem label="Deal breakers" value={`${(form.deal_breakers ?? []).filter((item) => item.is_active).length}`} />
          </div>
        </div>
      </div>

      <SectionCard
        title="Checklist por etapa"
        description="Acompanhe as pendências para publicação em cada aba do formulário."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { id: "context" as MacroStepId, label: "Contexto" },
            { id: "requirements" as MacroStepId, label: "Requisitos" },
            { id: "skills" as MacroStepId, label: "Skills" },
            { id: "screening" as MacroStepId, label: "Triagem" },
          ].map(step => {
            const hasBlockers = blockersByStep[step.id].length > 0;
            return (
              <div key={step.id} className="flex flex-col gap-2 rounded-2xl border border-border p-4">
                <div className="flex items-center gap-2">
                  {hasBlockers ? (
                    <ShieldAlert className="h-4 w-4 text-danger" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  )}
                  <span className="font-semibold text-text">{step.label}</span>
                </div>
                <div className="text-xs text-text-muted">
                  {hasBlockers ? `${blockersByStep[step.id].length} pendência(s)` : "Status: OK"}
                </div>
                {hasBlockers && (
                  <Button 
                    variant="link" 
                    className="h-auto p-0 justify-start text-xs mt-2" 
                    onClick={() => onNavigateToStep(step.id)}
                  >
                    Ir para aba <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </SectionCard>

      {(blockingItems.length > 0 || backendPublishErrors.length > 0) && (
        <SectionCard
          title="Pendências bloqueantes"
          description="Resolva os seguintes itens para liberar a publicação da vaga."
        >
          <div className="space-y-3">
            {backendPublishErrors.map((error, idx) => (
              <div key={`backend-${idx}`} className="flex items-center justify-between gap-4 rounded-2xl border border-[hsl(var(--danger))]/15 bg-danger-soft px-4 py-3 text-sm text-danger">
                <span>{error}</span>
              </div>
            ))}
            
            {blockingItems.map(blocker => {
              const step = BLOCKER_STEP_MAP[blocker];
              return (
                <div key={blocker} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 rounded-2xl border border-[hsl(var(--danger))]/15 bg-danger-soft px-4 py-3 text-sm text-danger">
                  <span>{formatPublicationBlocker(blocker)}</span>
                  {step && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="shrink-0 bg-surface text-text hover:bg-surface-muted"
                      onClick={() => onNavigateToStep(step)}
                    >
                      Ir para {step === "context" ? "Contexto" : step === "requirements" ? "Requisitos" : step === "skills" ? "Skills" : "Triagem"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {((jobQuality?.suggestions && jobQuality.suggestions.length > 0) || (jobQuality?.warnings && jobQuality.warnings.length > 0)) && (
        <SectionCard
          title="Sugestões e Avisos"
          description="Orientações opcionais para melhorar a qualidade da vaga."
        >
          <div className="space-y-4">
            {jobQuality?.warnings && jobQuality.warnings.length > 0 ? (
              <MessageList tone="warning" title="Avisos" items={jobQuality.warnings} />
            ) : null}
            {jobQuality?.suggestions && jobQuality.suggestions.length > 0 ? (
              <MessageList tone="warning" title="Sugestões" items={jobQuality.suggestions} />
            ) : null}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
