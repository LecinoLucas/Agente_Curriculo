import { Button } from "@/components/ui/button";
import type { DealBreaker, JobFormValues } from "../../../types/domain";
import { SectionCard } from "../../../shared/components/layout/SectionCard";
import { Field } from "../../../shared/components/forms/Field";
import { DEAL_BREAKER_FIELDS, DEAL_BREAKER_OPERATORS, type DealBreakerDraft } from "../utils/dealBreakerHelpers";

type JobFormDealBreakersStepProps = {
  form: JobFormValues;
  dealBreakerDraft: DealBreakerDraft;
  onFormChange: (updates: Partial<JobFormValues>) => void;
  onDealBreakerDraftChange: (updates: Partial<DealBreakerDraft>) => void;
  onAddDealBreaker: () => void;
};

export function JobFormDealBreakersStep({
  form,
  dealBreakerDraft,
  onFormChange,
  onDealBreakerDraftChange,
  onAddDealBreaker,
}: JobFormDealBreakersStepProps) {
  return (
    <div className="space-y-6">
      <SectionCard
        title="Critérios eliminatórios"
        description="Use com parcimônia. Esses critérios servem para bloquear casos realmente incompatíveis."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Campo">
            <select
              value={dealBreakerDraft.field}
              onChange={(event) =>
                onDealBreakerDraftChange({
                  field: event.target.value,
                  operator: (DEAL_BREAKER_OPERATORS[event.target.value] ?? ["equals"])[0],
                })
              }
              className="ui-input h-11 rounded-xl px-3 text-sm"
            >
              <option value="">Selecione</option>
              {DEAL_BREAKER_FIELDS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Operador">
            <select
              value={dealBreakerDraft.operator}
              onChange={(event) =>
                onDealBreakerDraftChange({
                  operator: event.target.value as DealBreaker["operator"],
                })
              }
              className="ui-input h-11 rounded-xl px-3 text-sm"
            >
              {(DEAL_BREAKER_OPERATORS[dealBreakerDraft.field] ?? ["equals"]).map((operator) => (
                <option key={operator} value={operator}>
                  {operator}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Valor">
            <input
              value={dealBreakerDraft.value}
              onChange={(event) =>
                onDealBreakerDraftChange({
                  value: event.target.value,
                })
              }
              className="ui-input h-11 rounded-xl px-3 text-sm"
              placeholder="Ex: remoto, inglês, 5 anos"
            />
          </Field>
          <Field label="Motivo do bloqueio">
            <input
              value={dealBreakerDraft.reason}
              onChange={(event) =>
                onDealBreakerDraftChange({
                  reason: event.target.value,
                })
              }
              className="ui-input h-11 rounded-xl px-3 text-sm"
              placeholder="Explique por que esse critério elimina"
            />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="button" onClick={onAddDealBreaker}>
            Adicionar critério eliminatório
          </Button>
          <span className="text-xs text-[hsl(var(--text-muted))]">
            Exemplo: modelo de trabalho diferente de remoto.
          </span>
        </div>
      </SectionCard>

      <SectionCard
        title="Deal breakers configurados"
        description="Revise os critérios ativos antes de publicar."
      >
        <div className="space-y-3">
          {(form.deal_breakers ?? []).map((rule, index) => (
            <div
              key={`${rule.field}-${rule.reason}-${index}`}
              className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/40 p-4"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[hsl(var(--text))]">
                    {rule.field} • {rule.operator}
                  </p>
                  <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
                    Valor: {rule.value ?? rule.values?.join(", ") ?? "—"}
                  </p>
                  <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">
                    Motivo: {rule.reason}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      onFormChange({
                        deal_breakers: (form.deal_breakers ?? []).map((item, itemIndex) =>
                          itemIndex === index ? { ...item, is_active: !item.is_active } : item,
                        ),
                      })
                    }
                  >
                    {rule.is_active ? "Desativar" : "Ativar"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      onFormChange({
                        deal_breakers: (form.deal_breakers ?? []).filter(
                          (_, itemIndex) => itemIndex !== index,
                        ),
                      })
                    }
                  >
                    Remover
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {(form.deal_breakers ?? []).length === 0 ? (
            <p className="text-sm text-[hsl(var(--text-muted))]">
              Nenhum critério eliminatório configurado.
            </p>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
