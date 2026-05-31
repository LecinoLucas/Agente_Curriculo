import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Sparkles, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusPill } from "@/components/ui/status-pill";
import type { JobFormValues } from "../jobFormConfig";
import {
  MOCK_AI_PROMPT_EXAMPLE,
  applyDraftToForm,
  generateMockJobDraft,
  type JobAiDraft,
} from "../utils/mockJobAiDraft";

interface JobAiDraftPanelProps {
  formHasData: boolean;
  onApply: (
    updates: Partial<JobFormValues>,
    skillSuggestions: { mandatory: string[]; optional: string[] },
  ) => void;
}

type AiStatus = "idle" | "loading" | "ready" | "error";

export const draftToFormUpdates = applyDraftToForm;

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

function OrderedList({ items, testId }: { items: string[]; testId?: string }) {
  return (
    <ol className="space-y-2 pl-4 text-sm text-text" data-testid={testId}>
      {items.map((item) => (
        <li key={item} className="list-decimal">
          {item}
        </li>
      ))}
    </ol>
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
              className="h-8 text-sm"
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

export function JobAiDraftPanel({ formHasData, onApply }: JobAiDraftPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [aiStatus, setAiStatus] = useState<AiStatus>("idle");
  const [draft, setDraft] = useState<JobAiDraft | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const isLoading = aiStatus === "loading";
  const hasDraft = draft !== null;

  const draftMeta = useMemo(() => {
    if (!draft) return [];
    return [
      { label: draft.area, variant: "outline" as const },
      { label: draft.work_model === "onsite" ? "Presencial" : draft.work_model, variant: "secondary" as const },
      { label: draft.location, variant: "secondary" as const },
    ];
  }, [draft]);

  async function handleGenerate() {
    if (!prompt.trim()) {
      setAiStatus("error");
      setDraft(null);
      setErrorMessage("Informe uma descrição para gerar o rascunho.");
      return;
    }

    setAiStatus("loading");
    setErrorMessage(null);
    setDraft(null);

    try {
      const nextDraft = await generateMockJobDraft(prompt);
      setDraft(nextDraft);
      setAiStatus("ready");
    } catch {
      setAiStatus("error");
      setErrorMessage("Não foi possível montar o rascunho simulado agora.");
    }
  }

  function updateDraftField(field: keyof JobAiDraft, value: string) {
    setDraft((prev) => (prev ? { ...prev, [field]: value } : null));
  }

  function updateDraftListItem(field: keyof JobAiDraft, index: number, value: string) {
    setDraft((prev) => {
      if (!prev) return null;
      const list = [...(prev[field] as string[])];
      list[index] = value;
      return { ...prev, [field]: list };
    });
  }

  function addDraftListItem(field: keyof JobAiDraft) {
    setDraft((prev) => {
      if (!prev) return null;
      const list = [...(prev[field] as string[])];
      list.push("");
      return { ...prev, [field]: list };
    });
  }

  function removeDraftListItem(field: keyof JobAiDraft, index: number) {
    setDraft((prev) => {
      if (!prev) return null;
      const list = [...(prev[field] as string[])];
      list.splice(index, 1);
      return { ...prev, [field]: list };
    });
  }

  function normalizeDraftList(field: keyof JobAiDraft) {
    setDraft((prev) => {
      if (!prev) return null;
      const list = (prev[field] as string[]).map((i) => i.trim()).filter(Boolean);
      const unique = Array.from(new Set(list.map((i) => i.toLowerCase()))).map((lower) => list.find((i) => i.toLowerCase() === lower)!);
      return { ...prev, [field]: unique };
    });
  }

  function confirmApply() {
    if (!draft) return;
    onApply(applyDraftToForm(draft), {
      mandatory: draft.mandatory_skills,
      optional: draft.nice_to_have_skills,
    });
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
              <StatusPill label="Simulação visual" tone="mock" />
            </div>
            <p className="text-sm text-text-muted">
              Simulação visual. A vaga só será salva quando você revisar e clicar em salvar.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="rounded-md px-2 py-1 text-[11px]">
              Sem backend
            </Badge>
            <Badge variant="secondary" className="rounded-md px-2 py-1 text-[11px]">
              Sem publicação automática
            </Badge>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="ai-draft-prompt" className="text-sm font-medium text-text">
              Descrição da vaga para IA
            </label>
            <button
              type="button"
              onClick={() => setPrompt(MOCK_AI_PROMPT_EXAMPLE)}
              className="text-xs font-medium text-[hsl(var(--primary))] hover:underline"
            >
              Usar exemplo
            </button>
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
          <Button type="button" onClick={() => void handleGenerate()} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Gerando exemplo...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
                Gerar exemplo com IA
              </>
            )}
          </Button>
          <p className="text-xs text-text-muted">
            Rascunho mockado para revisão manual antes do salvamento.
          </p>
        </div>

        {isLoading && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-xl border border-border bg-surface-muted px-3 py-3 text-sm text-text-muted"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Gerando rascunho de exemplo...
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
                    value={draft.title}
                    onChange={(e) => updateDraftField("title", e.target.value)}
                    className="mt-1 h-10 w-full min-w-[280px] text-base font-semibold"
                    data-testid="draft-title-input"
                    aria-label="Título da vaga"
                  />
                </div>
                <StatusPill label="Revisão humana obrigatória" tone="warning" />
              </div>

              <div className="flex flex-wrap gap-2">
                {draftMeta.map((item) => (
                  <Badge key={item.label} variant={item.variant} className="rounded-md px-2 py-1 text-xs">
                    {item.label}
                  </Badge>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <SectionTitle>Senioridade</SectionTitle>
                  <Input
                    value={draft.seniority}
                    onChange={(e) => updateDraftField("seniority", e.target.value)}
                    className="mt-1 h-8 text-sm"
                    aria-label="Senioridade"
                  />
                </div>
                <div>
                  <SectionTitle>Jornada</SectionTitle>
                  <Input
                    value={draft.working_hours}
                    onChange={(e) => updateDraftField("working_hours", e.target.value)}
                    className="mt-1 h-8 text-sm"
                    aria-label="Jornada"
                  />
                </div>
                <div>
                  <SectionTitle>Anos de exp.</SectionTitle>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={draft.minimum_years_experience ?? ""}
                    onChange={(e) => updateDraftField("minimum_years_experience", e.target.value ? Number(e.target.value) : null as any)}
                    className="mt-1 h-8 text-sm"
                    aria-label="Anos mínimos de experiência"
                    data-testid="draft-min-years"
                  />
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2 mt-4">
                <div className="rounded-xl border border-border bg-surface px-3 py-3">
                  <SectionTitle>Resumo</SectionTitle>
                  <Textarea
                    value={draft.description}
                    onChange={(e) => updateDraftField("description", e.target.value)}
                    className="mt-2 min-h-[100px] text-sm leading-6"
                    aria-label="Resumo da vaga"
                  />
                </div>
                <div className="rounded-xl border border-border bg-surface px-3 py-3">
                  <SectionTitle>Contexto de experiência</SectionTitle>
                  <Textarea
                    value={draft.experience_context}
                    onChange={(e) => updateDraftField("experience_context", e.target.value)}
                    className="mt-2 min-h-[100px] text-sm leading-6"
                    aria-label="Contexto de experiência"
                    data-testid="draft-experience-context"
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
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" />
                <span>Revise e ajuste o rascunho acima antes de aplicar ao formulário.</span>
              </div>
              <Button type="button" onClick={handleApply}>
                Aplicar ao formulário
              </Button>
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
              <Button type="button" variant="secondary" onClick={() => setShowConfirm(false)}>
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
