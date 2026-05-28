import type { FormData, ApplicationErrors } from "../types";

interface Props {
  form: FormData;
  errors: ApplicationErrors;
  onChange: (field: keyof FormData, value: unknown) => void;
}

export function ReviewStep({ form, errors, onChange }: Props) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[hsl(var(--primary))]">Consentimento</p>
        <h2 className="text-2xl font-semibold tracking-tight text-text">Revise e conclua sua candidatura</h2>
      </div>

      <div className="space-y-3 rounded-3xl bg-gray-50 p-5">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium text-gray-700">Nome:</span>
            <p className="text-gray-900">{form.fullName}</p>
          </div>
          <div>
            <span className="font-medium text-gray-700">CPF:</span>
            <p className="text-gray-900">{form.cpf}</p>
          </div>
          <div>
            <span className="font-medium text-gray-700">E-mail:</span>
            <p className="text-gray-900">{form.email}</p>
          </div>
          <div>
            <span className="font-medium text-gray-700">Telefone:</span>
            <p className="text-gray-900">{form.phone}</p>
          </div>
          <div>
            <span className="font-medium text-gray-700">Localização:</span>
            <p className="text-gray-900">
              {form.city}, {form.state}
            </p>
          </div>
          <div>
            <span className="font-medium text-gray-700">Regime:</span>
            <p className="text-gray-900">{form.desiredContractType}</p>
          </div>
        </div>

        <div className="border-t pt-3">
          <span className="font-medium text-gray-700">Pretensão salarial:</span>
          <p className="text-gray-900">{form.salaryExpectation}</p>
        </div>

        {form.jobId && (
          <div className="border-t pt-3">
            <span className="font-medium text-gray-700">Vaga:</span>
            <p className="text-gray-900">{form.jobId}</p>
          </div>
        )}

        {form.resumeFile && (
          <div className="border-t pt-3">
            <span className="font-medium text-gray-700">Currículo:</span>
            <p className="text-gray-900">{form.resumeFile.name}</p>
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-blue-200 bg-blue-50 p-4">
        <label htmlFor="candidate-lgpd-consent" className="flex gap-3">
          <input
            id="candidate-lgpd-consent"
            type="checkbox"
            checked={form.lgpdConsent}
            onChange={(e) => onChange("lgpdConsent", e.target.checked)}
            className="mt-1 h-4 w-4 rounded"
          />
          <span className="text-sm text-gray-700">
            Ao enviar sua candidatura, você autoriza o uso dos dados informados exclusivamente para fins de
            recrutamento e seleção, conforme a LGPD. <strong>*</strong>
          </span>
        </label>
        {errors.lgpdConsent && <p className="mt-2 text-sm text-red-600">{errors.lgpdConsent}</p>}
      </div>

      <div className="rounded-2xl bg-gray-100 p-3 text-xs text-gray-700">
        Após o envio, o portal do candidato continuará disponível para acompanhar o processo, atualizar currículo e receber comunicações.
      </div>
    </div>
  );
}
