import { Button } from "@/components/ui/button";
import type { DealBreaker, JobFormValues, JobSkill } from "../../../types/domain";
import type { PendingJobSkill } from "../jobFormConfig";
import { SectionCard } from "../../../shared/components/layout/SectionCard";
import { Field } from "../../../shared/components/forms/Field";
import { DEAL_BREAKER_FIELDS, DEAL_BREAKER_OPERATORS, type DealBreakerDraft } from "../utils/dealBreakerHelpers";
import { SkillSection } from "../components/SkillSection";
import type { SkillCatalog } from "../../../services/skillsService";

type JobFormDealBreakersStepProps = {
  form: JobFormValues;
  eliminatorySkills: Array<JobSkill | PendingJobSkill>;
  availableSkills: SkillCatalog[];
  skillSearch: string;
  onSearchChange: (value: string) => void;
  skillCategoryFilter: string;
  onSkillCategoryFilterChange: (value: string) => void;
  skillCategoryOptions: string[];
  skillTypeFilter: string;
  onSkillTypeFilterChange: (value: string) => void;
  skillTypeOptions: string[];
  savingSkillId: string | null;
  onAddSkill: (
    skill: SkillCatalog | string,
    priorityLevel: "priority" | "complementary" | "eliminatory",
  ) => Promise<void>;
  onUpdateSkill: (skill: JobSkill | PendingJobSkill, patch: Partial<PendingJobSkill>) => Promise<void>;
  onRemoveSkill: (skill: JobSkill | PendingJobSkill) => Promise<void>;
  dealBreakerDraft: DealBreakerDraft;
  onFormChange: (updates: Partial<JobFormValues>) => void;
  onDealBreakerDraftChange: (updates: Partial<DealBreakerDraft>) => void;
  onAddDealBreaker: () => void;
  onSkillCreated: (skill: SkillCatalog) => void;
};

export function JobFormDealBreakersStep({
  form,
  eliminatorySkills,
  availableSkills,
  skillSearch,
  onSearchChange,
  skillCategoryFilter,
  onSkillCategoryFilterChange,
  skillCategoryOptions,
  skillTypeFilter,
  onSkillTypeFilterChange,
  skillTypeOptions,
  savingSkillId,
  onAddSkill,
  onUpdateSkill,
  onRemoveSkill,
  dealBreakerDraft,
  onFormChange,
  onDealBreakerDraftChange,
  onAddDealBreaker,
  onSkillCreated,
}: JobFormDealBreakersStepProps) {
  return (
    <div className="space-y-6">
      <SkillSection
        title="Critérios eliminatórios"
        description="Use apenas para critérios que realmente impedem a contratação."
        emphasis={`${eliminatorySkills.length} skill(s) eliminatória(s)`}
        availableSkills={availableSkills}
        linkedSkills={eliminatorySkills}
        search={skillSearch}
        onSearchChange={onSearchChange}
        categoryFilter={skillCategoryFilter}
        onCategoryFilterChange={onSkillCategoryFilterChange}
        categoryOptions={skillCategoryOptions}
        typeFilter={skillTypeFilter}
        onTypeFilterChange={onSkillTypeFilterChange}
        typeOptions={skillTypeOptions}
        addLabel="Eliminatória"
        addPriorityLevel="eliminatory"
        savingSkillId={savingSkillId}
        onAddSkill={onAddSkill}
        onUpdateSkill={onUpdateSkill}
        onRemoveSkill={onRemoveSkill}
        onSkillCreated={onSkillCreated}
        jobContext={{ title: form.title, jobArea: form.job_area }}
      />

      <SectionCard
        title="Regras eliminatórias"
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
          <span className="text-xs text-text-muted">
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
              className="rounded-2xl border border-border bg-surface-muted/40 p-4"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-text">
                    {rule.field} • {rule.operator}
                  </p>
                  <p className="mt-1 text-sm text-text-muted">
                    Valor: {rule.value ?? rule.values?.join(", ") ?? "—"}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
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
            <p className="text-sm text-text-muted">
              Nenhum critério eliminatório configurado.
            </p>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
