import type { FormData, ApplicationErrors } from "../types";

interface Props {
  form: FormData;
  errors: ApplicationErrors;
  onChange: (field: keyof FormData, value: unknown) => void;
}

export function ReviewStep({ form, errors, onChange }: Props) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">Revisão da candidatura</h2>

      {/* Resumo de dados */}
      <div className="space-y-3 rounded-lg bg-gray-50 p-4">
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

        {form.salaryExpectation && (
          <div className="border-t pt-3">
            <span className="font-medium text-gray-700">Pretensão salarial:</span>
            <p className="text-gray-900">{form.salaryExpectation}</p>
          </div>
        )}

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

      {/* LGPD Consent */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <label className="flex gap-3">
          <input
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

      {/* Warning */}
      <div className="rounded-lg bg-gray-100 p-3 text-xs text-gray-700">
        ✓ Após enviar, você receberá uma confirmação. Nossa equipe entrará em contato conforme disponibilidade.
      </div>
    </div>
  );
}
