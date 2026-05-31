import { CalendarDays, CircleDollarSign } from "lucide-react";

import type { PreAdmissionCase, PreAdmissionStatus } from "../../../../types/domain";
import { PRE_ADMISSION_STATUS_LABELS as preAdmissionStatusLabels } from "../../../../shared/status/statusLabels";

function formatSalary(value: PreAdmissionCase["salary_offer"]): string {
  if (value == null || value === "") return "Não informado";
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) return String(value);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(numberValue);
}

function formatDate(value: string | null): string {
  if (!value) return "Não informada";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

interface PreAdmissionStatusCardProps {
  preAdmissionCase: PreAdmissionCase;
  updating: boolean;
  onStatusChange: (status: PreAdmissionStatus) => void;
}

export function PreAdmissionStatusCard({
  preAdmissionCase,
  updating,
  onStatusChange,
}: PreAdmissionStatusCardProps) {
  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Status
          </p>
          <h3 className="mt-1 text-base font-semibold text-text">
            {preAdmissionStatusLabels[preAdmissionCase.status]}
          </h3>
        </div>
        <label className="block space-y-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Atualizar status
          </span>
          <select
            value={preAdmissionCase.status}
            onChange={(event) => onStatusChange(event.target.value as PreAdmissionStatus)}
            disabled={updating}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm disabled:opacity-60 sm:w-64"
          >
            {Object.entries(preAdmissionStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="flex items-start gap-2 rounded-md border border-border bg-surface-muted/30 p-3">
          <CircleDollarSign className="mt-0.5 h-4 w-4 text-[hsl(var(--primary))]" />
          <div>
            <div className="text-[11px] font-semibold uppercase text-text-muted">Oferta</div>
            <div className="mt-1 text-sm font-medium text-text">
              {formatSalary(preAdmissionCase.salary_offer)}
            </div>
          </div>
        </div>
        <div className="flex items-start gap-2 rounded-md border border-border bg-surface-muted/30 p-3">
          <CalendarDays className="mt-0.5 h-4 w-4 text-[hsl(var(--primary))]" />
          <div>
            <div className="text-[11px] font-semibold uppercase text-text-muted">
              Data prevista
            </div>
            <div className="mt-1 text-sm font-medium text-text">
              {formatDate(preAdmissionCase.start_date)}
            </div>
          </div>
        </div>
      </div>

      {preAdmissionCase.work_model || preAdmissionCase.notes ? (
        <div className="mt-4 rounded-md border border-border bg-surface-muted/30 p-3 text-sm text-text-muted">
          {preAdmissionCase.work_model ? <p>Modelo: {preAdmissionCase.work_model}</p> : null}
          {preAdmissionCase.notes ? <p className="mt-1">{preAdmissionCase.notes}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
