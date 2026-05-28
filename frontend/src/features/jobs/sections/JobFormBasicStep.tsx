import { useState, useEffect } from "react";
import { SectionCard } from "../../../shared/components/layout/SectionCard";
import { Field } from "../../../shared/components/forms/Field";
import type { JobFormValues } from "../jobFormConfig";
import { PRIORITY_OPTIONS } from "../jobFormConfig";
import { jobAreasService, JobArea } from "../../../services/jobAreasService";
import { CreateJobAreaModal } from "../components/CreateJobAreaModal";

type JobFormBasicStepProps = {
  form: JobFormValues;
  onFormChange: (updates: Partial<JobFormValues>) => void;
};

export function JobFormBasicStep({ form, onFormChange }: JobFormBasicStepProps) {
  const [areas, setAreas] = useState<JobArea[]>([]);
  const [loadingAreas, setLoadingAreas] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    async function fetchAreas() {
      setLoadingAreas(true);
      try {
        const response = await jobAreasService.listJobAreas({ page_size: 100 });
        setAreas(response.data);
      } catch (error) {
        console.error("Erro ao carregar áreas:", error);
      } finally {
        setLoadingAreas(false);
      }
    }
    fetchAreas();
  }, []);

  const handleAreaCreated = (newArea: JobArea) => {
    setAreas((prev) => [...prev, newArea]);
    onFormChange({ job_area: newArea.name });
  };
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
            <div className="flex gap-2">
              <select
                value={form.job_area}
                onChange={(event) => onFormChange({ job_area: event.target.value })}
                className="ui-input h-11 rounded-xl px-3 text-sm flex-1"
                disabled={loadingAreas}
              >
                <option value="">Selecione</option>
                {areas.map((area) => (
                  <option key={area.id} value={area.name}>
                    {area.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="h-11 w-11 flex items-center justify-center rounded-xl border border-border bg-surface hover:bg-[hsl(var(--surface-hover))] text-[hsl(var(--text-secondary))] hover:text-text"
                title="Criar nova área"
              >
                +
              </button>
            </div>
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

      <CreateJobAreaModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleAreaCreated}
      />
    </div>
  );
}
