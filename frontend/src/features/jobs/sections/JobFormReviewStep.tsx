import { CheckCircle2, ShieldAlert } from "lucide-react";
import type { JobQualityResult, JobSkill } from "../../../types/domain";
import { SectionCard } from "../../../shared/components/layout/SectionCard";
import { ReviewItem } from "../../../shared/components/data-display/ReviewItem";
import { SummaryRow } from "../../../shared/components/data-display/SummaryRow";
import { MessageList } from "../../../shared/components/feedback/MessageList";
import { PRIORITY_OPTIONS, trimToNull, formatJobArea, type JobFormValues, type PendingJobSkill } from "../jobFormConfig";
import {
  formatEducationLevel,
  formatSeniority,
  formatWorkModel,
} from "../../../utils/jobFormatters";
import { formatPublicationBlocker } from "../jobFormConfig";

type JobFormReviewStepProps = {
  form: JobFormValues;
  mandatorySkills: Array<JobSkill | PendingJobSkill>;
  optionalSkills: Array<JobSkill | PendingJobSkill>;
  eliminatorySkills: Array<JobSkill | PendingJobSkill>;
  jobQuality: JobQualityResult | null;
  backendPublishErrors: string[];
  selectedTemplateStatus?: "active" | "draft" | "archived" | null;
};

export function JobFormReviewStep({
  form,
  mandatorySkills,
  optionalSkills,
  eliminatorySkills,
  jobQuality,
  backendPublishErrors,
  selectedTemplateStatus,
}: JobFormReviewStepProps) {
  return (
    <div className="space-y-6">
      <SectionCard
        title="Resumo da vaga"
        description="Revise os principais campos antes de salvar ou publicar."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <ReviewItem label="Título" value={form.title || "—"} />
          <ReviewItem label="Área" value={formatJobArea(form.job_area || null)} />
          <ReviewItem label="Senioridade" value={formatSeniority(form.seniority_level || null)} />
          <ReviewItem
            label="Prioridade"
            value={PRIORITY_OPTIONS.find((item) => item.value === form.priority)?.label ?? form.priority}
          />
          <ReviewItem label="Escolaridade mínima" value={formatEducationLevel(form.minimum_education_level || null)} />
          <ReviewItem
            label="Experiência mínima"
            value={form.minimum_years_experience ? `${form.minimum_years_experience} anos` : "—"}
          />
          <ReviewItem label="Modelo de trabalho" value={formatWorkModel(form.work_model || null)} />
          <ReviewItem label="Localização" value={form.location || "—"} />
          <ReviewItem label="Essenciais" value={`${mandatorySkills.length}`} />
          <ReviewItem label="Diferenciais" value={`${optionalSkills.length}`} />
          <ReviewItem label="Skills eliminatórias" value={`${eliminatorySkills.length}`} />
          <ReviewItem label="Deal breakers" value={`${(form.deal_breakers ?? []).filter((item) => item.is_active).length}`} />
        </div>
      </SectionCard>

      <SectionCard
        title="Checklist de publicação"
        description="Esses itens precisam estar corretos para a publicação ser liberada."
      >
        <div className="space-y-2">
          {([
            { ok: trimToNull(form.job_area ?? "") !== null, label: "Área da vaga definida" },
            { ok: trimToNull(form.seniority_level ?? "") !== null, label: "Senioridade definida" },
            { ok: (form.minimum_years_experience ?? 0) > 0, label: "Experiência mínima preenchida" },
            { ok: mandatorySkills.length >= 2, label: "Pelo menos 2 skills essenciais" },
            ...(form.requires_behavioral_assessment
              ? [
                  {
                    ok: selectedTemplateStatus === "active",
                    label:
                      selectedTemplateStatus === "draft"
                        ? "Template comportamental selecionado, mas ainda em rascunho — deve ser publicado"
                        : selectedTemplateStatus === "archived"
                          ? "Template comportamental arquivado — selecione um template ativo"
                          : "Template comportamental ativo selecionado (obrigatório para esta vaga)",
                  },
                ]
              : []),
          ] as { ok: boolean; label: string }[]).map((item) => (
            <div key={item.label} className="flex items-center gap-3 rounded-2xl border border-border px-4 py-3 text-sm">
              {item.ok ? (
                <CheckCircle2 className="h-4 w-4 text-success" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-danger" />
              )}
              <span className={item.ok ? "text-text" : "text-danger"}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Mensagens do backend"
        description="Aqui aparecem bloqueios reais de publicação e orientações de qualidade."
      >
        <div className="space-y-4">
          {backendPublishErrors.length > 0 ? (
            <MessageList tone="danger" title="Publicação bloqueada" items={backendPublishErrors} />
          ) : null}

          {jobQuality?.publication_blockers && jobQuality.publication_blockers.length > 0 ? (
            <MessageList
              tone="danger"
              title="Bloqueios reais"
              items={jobQuality.publication_blockers.map((blocker) => formatPublicationBlocker(blocker))}
            />
          ) : null}

          {jobQuality?.suggestions && jobQuality.suggestions.length > 0 ? (
            <MessageList tone="warning" title="Sugestões" items={jobQuality.suggestions} />
          ) : null}

          {jobQuality?.warnings && jobQuality.warnings.length > 0 ? (
            <MessageList tone="warning" title="Avisos" items={jobQuality.warnings} />
          ) : null}

          {!jobQuality && backendPublishErrors.length === 0 ? (
            <p className="text-sm text-text-muted">
              Salve ou valide a vaga para carregar mensagens do backend.
            </p>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
