import { useParams } from "react-router-dom";

import { EmptyState } from "@/components/common/EmptyState";
import { AdmissionProtheusIntegrationPanel } from "../features/admission-workspace/AdmissionProtheusIntegrationPanel";

export function AdmissionIntegrationPlaceholderPage() {
  const { caseId } = useParams<{ caseId: string }>();

  if (!caseId) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon="⚠️"
          title="Caso admissional não informado"
          description="Abra a integração a partir de um caso válido de pré-admissão."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-page="admission-integration-placeholder">
      <AdmissionProtheusIntegrationPanel caseId={caseId} />
    </div>
  );
}
