import { SectionCard } from "../../../shared/components/layout/SectionCard";
import { Field } from "../../../shared/components/forms/Field";
import type { JobFormValues } from "../jobFormConfig";
import { StringListField } from "../components/StringListField";

type JobFormRequirementsStepProps = {
  form: JobFormValues;
  onFormChange: (updates: Partial<JobFormValues>) => void;
};

export function JobFormRequirementsStep({ form, onFormChange }: JobFormRequirementsStepProps) {
  return (
    <div className="space-y-6">
      <SectionCard
        title="Requisitos mínimos"
        description="Esses campos estruturam o matching mínimo e influenciam diretamente a publicação."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Escolaridade mínima">
            <select
              value={form.minimum_education_level}
              onChange={(event) => onFormChange({ minimum_education_level: event.target.value })}
              className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring h-11 rounded-xl px-3 text-sm"
            >
              <option value="">Selecione</option>
              <option value="none">Nenhuma</option>
              <option value="high_school">Ensino médio</option>
              <option value="technical">Técnico</option>
              <option value="bachelor">Graduação</option>
              <option value="postgraduate">Pós-graduação</option>
              <option value="master">Mestrado</option>
              <option value="phd">Doutorado</option>
            </select>
          </Field>
          <Field label="Anos mínimos de experiência *">
            <input
              type="number"
              min="0"
              step="0.5"
              value={form.minimum_years_experience ?? ""}
              onChange={(event) =>
                onFormChange({
                  minimum_years_experience: event.target.value ? Number(event.target.value) : undefined,
                })
              }
              className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring h-11 rounded-xl px-3 text-sm"
            />
          </Field>
          <Field label="Modelo de trabalho">
            <select
              value={form.work_model}
              onChange={(event) => onFormChange({ work_model: event.target.value })}
              className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring h-11 rounded-xl px-3 text-sm"
            >
              <option value="">Selecione</option>
              <option value="remote">Remoto</option>
              <option value="hybrid">Híbrido</option>
              <option value="onsite">Presencial</option>
            </select>
          </Field>
          <Field label="Localização">
            <input
              value={form.location}
              onChange={(event) => onFormChange({ location: event.target.value })}
              className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring h-11 rounded-xl px-3 text-sm"
              placeholder="Ex: São Paulo/SP ou Remoto"
            />
          </Field>
          <Field label="Jornada de trabalho">
            <input
              value={form.working_hours ?? ""}
              onChange={(event) => onFormChange({ working_hours: event.target.value })}
              className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring h-11 rounded-xl px-3 text-sm"
              placeholder="Ex: 6x1, 12x36, 44h semanais"
              data-testid="form-working-hours"
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="Base descritiva"
        description="Esses campos deixam o matching mais confiável e facilitam a revisão da vaga."
      >
        <div className="space-y-4">
          <Field label="Requisitos">
            <textarea
              value={form.requirements}
              onChange={(event) => onFormChange({ requirements: event.target.value })}
              className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-28 rounded-2xl px-3 py-3 text-sm"
              placeholder="Liste conhecimentos, vivências e critérios essenciais."
            />
          </Field>
          <Field label="Responsabilidades">
            <textarea
              value={form.responsibilities}
              onChange={(event) => onFormChange({ responsibilities: event.target.value })}
              className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-28 rounded-2xl px-3 py-3 text-sm"
              placeholder="Descreva entregas principais e responsabilidades diárias."
            />
          </Field>
          <Field label="Contexto de experiência">
            <textarea
              value={form.experience_context}
              onChange={(event) => onFormChange({ experience_context: event.target.value })}
              className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-28 rounded-2xl px-3 py-3 text-sm"
              placeholder="Explique contexto, ambiente, stack ou porte esperado."
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="Competências, perguntas e benefícios"
        description="Conteúdo capturado da IA ou inserido manualmente. Vincular ao catálogo é feito na aba Competências."
      >
        <div className="space-y-5">
          <Field label="Competências obrigatórias">
            <StringListField
              values={form.mandatory_skills}
              onChange={(next) => onFormChange({ mandatory_skills: next })}
              placeholder="Ex: Atendimento ao cliente"
              addLabel="Adicionar"
              emptyLabel="Nenhuma competência obrigatória adicionada."
              inputLabel="Nova competência obrigatória"
              testId="form-mandatory-skills"
            />
          </Field>
          <Field label="Diferenciais (desejáveis)">
            <StringListField
              values={form.nice_to_have_skills}
              onChange={(next) => onFormChange({ nice_to_have_skills: next })}
              placeholder="Ex: Experiência anterior com caixa"
              addLabel="Adicionar"
              emptyLabel="Nenhum diferencial adicionado."
              inputLabel="Novo diferencial"
              testId="form-nice-to-have-skills"
            />
          </Field>
          <Field label="Perguntas de triagem">
            <StringListField
              values={form.screening_questions}
              onChange={(next) => onFormChange({ screening_questions: next })}
              placeholder="Ex: Tem disponibilidade para turno integral?"
              addLabel="Adicionar"
              emptyLabel="Nenhuma pergunta de triagem adicionada."
              inputLabel="Nova pergunta de triagem"
              testId="form-screening-questions"
            />
          </Field>
          <Field label="Benefícios">
            <StringListField
              values={form.benefits}
              onChange={(next) => onFormChange({ benefits: next })}
              placeholder="Ex: Vale refeição"
              addLabel="Adicionar"
              emptyLabel="Nenhum benefício adicionado."
              inputLabel="Novo benefício"
              testId="form-benefits"
            />
          </Field>
        </div>
      </SectionCard>
    </div>
  );
}
