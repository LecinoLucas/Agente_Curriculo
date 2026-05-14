import type { AdmissionPackageValidationError } from "../../../../types/domain";

interface Props {
  errors: AdmissionPackageValidationError[];
}

export function AdmissionPackageValidationList({ errors }: Props) {
  if (!errors || errors.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4">
      <h4 className="mb-3 font-semibold text-red-900">Erros de Validação</h4>
      <ul className="space-y-2">
        {errors.map((error, idx) => (
          <li key={idx} className="text-sm text-red-700">
            <span className="font-medium">{error.field}:</span> {error.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
