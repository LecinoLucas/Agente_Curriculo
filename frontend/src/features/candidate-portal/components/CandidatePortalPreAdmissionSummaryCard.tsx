import { ArrowRight, ClipboardList } from "lucide-react";
import { Link } from "react-router-dom";

import type {
  CandidatePortalPreAdmissionEnvelope,
} from "../../../services/candidatePortalService";
import { processStatusLabel } from "../preAdmissionLabels";

interface CandidatePortalPreAdmissionSummaryCardProps {
  preAdmission: CandidatePortalPreAdmissionEnvelope | null;
}

export function CandidatePortalPreAdmissionSummaryCard({
  preAdmission,
}: CandidatePortalPreAdmissionSummaryCardProps) {
  if (!preAdmission?.summary?.has_pre_admission_case) {
    return null;
  }

  const summary = preAdmission.summary;
  const caseData = preAdmission.case;
  const headline = processStatusLabel(caseData, summary);
  const total = summary.documents_total;
  const approved = summary.documents_approved;

  return (
    <section
      data-testid="candidate-portal-pre-admission-summary"
      className="rounded-2xl border border-[hsl(var(--border)/0.5)] bg-white p-6 shadow-xl"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]">
            <ClipboardList className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold uppercase tracking-widest text-text-muted">
              Pré-admissão
            </p>
            <h2 className="mt-1 text-lg font-bold text-text">{headline}</h2>
            <p className="mt-1 text-sm text-text-muted">
              {approved} de {total} documentos aprovados.
            </p>
            {summary.next_pending_document ? (
              <p className="mt-1 text-xs font-medium text-text-muted">
                Próximo: {summary.next_pending_document}
              </p>
            ) : null}
          </div>
        </div>

        <Link
          to="/candidato/pre-admissao"
          data-testid="candidate-portal-pre-admission-cta"
          className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-bold text-white shadow-sm hover:opacity-90"
        >
          Abrir tela de pré-admissão
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
