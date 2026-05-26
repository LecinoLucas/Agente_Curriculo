import { useMemo } from "react";
import { useParams } from "react-router-dom";

import { EmptyState } from "@/components/common/EmptyState";
import { AdmissionCaseWorkspacePanel } from "../features/admission-workspace/AdmissionCaseWorkspacePanel";

export function AdmissionCasePage() {
  const { caseId } = useParams<{ caseId: string }>();

  const integrationHref = useMemo(
    () => (caseId ? `/admission/cases/${caseId}/integration` : null),
    [caseId],
  );

  if (!caseId) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon="🧭"
          title="Caso admissional não informado"
          description="Abra a tela a partir de um caso válido de pré-admissão."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5" data-page="admission-case-workspace">
      <div className="max-w-4xl space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--text-muted))]">
          Pré-admissão
        </p>
        <h1 className="text-2xl font-semibold text-[hsl(var(--text))] tracking-normal">
          Caso admissional
        </h1>
        <p className="text-sm text-[hsl(var(--text-muted))]">
          Checklist, documentos, pendências e gate Protheus em uma visão operacional.
        </p>
      </div>

      <AdmissionCaseWorkspacePanel
        caseId={caseId}
        integrationHref={integrationHref}
      />
    </div>
  );
}
