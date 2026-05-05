import { KanbanSquare, Pencil, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { buildJobQualitySummary, formatSalary } from "../jobFormConfig";
import { StatusPill } from "../../../components/common/StatusPill";
import { DetailCard } from "./DetailCard";
import { NarrativeCard } from "./NarrativeCard";
import { qualityNeedsAttention } from "../utils/jobsPageHelpers";
import type { Job } from "../../../types/domain";
import {
  formatEducationLevel,
  formatJobStatus,
  formatSeniority,
  formatWorkModel,
  jobStatusTone,
} from "../../../utils/jobFormatters";

interface JobDetailPanelProps {
  job: Job;
  canManage: boolean;
  onNavigateEdit: (jobId: string) => void;
  onNavigatePipeline: (jobId: string) => void;
}

export function JobDetailPanel({
  job,
  canManage,
  onNavigateEdit,
  onNavigatePipeline,
}: JobDetailPanelProps) {
  return (
    <Card className="overflow-hidden rounded-3xl">
      <CardContent className="p-0">
        <div className="flex flex-col gap-4 border-b border-[hsl(var(--border))] px-6 py-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-semibold text-[hsl(var(--text))]">{job.title}</h3>
              <StatusPill label={formatJobStatus(job.status)} tone={jobStatusTone(job.status)} />
            </div>
            <p className="max-w-3xl text-sm leading-6 text-[hsl(var(--text-muted))]">{job.description}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => onNavigatePipeline(job.id)}>
              <KanbanSquare className="mr-2 h-4 w-4" />
              Abrir pipeline
            </Button>
            {canManage ? (
              <Button type="button" onClick={() => onNavigateEdit(job.id)}>
                <Pencil className="mr-2 h-4 w-4" />
                Editar vaga
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 px-6 py-6 md:grid-cols-2 xl:grid-cols-4">
          <DetailCard label="Qualidade">
            {buildJobQualitySummary(job) ? (
              <JobQualityBadge quality={buildJobQualitySummary(job)} />
            ) : (
              <span className="text-sm text-[hsl(var(--text-muted))]">Sem avaliação</span>
            )}
          </DetailCard>

          <DetailCard label="Perfil">
            <p>{formatSeniority(job.seniority_level)}</p>
            <p className="text-[hsl(var(--text-muted))]">{formatWorkModel(job.work_model)}</p>
          </DetailCard>

          <DetailCard label="Base mínima">
            <p>{formatEducationLevel(job.minimum_education_level)}</p>
            <p className="text-[hsl(var(--text-muted))]">
              {job.minimum_years_experience != null
                ? `${job.minimum_years_experience} ano(s) de experiência`
                : "Experiência não definida"}
            </p>
          </DetailCard>

          <DetailCard label="Local e faixa">
            <p>{job.location ?? "Localização não definida"}</p>
            <p className="text-[hsl(var(--text-muted))]">{formatSalary(job)}</p>
          </DetailCard>
        </div>

        {job.requirements || job.responsibilities || job.experience_context ? (
          <div className="grid gap-4 border-t border-[hsl(var(--border))] px-6 py-6 lg:grid-cols-3">
            {job.requirements ? <NarrativeCard title="Requisitos" text={job.requirements} /> : null}
            {job.responsibilities ? (
              <NarrativeCard title="Responsabilidades" text={job.responsibilities} />
            ) : null}
            {job.experience_context ? (
              <NarrativeCard title="Contexto de experiência" text={job.experience_context} />
            ) : null}
          </div>
        ) : null}

        {job.behavioral_requirements?.length ? (
          <div className="border-t border-[hsl(var(--border))] px-6 py-6">
            <p className="text-sm font-semibold text-[hsl(var(--text))]">Requisitos comportamentais</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {job.behavioral_requirements.map((item) => (
                <StatusPill key={item} label={item} tone="neutral" />
              ))}
            </div>
          </div>
        ) : null}

        {qualityNeedsAttention(job) ? (
          <div className="border-t border-[hsl(var(--border))] px-6 py-6">
            <div className="rounded-2xl border border-[hsl(var(--warning))]/15 bg-[hsl(var(--warning-soft))]/35 px-4 py-4 text-sm text-[hsl(var(--warning))]">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">Vale revisar a estrutura desta vaga</p>
                  <p className="mt-1 opacity-90">
                    Use a página de edição para completar requisitos mínimos, skills obrigatórias e checklist de
                    publicação.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// Import JobQualityBadge locally to avoid circular dependency
import { JobQualityBadge } from "../../../components/job/JobQualityBadge";
