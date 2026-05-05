import { SectionCard } from "../../../shared/components/layout/SectionCard";
import { Field } from "../../../shared/components/forms/Field";
import type { JobFormValues } from "../jobFormConfig";
import { JOB_AREA_OPTIONS, PRIORITY_OPTIONS } from "../jobFormConfig";

type JobFormBasicStepProps = {
  form: JobFormValues;
  onFormChange: (updates: Partial<JobFormValues>) => void;
};

export function JobFormBasicStep({ form, onFormChange }: JobFormBasicStepProps) {
  return (
    <div className="space-y-6">
      <SectionCard
        title="Dados básicos"
        description="Apresente a oportunidade de forma objetiva para dar contexto ao matching."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Título da vaga *">
            <input
              value={form.title}
              onChange={(event) => onFormChange({ title: event.target.value })}
              className="ui-input h-11 rounded-xl px-3 text-sm"
              placeholder="Ex: Analista de Dados Pleno"
            />
          </Field>
          <Field label="Área *">
            <select
              value={form.job_area}
              onChange={(event) => onFormChange({ job_area: event.target.value })}
              className="ui-input h-11 rounded-xl px-3 text-sm"
            >
              <option value="">Selecione</option>
              {JOB_AREA_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Senioridade *">
            <select
              value={form.seniority_level}
              onChange={(event) => onFormChange({ seniority_level: event.target.value })}
              className="ui-input h-11 rounded-xl px-3 text-sm"
            >
              <option value="">Selecione</option>
              <option value="intern">Estagiário</option>
              <option value="junior">Júnior</option>
              <option value="mid">Pleno</option>
              <option value="senior">Sênior</option>
              <option value="lead">Lead</option>
              <option value="principal">Principal</option>
              <option value="director">Diretor</option>
            </select>
          </Field>
          <Field label="Prioridade">
            <select
              value={form.priority}
              onChange={(event) =>
                onFormChange({ priority: event.target.value as JobFormValues["priority"] })
              }
              className="ui-input h-11 rounded-xl px-3 text-sm"
            >
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Descrição curta *">
          <textarea
            value={form.description}
            onChange={(event) => onFormChange({ description: event.target.value })}
            className="ui-input min-h-40 rounded-2xl px-3 py-3 text-sm"
            placeholder="Explique a missão principal da vaga, contexto do time e objetivo da contratação."
          />
        </Field>
      </SectionCard>
    </div>
  );
}
