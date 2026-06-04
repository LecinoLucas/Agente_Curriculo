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
      <div className="p-6">
        <EmptyState
          icon="🧭"
          title="Caso admissional não informado"
          description="Abra a tela a partir de um caso válido de pré-admissão."
        />
      </div>
    );
  }

  return (
    <AdmissionCaseWorkspacePanel
      caseId={caseId}
      integrationHref={integrationHref}
      openPageHref="/admitidos"
    />
  );
}
