import { useEffect, useMemo, useState } from "react";
import { Link2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AssessmentTemplate, JobAssessment } from "../../../types/domain";
import { assessmentsService } from "../../../services/assessmentsService";
import { handleApiError } from "../../../shared/utils/errorHandler";
import { toast } from "../../../shared/utils/toast";

type JobAssessmentsSectionProps = {
  jobId: string | null;
};

const TYPE_LABEL = {
  behavioral_test: "Teste comportamental",
  behavioral_survey: "Pesquisa comportamental",
} as const;

export function JobAssessmentsSection({ jobId }: JobAssessmentsSectionProps) {
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<AssessmentTemplate[]>([]);
  const [jobAssessments, setJobAssessments] = useState<JobAssessment[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [required, setRequired] = useState(true);
  const [orderIndex, setOrderIndex] = useState(1);

  const linkedTemplateIds = useMemo(
    () => new Set(jobAssessments.map((item) => item.template_id)),
    [jobAssessments],
  );

  const testTemplates = useMemo(
    () => templates.filter((item) => item.type === "behavioral_test"),
    [templates],
  );
  const surveyTemplates = useMemo(
    () => templates.filter((item) => item.type === "behavioral_survey"),
    [templates],
  );
  const availableTemplateCount = testTemplates.length + surveyTemplates.length;

  async function loadData() {
    setLoading(true);
    try {
      const [templateRows, assessmentRows] = await Promise.all([
        assessmentsService.listTemplates({ status: "active" }),
        jobId ? assessmentsService.listJobAssessments(jobId) : Promise.resolve([]),
      ]);
      setTemplates(templateRows);
      setJobAssessments(assessmentRows);
      const nextOrder = assessmentRows.length > 0 ? Math.max(...assessmentRows.map((item) => item.order_index)) + 1 : 1;
      setOrderIndex(nextOrder);
    } catch (error) {
      toast.error(handleApiError(error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [jobId]);

  async function handleAttach() {
    if (!jobId) {
      toast.error("Salve a vaga como rascunho antes de vincular avaliações.");
      return;
    }
    if (!selectedTemplateId) {
      toast.error("Selecione um template de avaliação.");
      return;
    }
    if (linkedTemplateIds.has(selectedTemplateId)) {
      toast.error("Este template já está vinculado à vaga.");
      return;
    }
    try {
      await assessmentsService.attachTemplateToJob(jobId, {
        template_id: selectedTemplateId,
        required,
        order_index: orderIndex,
        trigger_stage: "entry",
      });
      toast.success("Avaliação vinculada à vaga.");
      await loadData();
    } catch (error) {
      toast.error(handleApiError(error).message);
    }
  }

  async function handleUpdate(item: JobAssessment, nextRequired: boolean, nextOrder: number) {
    if (!jobId) return;
    try {
      await assessmentsService.updateJobAssessment(jobId, item.id, {
        required: nextRequired,
        order_index: nextOrder,
      });
      toast.success("Configuração de avaliação atualizada.");
      await loadData();
    } catch (error) {
      toast.error(handleApiError(error).message);
    }
  }

  async function handleDelete(jobAssessmentId: string) {
    if (!jobId) return;
    try {
      await assessmentsService.deleteJobAssessment(jobId, jobAssessmentId);
      toast.success("Avaliação removida da vaga.");
      await loadData();
    } catch (error) {
      toast.error(handleApiError(error).message);
    }
  }

  return (
    <div className="space-y-4 rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-6">
      <div>
        <h2 className="text-lg font-semibold text-[hsl(var(--text))]">Avaliações do processo</h2>
        <p className="mt-2 text-sm text-[hsl(var(--text-muted))]">
          Configure testes e pesquisas que o candidato deverá responder durante o processo.
        </p>
      </div>

      {!jobId ? (
        <p className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Templates ativos aparecem abaixo, mas a vaga precisa ser salva como rascunho antes de vincular avaliações.
        </p>
      ) : null}

      <div className="grid gap-2 rounded-2xl border border-dashed border-[hsl(var(--border))] p-3 sm:grid-cols-4">
        <select
          value={selectedTemplateId}
          onChange={(event) => setSelectedTemplateId(event.target.value)}
          className="ui-input h-10 rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 text-sm sm:col-span-2"
          aria-label="Template de avaliação"
        >
          <option value="">Selecione um template ativo</option>
          {[...testTemplates, ...surveyTemplates].map((template) => (
            <option key={template.id} value={template.id} disabled={linkedTemplateIds.has(template.id)}>
              {TYPE_LABEL[template.type]} · {template.title}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={required} onChange={(event) => setRequired(event.target.checked)} />
          Obrigatória
        </label>
        <input
          type="number"
          min={0}
          value={orderIndex}
          onChange={(event) => setOrderIndex(Number(event.target.value))}
          className="ui-input h-10 rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 text-sm"
          aria-label="Ordem da avaliação"
        />
      </div>

      {!loading && availableTemplateCount === 0 ? (
        <p className="rounded-2xl border border-dashed border-[hsl(var(--border))] p-4 text-sm text-[hsl(var(--text-muted))]">
          Nenhum template ativo encontrado. Ative uma avaliação com perguntas na tela de Avaliações para vinculá-la à vaga.
        </p>
      ) : null}

      <Button type="button" onClick={() => void handleAttach()} disabled={loading || !jobId}>
        <Plus className="mr-2 h-4 w-4" />
        Vincular avaliação
      </Button>

      <div className="space-y-3">
        {!jobId ? (
          <p className="rounded-2xl border border-dashed border-[hsl(var(--border))] p-4 text-sm text-[hsl(var(--text-muted))]">
            Salve a vaga para listar e configurar as avaliações vinculadas.
          </p>
        ) : jobAssessments.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[hsl(var(--border))] p-4 text-sm text-[hsl(var(--text-muted))]">
            Nenhuma avaliação configurada para esta vaga.
          </p>
        ) : (
          jobAssessments.map((item) => (
            <JobAssessmentRow
              key={item.id}
              item={item}
              onSave={handleUpdate}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/40 p-3 text-xs text-[hsl(var(--text-muted))]">
        As avaliações selecionadas serão solicitadas ao candidato após a candidatura.
      </div>
    </div>
  );
}

function JobAssessmentRow({
  item,
  onSave,
  onDelete,
}: {
  item: JobAssessment;
  onSave: (item: JobAssessment, nextRequired: boolean, nextOrder: number) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [nextRequired, setNextRequired] = useState(item.required);
  const [nextOrder, setNextOrder] = useState(item.order_index);

  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[hsl(var(--text))]">{item.title}</p>
          <p className="text-xs text-[hsl(var(--text-muted))]">
            {TYPE_LABEL[item.type]} · status {item.template_status} · v{item.template_version}
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={() => void onDelete(item.id)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={nextRequired} onChange={(event) => setNextRequired(event.target.checked)} />
          Obrigatória
        </label>
        <input
          type="number"
          min={0}
          value={nextOrder}
          onChange={(event) => setNextOrder(Number(event.target.value))}
          className="ui-input h-10 rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 text-sm"
        />
        <Button type="button" variant="outline" onClick={() => void onSave(item, nextRequired, nextOrder)}>
          <Link2 className="mr-2 h-4 w-4" />
          Salvar vínculo
        </Button>
      </div>
    </div>
  );
}
