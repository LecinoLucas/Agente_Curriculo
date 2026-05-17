import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock,
  GraduationCap,
  Layers,
  Tag,
  X,
} from "lucide-react";
import type { BehavioralAssessmentTemplate } from "../../../types/domain";
import { behavioralTemplatesService } from "../../../services/behavioralTemplatesService";
import { Button } from "@/components/ui/button";
import { parseTemplateDescription } from "../../behavioral-templates/behavioralTemplateHelper";

interface BehavioralTemplateSelectorProps {
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  onPopulateBehavioralRequirements?: (requirements: string[]) => void;
  /**
   * When true: a published behavioral assessment requires an active template.
   * Shows a blocking warning if no active template is selected.
   */
  requiresAssessment?: boolean;
  /**
   * Called whenever the selected template's status changes (or becomes null).
   * Used by the parent to keep checklist/validation in sync.
   */
  onTemplateStatusChange?: (status: BehavioralAssessmentTemplate["status"] | null) => void;
}

const STATUS_META: Record<
  BehavioralAssessmentTemplate["status"],
  { label: string; classes: string; icon: React.ReactNode }
> = {
  active: {
    label: "Ativo",
    classes: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  draft: {
    label: "Rascunho",
    classes: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  archived: {
    label: "Arquivado",
    classes: "bg-gray-100 text-gray-500 dark:bg-gray-800/40 dark:text-gray-400",
    icon: <X className="h-3 w-3" />,
  },
};

export function BehavioralTemplateSelector({
  value,
  onChange,
  onPopulateBehavioralRequirements,
  requiresAssessment = false,
  onTemplateStatusChange,
}: BehavioralTemplateSelectorProps) {
  // All templates with status !== archived (archived ones cannot be selected)
  const [allTemplates, setAllTemplates] = useState<BehavioralAssessmentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<BehavioralAssessmentTemplate | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    void loadTemplates();
  }, []);

  useEffect(() => {
    if (!value) {
      setSelectedTemplate(null);
      onTemplateStatusChange?.(null);
      return;
    }
    const cached = allTemplates.find((t) => t.id === value);
    if (cached?.competencies !== undefined) {
      setSelectedTemplate(cached);
      onTemplateStatusChange?.(cached.status);
      return;
    }
    if (value) {
      void loadTemplateDetail(value);
    }
  }, [value, allTemplates]);

  async function loadTemplates() {
    try {
      // Load all non-archived templates to show draft warning + only allow active ones
      const activeData = await behavioralTemplatesService.listActiveTemplates();
      setAllTemplates(activeData);
    } catch {
      setAllTemplates([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadTemplateDetail(templateId: string) {
    setLoadingDetail(true);
    try {
      const detail = await behavioralTemplatesService.getTemplate(templateId);
      setSelectedTemplate(detail);
      onTemplateStatusChange?.(detail.status);
    } catch {
      const fallback = allTemplates.find((t) => t.id === templateId) ?? null;
      setSelectedTemplate(fallback);
      onTemplateStatusChange?.(fallback?.status ?? null);
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

  const selectedStatus = selectedTemplate?.status;
  const isDraft = selectedStatus === "draft";
  const isArchived = selectedStatus === "archived";
  const isActive = selectedStatus === "active";

  // Parse rich description metadata
  const templateMeta = selectedTemplate
    ? parseTemplateDescription(selectedTemplate.description)
    : null;

  // Validation: assessment required but no active template selected
  const missingActiveTemplate =
    requiresAssessment && (!value || !isActive);

  const selectableTemplates = allTemplates.filter((t) => t.status !== "archived");

  return (
    <div className="rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-6 space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
          <GraduationCap className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-[hsl(var(--text))]">Avaliação comportamental</h2>
          <p className="mt-0.5 text-sm text-[hsl(var(--text-muted))]">
            Selecione um template ativo para estruturar os critérios comportamentais desta vaga.
            Templates em rascunho não podem ser usados em avaliações.
          </p>
        </div>
      </div>

      {/* Blocking warning when assessment is required but no active template is linked */}
      {missingActiveTemplate && (
        <div className="flex items-start gap-3 rounded-2xl border border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/8 px-4 py-3 text-sm text-[hsl(var(--warning))]">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Esta vaga exige avaliação comportamental. Para publicar, selecione um{" "}
            <strong>template ativo</strong>. Templates em rascunho não são aceitos.
          </span>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-[hsl(var(--text-muted))]">Carregando templates...</div>
      ) : selectableTemplates.length === 0 ? (
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-4 py-4 text-sm text-[hsl(var(--text-muted))]">
          Nenhum template ativo disponível. Crie e ative um template em{" "}
          <span className="font-medium text-[hsl(var(--primary))]">Avaliações → Templates comportamentais</span>.
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--text))]">
              Template selecionado
              {requiresAssessment && (
                <span className="ml-1 text-[hsl(var(--danger))]">*</span>
              )}
            </label>
            <select
              value={value || ""}
              onChange={(e) => handleSelect(e.target.value)}
              className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-2 text-sm text-[hsl(var(--text))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/30"
            >
              <option value="">Nenhum template</option>
              {selectableTemplates.map((t) => (
                <option key={t.id} value={t.id} disabled={t.status === "archived"}>
                  {t.name}
                  {t.status === "draft" ? " (Rascunho)" : ""}
                  {" — "}
                  {t.competency_count} competência(s), {t.question_count} pergunta(s)
                </option>
              ))}
            </select>
          </div>

          {/* Draft warning when a draft template is selected */}
          {isDraft && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-300/40 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Template em rascunho</p>
                <p className="mt-0.5 text-xs opacity-80">
                  Este template ainda não foi publicado. Avaliações não poderão ser enviadas aos candidatos enquanto
                  o template estiver em rascunho. Publique o template antes de usar esta vaga.
                </p>
              </div>
            </div>
          )}

          {/* Archived warning (defensive — archived are not shown in select but could be pre-saved) */}
          {isArchived && (
            <div className="flex items-start gap-3 rounded-2xl border border-[hsl(var(--danger))]/30 bg-[hsl(var(--danger-soft))] px-4 py-3 text-sm text-[hsl(var(--danger))]">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Template arquivado</p>
                <p className="mt-0.5 text-xs opacity-80">
                  Templates arquivados não podem ser usados. Selecione outro template ativo.
                </p>
              </div>
            </div>
          )}

          {/* Template preview card */}
          {value && (
            <div
              className={[
                "rounded-2xl border p-4 space-y-4",
                isActive
                  ? "border-[hsl(var(--primary))]/20 bg-[hsl(var(--accent-soft))]"
                  : isDraft
                    ? "border-amber-300/30 bg-amber-50/60 dark:bg-amber-900/10"
                    : "border-gray-200 bg-gray-50 dark:bg-gray-800/20",
              ].join(" ")}
            >
              {loadingDetail ? (
                <p className="text-sm text-[hsl(var(--text-muted))]">Carregando detalhes...</p>
              ) : selectedTemplate ? (
                <>
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <BookOpen className="h-4 w-4 shrink-0 text-[hsl(var(--primary))]" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[hsl(var(--text))] truncate">
                          {selectedTemplate.name}
                        </p>
                        {templateMeta?.description && (
                          <p className="mt-0.5 text-xs text-[hsl(var(--text-muted))] line-clamp-2">
                            {templateMeta.description}
                          </p>
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

                  {/* Metadata pills */}
                  <div className="flex flex-wrap gap-2 text-xs">
                    {/* Status badge */}
                    <span
                      className={[
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium",
                        STATUS_META[selectedTemplate.status].classes,
                      ].join(" ")}
                    >
                      {STATUS_META[selectedTemplate.status].icon}
                      {STATUS_META[selectedTemplate.status].label}
                    </span>

                    {/* Version */}
                    <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--surface-muted))] px-2 py-0.5 text-[hsl(var(--text-muted))] font-medium">
                      v{selectedTemplate.version}
                    </span>

                    {/* Category */}
                    {templateMeta?.category && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--surface-muted))] px-2 py-0.5 text-[hsl(var(--text-muted))] font-medium">
                        <Tag className="h-3 w-3" />
                        {templateMeta.category}
                      </span>
                    )}

                    {/* Duration */}
                    {templateMeta?.duration != null && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--surface-muted))] px-2 py-0.5 text-[hsl(var(--text-muted))] font-medium">
                        <Clock className="h-3 w-3" />
                        ~{templateMeta.duration} min
                      </span>
                    )}

                    {/* Stats */}
                    <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--surface-muted))] px-2 py-0.5 text-[hsl(var(--text-muted))] font-medium">
                      {selectedTemplate.competency_count} competência(s)
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--surface-muted))] px-2 py-0.5 text-[hsl(var(--text-muted))] font-medium">
                      {selectedTemplate.question_count} pergunta(s)
                    </span>
                  </div>

                  {/* Competencies list */}
                  {selectedTemplate.competencies && selectedTemplate.competencies.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
                        <Layers className="h-3 w-3" />
                        Competências avaliadas
                      </div>
                      <ul className="space-y-1.5">
                        {selectedTemplate.competencies
                          .sort((a, b) => a.display_order - b.display_order)
                          .map((competency) => (
                            <li
                              key={competency.id}
                              className="flex items-center justify-between rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-2"
                            >
                              <span className="text-sm font-medium text-[hsl(var(--text))]">
                                {competency.name}
                              </span>
                              <span className="text-xs text-[hsl(var(--text-muted))] shrink-0 ml-2">
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
