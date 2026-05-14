import type { AdmissionPackagePayload } from "../../../../types/domain";

interface Props {
  payload: AdmissionPackagePayload;
  readOnly?: boolean;
}

export function AdmissionPackagePreview({ payload, readOnly = false }: Props) {
  if (!payload) {
    return null;
  }

  return (
    <div className="space-y-6 rounded-lg border border-gray-200 bg-white p-6">
      {/* Candidato */}
      <section>
        <h3 className="mb-3 font-semibold text-gray-900">Candidato</h3>
        <dl className="space-y-2">
          <div className="flex justify-between">
            <dt className="text-sm font-medium text-gray-700">Nome:</dt>
            <dd className="text-sm text-gray-900">{payload.candidate.full_name || "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sm font-medium text-gray-700">Email:</dt>
            <dd className="text-sm text-gray-900">{payload.candidate.email || "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sm font-medium text-gray-700">Telefone:</dt>
            <dd className="text-sm text-gray-900">{payload.candidate.phone || "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sm font-medium text-gray-700">CPF:</dt>
            <dd className="text-sm text-gray-900">{payload.candidate.cpf || "—"}</dd>
          </div>
        </dl>
      </section>

      {/* Vaga */}
      <section>
        <h3 className="mb-3 font-semibold text-gray-900">Vaga</h3>
        <dl className="space-y-2">
          <div className="flex justify-between">
            <dt className="text-sm font-medium text-gray-700">Título:</dt>
            <dd className="text-sm text-gray-900">{payload.job.title || "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sm font-medium text-gray-700">Empresa:</dt>
            <dd className="text-sm text-gray-900">{payload.job.company || "—"}</dd>
          </div>
        </dl>
      </section>

      {/* Pré-admissão */}
      <section>
        <h3 className="mb-3 font-semibold text-gray-900">Pré-admissão</h3>
        <dl className="space-y-2">
          <div className="flex justify-between">
            <dt className="text-sm font-medium text-gray-700">Data de Início:</dt>
            <dd className="text-sm text-gray-900">
              {payload.pre_admission.start_date || "—"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sm font-medium text-gray-700">Salário Ofertado:</dt>
            <dd className="text-sm text-gray-900">
              {payload.pre_admission.salary_offer
                ? new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  }).format(payload.pre_admission.salary_offer)
                : "—"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sm font-medium text-gray-700">Regime:</dt>
            <dd className="text-sm text-gray-900">
              {payload.pre_admission.work_model || "—"}
            </dd>
          </div>
        </dl>
      </section>

      {/* Decisão */}
      <section>
        <h3 className="mb-3 font-semibold text-gray-900">Decisão</h3>
        <dl className="space-y-2">
          <div className="flex justify-between">
            <dt className="text-sm font-medium text-gray-700">Resultado:</dt>
            <dd className="text-sm text-gray-900">
              {payload.decision.decision_outcome || "—"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sm font-medium text-gray-700">Motivo:</dt>
            <dd className="text-sm text-gray-900">{payload.decision.reason_code || "—"}</dd>
          </div>
        </dl>
      </section>

      {/* Documentos */}
      {payload.documents && payload.documents.length > 0 && (
        <section>
          <h3 className="mb-3 font-semibold text-gray-900">
            Documentos ({payload.documents.length})
          </h3>
          <ul className="space-y-1 text-sm">
            {payload.documents.map((doc) => (
              <li key={doc.document_id} className="flex items-center justify-between">
                <span className="text-gray-700">{doc.title}</span>
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    doc.status === "approved"
                      ? "bg-green-100 text-green-800"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {doc.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
