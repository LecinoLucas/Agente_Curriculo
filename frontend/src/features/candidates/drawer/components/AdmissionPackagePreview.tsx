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
    <div className="space-y-6 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/25 p-5">
      {/* Candidato */}
      <section>
        <h3 className="mb-3 font-semibold text-[hsl(var(--text))]">Candidato</h3>
        <dl className="space-y-2">
          <div className="flex justify-between">
            <dt className="text-sm font-medium text-[hsl(var(--text-muted))]">Nome:</dt>
            <dd className="text-sm text-[hsl(var(--text))]">{payload.candidate.full_name || "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sm font-medium text-[hsl(var(--text-muted))]">Email:</dt>
            <dd className="text-sm text-[hsl(var(--text))]">{payload.candidate.email || "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sm font-medium text-[hsl(var(--text-muted))]">Telefone:</dt>
            <dd className="text-sm text-[hsl(var(--text))]">{payload.candidate.phone || "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sm font-medium text-[hsl(var(--text-muted))]">CPF:</dt>
            <dd className="text-sm text-[hsl(var(--text))]">{payload.candidate.cpf || "—"}</dd>
          </div>
        </dl>
      </section>

      {/* Vaga */}
      <section>
        <h3 className="mb-3 font-semibold text-[hsl(var(--text))]">Vaga</h3>
        <dl className="space-y-2">
          <div className="flex justify-between">
            <dt className="text-sm font-medium text-[hsl(var(--text-muted))]">Título:</dt>
            <dd className="text-sm text-[hsl(var(--text))]">{payload.job.title || "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sm font-medium text-[hsl(var(--text-muted))]">Empresa:</dt>
            <dd className="text-sm text-[hsl(var(--text))]">{payload.job.company || "—"}</dd>
          </div>
        </dl>
      </section>

      {/* Pré-admissão */}
      <section>
        <h3 className="mb-3 font-semibold text-[hsl(var(--text))]">Pré-admissão</h3>
        <dl className="space-y-2">
          <div className="flex justify-between">
            <dt className="text-sm font-medium text-[hsl(var(--text-muted))]">Data de Início:</dt>
            <dd className="text-sm text-[hsl(var(--text))]">
              {payload.pre_admission.start_date || "—"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sm font-medium text-[hsl(var(--text-muted))]">Salário Ofertado:</dt>
            <dd className="text-sm text-[hsl(var(--text))]">
              {payload.pre_admission.salary_offer
                ? new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  }).format(payload.pre_admission.salary_offer)
                : "—"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sm font-medium text-[hsl(var(--text-muted))]">Regime:</dt>
            <dd className="text-sm text-[hsl(var(--text))]">
              {payload.pre_admission.work_model || "—"}
            </dd>
          </div>
        </dl>
      </section>

      {/* Decisão */}
      <section>
        <h3 className="mb-3 font-semibold text-[hsl(var(--text))]">Decisão</h3>
        <dl className="space-y-2">
          <div className="flex justify-between">
            <dt className="text-sm font-medium text-[hsl(var(--text-muted))]">Resultado:</dt>
            <dd className="text-sm text-[hsl(var(--text))]">
              {payload.decision.decision_outcome || "—"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sm font-medium text-[hsl(var(--text-muted))]">Motivo:</dt>
            <dd className="text-sm text-[hsl(var(--text))]">{payload.decision.reason_code || "—"}</dd>
          </div>
        </dl>
      </section>

      {/* Documentos */}
      {payload.documents && payload.documents.length > 0 && (
        <section>
          <h3 className="mb-3 font-semibold text-[hsl(var(--text))]">
            Documentos ({payload.documents.length})
          </h3>
          <ul className="space-y-1 text-sm">
            {payload.documents.map((doc) => (
              <li key={doc.document_id} className="flex items-center justify-between">
                <span className="text-[hsl(var(--text-muted))]">{doc.title}</span>
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    doc.status === "approved"
                      ? "bg-[hsl(var(--success-soft))] text-[hsl(var(--success))]"
                      : "bg-[hsl(var(--surface-muted))] text-[hsl(var(--text-muted))]"
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
