import { useEffect, useState } from "react";
import { BookOpen, Layers, X } from "lucide-react";
import type { BehavioralAssessmentTemplate } from "../../../types/domain";
import { behavioralTemplatesService } from "../../../services/behavioralTemplatesService";
import { Button } from "@/components/ui/button";

interface BehavioralTemplateSelectorProps {
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  onPopulateBehavioralRequirements?: (requirements: string[]) => void;
}

export function BehavioralTemplateSelector({
  value,
  onChange,
  onPopulateBehavioralRequirements,
}: BehavioralTemplateSelectorProps) {
  const [templates, setTemplates] = useState<BehavioralAssessmentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<BehavioralAssessmentTemplate | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    void loadActiveTemplates();
  }, []);

  useEffect(() => {
    if (!value) {
      setSelectedTemplate(null);
      return;
    }
    const cached = templates.find((t) => t.id === value);
    if (cached?.competencies !== undefined) {
      setSelectedTemplate(cached);
      return;
    }
    void loadTemplateDetail(value);
  }, [value, templates]);

  async function loadActiveTemplates() {
    try {
      const data = await behavioralTemplatesService.listActiveTemplates();
      setTemplates(data);
    } catch {
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadTemplateDetail(templateId: string) {
    setLoadingDetail(true);
    try {
      const detail = await behavioralTemplatesService.getTemplate(templateId);
      setSelectedTemplate(detail);
    } catch {
      setSelectedTemplate(templates.find((t) => t.id === templateId) ?? null);
    } finally {
      setLoadingDetail(false);
    }
  }

  function handleSelect(templateId: string) {
    onChange(templateId === "" ? null : templateId);
  }

  function handleRemove() {
    onChange(null);
  }

  function handlePopulateRequirements() {
    if (!selectedTemplate?.competencies || !onPopulateBehavioralRequirements) return;
    const requirements = selectedTemplate.competencies
      .sort((a, b) => a.display_order - b.display_order)
      .map((c) => c.name);
    onPopulateBehavioralRequirements(requirements);
  }

  return (
    <div className="rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-6 space-y-6">
      <div>
        <h2 className="text-base font-semibold text-[hsl(var(--text))]">Avaliação comportamental</h2>
        <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
          Selecione um template ativo para estruturar os critérios comportamentais desta vaga.
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-[hsl(var(--text-muted))]">Carregando templates...</div>
      ) : templates.length === 0 ? (
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-4 py-4 text-sm text-[hsl(var(--text-muted))]">
          Nenhum template ativo. Crie e ative um template em{" "}
          <span className="font-medium text-[hsl(var(--primary))]">Configurações → Templates comportamentais</span>.
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--text))]">
              Template selecionado
            </label>
            <select
              value={value || ""}
              onChange={(e) => handleSelect(e.target.value)}
              className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-2 text-sm text-[hsl(var(--text))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/30"
            >
              <option value="">Nenhum template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.competency_count} competência(s), {t.question_count} pergunta(s)
                </option>
              ))}
            </select>
          </div>

          {value && (
            <div className="rounded-2xl border border-[hsl(var(--primary))]/20 bg-[hsl(var(--accent-soft))] p-4 space-y-3">
              {loadingDetail ? (
                <p className="text-sm text-[hsl(var(--text-muted))]">Carregando detalhes...</p>
              ) : selectedTemplate ? (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 shrink-0 text-[hsl(var(--primary))]" />
                      <div>
                        <p className="text-sm font-semibold text-[hsl(var(--text))]">{selectedTemplate.name}</p>
                        {selectedTemplate.description && (
                          <p className="mt-0.5 text-xs text-[hsl(var(--text-muted))]">{selectedTemplate.description}</p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemove}
                      className="shrink-0 rounded-lg p-1 text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface-muted))] hover:text-[hsl(var(--text))]"
                      aria-label="Remover template"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex gap-3 text-xs text-[hsl(var(--text-muted))]">
                    <span>{selectedTemplate.competency_count} competência(s)</span>
                    <span>·</span>
                    <span>{selectedTemplate.question_count} pergunta(s)</span>
                    <span>·</span>
                    <span>v{selectedTemplate.version}</span>
                  </div>

                  {selectedTemplate.competencies && selectedTemplate.competencies.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-[hsl(var(--text-muted))]">
                        <Layers className="h-3 w-3" />
                        Competências avaliadas
                      </div>
                      <ul className="space-y-1">
                        {selectedTemplate.competencies
                          .sort((a, b) => a.display_order - b.display_order)
                          .map((competency) => (
                            <li
                              key={competency.id}
                              className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-2"
                            >
                              <span className="text-sm text-[hsl(var(--text))]">{competency.name}</span>
                              <span className="text-xs text-[hsl(var(--text-muted))]">
                                {competency.question_count} pergunta(s)
                              </span>
                            </li>
                          ))}
                      </ul>

                      {onPopulateBehavioralRequirements && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handlePopulateRequirements}
                          className="mt-2 w-full text-xs"
                        >
                          Preencher requisitos comportamentais com as competências do template
                        </Button>
                      )}
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
