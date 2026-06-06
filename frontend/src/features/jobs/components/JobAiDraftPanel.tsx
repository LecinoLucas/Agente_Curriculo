import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Info, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusPill } from "@/components/ui/status-pill";
import type { JobFormValues } from "../jobFormConfig";
import {
  applyDraftToForm as _legacyApplyDraftToForm,
  MOCK_AI_PROMPT_EXAMPLE,
  type JobAiDraft,
} from "../utils/mockJobAiDraft";
import { applyApiDraftToForm, extractSkillSuggestions } from "../utils/jobAiDraftHelpers";
import { generateJobAiDraft, type JobAiDraftFields } from "../services/jobAiDraftService";

interface JobAiDraftPanelProps {
  formHasData: boolean;
  onApply: (
    updates: Partial<JobFormValues>,
    skillSuggestions: { mandatory: string[]; optional: string[] },
  ) => void;
  onClose?: () => void;
}

type AiStatus = "idle" | "loading" | "ready" | "error";

/**
 * @deprecated Use applyApiDraftToForm from jobAiDraftHelpers.ts instead.
 * Kept only for backwards-compat with existing tests that import this.
 */
export const draftToFormUpdates = _legacyApplyDraftToForm;

function SectionTitle({ children }: { children: string }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{children}</p>;
}

function ChipList({ items, testId }: { items: string[]; testId?: string }) {
  return (
    <div className="flex flex-wrap gap-2" data-testid={testId}>
      {items.map((item) => (
        <Badge key={item} variant="secondary" className="rounded-md px-2 py-1 text-xs font-medium">
          {item}
        </Badge>
      ))}
    </div>
  );
}

function EditableList({
  title,
  items,
  onUpdate,
  onAdd,
  onRemove,
  onBlur,
  testId,
}: {
  title: string;
  items: string[];
  onUpdate: (idx: number, val: string) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
  onBlur: () => void;
  testId?: string;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-4" data-testid={testId}>
      <SectionTitle>{title}</SectionTitle>
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <Input
              value={item}
              onChange={(e) => onUpdate(idx, e.target.value)}
              onBlur={onBlur}
              className="h-8 text-sm flex-1"
              aria-label={`Editar item de ${title}`}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0 text-danger hover:bg-danger-soft hover:text-danger"
              onClick={() => onRemove(idx)}
              aria-label="Remover item"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 px-2 text-xs font-medium text-[hsl(var(--primary))] hover:bg-[hsl(var(--accent-soft))]"
        onClick={onAdd}
      >
        <Plus className="mr-1 h-3.5 w-3.5" />
        Adicionar item
      </Button>
    </div>
  );
}

export function JobAiDraftPanel({ formHasData, onApply, onClose }: JobAiDraftPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [aiStatus, setAiStatus] = useState<AiStatus>("idle");
  const [draft, setDraft] = useState<JobAiDraftFields | null>(null);
  const [needsReview, setNeedsReview] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const isLoading = aiStatus === "loading";
  const hasDraft = draft !== null;

  const draftMeta = useMemo(() => {
    if (!draft) return [];
    return [
      draft.area ? { label: draft.area, variant: "outline" as const } : null,
      draft.work_model
        ? {
            label:
              draft.work_model === "onsite"
                ? "Presencial"
                : draft.work_model === "hybrid"
                  ? "Híbrido"
                  : "Remoto",
            variant: "secondary" as const,
          }
        : null,
      draft.unit ? { label: draft.unit, variant: "secondary" as const } : null,
    ].filter(Boolean) as { label: string; variant: "outline" | "secondary" }[];
  }, [draft]);

  async function handleGenerate() {
    if (!prompt.trim()) {
      setAiStatus("error");
      setDraft(null);
      setNeedsReview([]);
      setErrorMessage("Informe uma descrição para gerar o rascunho.");
      return;
    }

    setAiStatus("loading");
    setErrorMessage(null);
    setDraft(null);
    setNeedsReview([]);

    try {
      const response = await generateJobAiDraft({ text_input: prompt, ocr_text: null });
      setDraft(response.draft);
      setNeedsReview(response.needs_review ?? []);
      setAiStatus("ready");
    } catch (err: unknown) {
      setAiStatus("error");
      const message =
        err instanceof Error && err.message ? err.message : "Não foi possível gerar o rascunho.";
      setErrorMessage(message);
    }
  }

  function updateDraftField(field: keyof JobAiDraftFields, value: string) {
    setDraft((prev) => (prev ? { ...prev, [field]: value } : null));
  }

  function updateDraftListItem(field: keyof JobAiDraftFields, index: number, value: string) {
    setDraft((prev) => {
      if (!prev) return null;
      const list = [...(prev[field] as string[])];
      list[index] = value;
      return { ...prev, [field]: list };
    });
  }

  function addDraftListItem(field: keyof JobAiDraftFields) {
    setDraft((prev) => {
      if (!prev) return null;
      const list = [...(prev[field] as string[])];
      list.push("");
      return { ...prev, [field]: list };
    });
  }

  function removeDraftListItem(field: keyof JobAiDraftFields, index: number) {
    setDraft((prev) => {
      if (!prev) return null;
      const list = [...(prev[field] as string[])];
      list.splice(index, 1);
      return { ...prev, [field]: list };
    });
  }

  function normalizeDraftList(field: keyof JobAiDraftFields) {
    setDraft((prev) => {
      if (!prev) return null;
      const list = (prev[field] as string[]).map((i) => i.trim()).filter(Boolean);
      const unique = Array.from(new Set(list.map((i) => i.toLowerCase()))).map(
        (lower) => list.find((i) => i.toLowerCase() === lower)!,
      );
      return { ...prev, [field]: unique };
    });
  }

  function confirmApply() {
    if (!draft) return;
    const updates = applyApiDraftToForm(draft);
    const skills = extractSkillSuggestions(draft);
    onApply(updates, skills);
    setShowConfirm(false);
  }

  function handleApply() {
    if (!draft) return;
    if (formHasData) {
      setShowConfirm(true);
      return;
    }
    confirmApply();
  }

  function handleDiscard() {
    setDraft(null);
    setNeedsReview([]);
    setAiStatus("idle");
    setErrorMessage(null);
  }

  const NEEDS_REVIEW_LABELS: Record<string, string> = {
    salary_range: "Faixa salarial não informada",
    unit: "Local de trabalho não informado",
    work_model: "Modelo de trabalho não informado",
    title: "Título não gerado",
    description: "Descrição não gerada",
  };

  return (
    <>
      <section
        className="space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-sm"
        data-testid="ai-draft-panel"
      >
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-muted/60 p-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-text">Criar vaga com IA</h2>
            </div>
            <p className="text-sm text-text-muted">
              Descreva a vaga e a IA gerará um rascunho. Revise antes de aplicar ao formulário.
            </p>
          </div>
          {onClose && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 ml-1 text-text-muted hover:text-text"
              onClick={onClose}
              aria-label="Fechar painel"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="ai-draft-prompt" className="text-sm font-medium text-text">
              Descrição da vaga para IA
            </label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-text-muted hover:text-text"
              onClick={() => setPrompt(MOCK_AI_PROMPT_EXAMPLE)}
            >
              Usar exemplo
            </Button>
          </div>

          <textarea
            id="ai-draft-prompt"
            aria-label="Descrição da vaga para IA"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={5}
            placeholder="Ex: Preciso contratar um frentista para posto de combustível..."
            className="min-h-[128px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text outline-none transition focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={isLoading}
            data-testid="ai-draft-generate-btn"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Gerando rascunho...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
                Gerar com IA
              </>
            )}
          </Button>
          <p className="text-xs text-text-muted">
            O rascunho é para revisão humana — não salva nem publica automaticamente.
          </p>
        </div>

        {isLoading && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-xl border border-border bg-surface-muted px-3 py-3 text-sm text-text-muted"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Gerando rascunho com IA...
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-[hsl(var(--danger))]/20 bg-danger-soft px-3 py-3 text-sm text-danger"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        )}

        {hasDraft && draft && (
          <div
            className="space-y-4 rounded-2xl border border-border bg-background p-4"
            data-testid="ai-draft-result"
          >
            <div className="space-y-3 border-b border-border pb-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <SectionTitle>Título sugerido</SectionTitle>
                  <Input
                    value={draft.title ?? ""}
                    onChange={(e) => updateDraftField("title", e.target.value)}
                    className="mt-1 h-10 w-full min-w-[280px] text-base font-semibold"
                    data-testid="draft-title-input"
                    aria-label="Título da vaga"
                  />
                </div>
                <StatusPill label="Revisão humana obrigatória" tone="warning" />
              </div>

              {draftMeta.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {draftMeta.map((item) => (
                    <Badge
                      key={item.label}
                      variant={item.variant}
                      className="rounded-md px-2 py-1 text-xs"
                    >
                      {item.label}
                    </Badge>
                  ))}
                </div>
              )}

              {needsReview.length > 0 && (
                <div
                  className="flex items-start gap-2 rounded-xl border border-[hsl(var(--warning))]/25 bg-warning-soft px-3 py-2 text-sm text-warning"
                  data-testid="ai-draft-needs-review"
                >
                  <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <div>
                    <span className="font-medium">Campos para revisão: </span>
                    {needsReview
                      .map((key) => NEEDS_REVIEW_LABELS[key] ?? key)
                      .join(", ")}
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <SectionTitle>Senioridade</SectionTitle>
                  <Input
                    value={draft.seniority ?? ""}
                    onChange={(e) => updateDraftField("seniority", e.target.value)}
                    className="mt-1 h-8 text-sm"
                    aria-label="Senioridade"
                  />
                </div>
                <div>
                  <SectionTitle>Jornada</SectionTitle>
                  <Input
                    value={draft.working_hours ?? ""}
                    onChange={(e) => updateDraftField("working_hours", e.target.value)}
                    className="mt-1 h-8 text-sm"
                    aria-label="Jornada"
                  />
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2 mt-4">
                <div className="rounded-xl border border-border bg-surface px-3 py-3">
                  <SectionTitle>Resumo</SectionTitle>
                  <Textarea
                    value={draft.description ?? ""}
                    onChange={(e) => updateDraftField("description", e.target.value)}
                    className="mt-2 min-h-[100px] text-sm leading-6"
                    aria-label="Resumo da vaga"
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <EditableList
                title="Responsabilidades"
                items={draft.responsibilities}
                onUpdate={(idx, val) => updateDraftListItem("responsibilities", idx, val)}
                onAdd={() => addDraftListItem("responsibilities")}
                onRemove={(idx) => removeDraftListItem("responsibilities", idx)}
                onBlur={() => normalizeDraftList("responsibilities")}
                testId="draft-responsibilities"
              />
              <EditableList
                title="Requisitos obrigatórios"
                items={draft.requirements}
                onUpdate={(idx, val) => updateDraftListItem("requirements", idx, val)}
                onAdd={() => addDraftListItem("requirements")}
                onRemove={(idx) => removeDraftListItem("requirements", idx)}
                onBlur={() => normalizeDraftList("requirements")}
                testId="draft-requirements"
              />
              <EditableList
                title="Diferenciais"
                items={draft.nice_to_have_skills}
                onUpdate={(idx, val) => updateDraftListItem("nice_to_have_skills", idx, val)}
                onAdd={() => addDraftListItem("nice_to_have_skills")}
                onRemove={(idx) => removeDraftListItem("nice_to_have_skills", idx)}
                onBlur={() => normalizeDraftList("nice_to_have_skills")}
                testId="draft-nice-to-have"
              />
              <EditableList
                title="Perguntas de triagem"
                items={draft.screening_questions}
                onUpdate={(idx, val) => updateDraftListItem("screening_questions", idx, val)}
                onAdd={() => addDraftListItem("screening_questions")}
                onRemove={(idx) => removeDraftListItem("screening_questions", idx)}
                onBlur={() => normalizeDraftList("screening_questions")}
                testId="draft-screening-questions"
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <EditableList
                title="Competências sugeridas"
                items={draft.mandatory_skills}
                onUpdate={(idx, val) => updateDraftListItem("mandatory_skills", idx, val)}
                onAdd={() => addDraftListItem("mandatory_skills")}
                onRemove={(idx) => removeDraftListItem("mandatory_skills", idx)}
                onBlur={() => normalizeDraftList("mandatory_skills")}
                testId="draft-mandatory-skills"
              />
              <EditableList
                title="Benefícios sugeridos"
                items={draft.benefits}
                onUpdate={(idx, val) => updateDraftListItem("benefits", idx, val)}
                onAdd={() => addDraftListItem("benefits")}
                onRemove={(idx) => removeDraftListItem("benefits", idx)}
                onBlur={() => normalizeDraftList("benefits")}
                testId="draft-benefits"
              />
            </div>

            <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-muted/60 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2 text-sm text-text-muted">
                <CheckCircle2
                  className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--primary))]"
                  aria-hidden="true"
                />
                <span>Revise e ajuste o rascunho acima antes de aplicar ao formulário.</span>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDiscard}
                  data-testid="ai-draft-discard-btn"
                >
                  Descartar
                </Button>
                <Button
                  type="button"
                  onClick={handleApply}
                  data-testid="ai-draft-apply-btn"
                >
                  Aplicar ao formulário
                </Button>
              </div>
            </div>
          </div>
        )}
      </section>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Confirmar substituição"
            className="w-full max-w-md rounded-2xl border border-border bg-background p-5 shadow-xl"
          >
            <h3 className="text-base font-semibold text-text">Confirmar substituição</h3>
            <p className="mt-2 text-sm leading-6 text-text-muted">
              Aplicar o rascunho substitui os principais campos já preenchidos no formulário.
              Revise tudo antes de salvar.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowConfirm(false)}
              >
                Cancelar
              </Button>
              <Button type="button" onClick={confirmApply}>
                Confirmar e aplicar
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
