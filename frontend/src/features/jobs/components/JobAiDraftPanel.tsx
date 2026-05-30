import { useRef, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

import { HttpError } from "@/services/http";
import { Button } from "@/components/ui/button";
import type { JobFormValues } from "../jobFormConfig";
import { MOCK_AI_PROMPT_EXAMPLE } from "../utils/mockJobAiDraft";
import {
  extractJobTextFromImage,
  generateJobAiDraft,
  type AiSkillSuggestions,
  type JobAiDraftFields,
  type JobAiDraftUsage,
} from "../services/jobAiDraftService";

interface JobAiDraftPanelProps {
  formHasData: boolean;
  onApply: (updates: Partial<JobFormValues>, skillSuggestions: AiSkillSuggestions) => void;
}

type AiStatus = "idle" | "extracting_image" | "generating_draft" | "ready" | "error";

const NEEDS_REVIEW_LABELS: Record<string, string> = {
  salary_range: "Faixa salarial",
  unit: "Unidade / Loja",
  work_model: "Modelo de trabalho",
  title: "Título da vaga",
  description: "Descrição",
};

const OCR_PREVIEW_CHARS = 220;

function formatWorkModel(wm: string | null): string {
  if (wm === "onsite") return "Presencial";
  if (wm === "hybrid") return "Híbrido";
  if (wm === "remote") return "Remoto";
  return wm ?? "";
}

function normalizeStringList(items: string[]): string[] {
  const seen = new Set<string>();
  return items
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .filter((s) => {
      const key = s.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function draftToFormUpdates(draft: JobAiDraftFields): Partial<JobFormValues> {
  const updates: Partial<JobFormValues> = {
    title: draft.title ?? undefined,
    description: draft.description ?? undefined,
    responsibilities:
      draft.responsibilities.length > 0 ? draft.responsibilities.join("\n") : undefined,
    requirements: draft.requirements.length > 0 ? draft.requirements.join("\n") : undefined,
    job_area: draft.area ?? undefined,
    work_model: draft.work_model ?? undefined,
    location: draft.unit ?? undefined,
    salary_min: draft.salary_min ?? undefined,
    salary_max: draft.salary_max ?? undefined,
    requires_manager_review: draft.requires_manager_review,
    requires_behavioral_assessment: draft.requires_behavioral_assessment,
  };

  // seniority_level — apply when draft provides it
  if (draft.seniority) {
    updates.seniority_level = draft.seniority;
  }

  // Dedicated fields — each IA-generated list goes to its own form field.
  // behavioral_requirements is reserved for actual comportamental requirements only.
  const mandatorySkills = normalizeStringList(draft.mandatory_skills);
  if (mandatorySkills.length > 0) updates.mandatory_skills = mandatorySkills;

  const niceToHave = normalizeStringList(draft.nice_to_have_skills);
  if (niceToHave.length > 0) updates.nice_to_have_skills = niceToHave;

  const screening = normalizeStringList(draft.screening_questions);
  if (screening.length > 0) updates.screening_questions = screening;

  const benefits = normalizeStringList(draft.benefits);
  if (benefits.length > 0) updates.benefits = benefits;

  if (draft.working_hours && draft.working_hours.trim()) {
    updates.working_hours = draft.working_hours.trim();
  }

  return updates;
}

export function JobAiDraftPanel({ formHasData, onApply }: JobAiDraftPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [prompt, setPrompt] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus>("idle");
  const [draft, setDraft] = useState<JobAiDraftFields | null>(null);
  const [needsReview, setNeedsReview] = useState<string[]>([]);
  const [usage, setUsage] = useState<JobAiDraftUsage | null>(null);
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [ocrWarning, setOcrWarning] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(true);
  const [ocrExpanded, setOcrExpanded] = useState(false);

  const isLoading = aiStatus === "extracting_image" || aiStatus === "generating_draft";

  const statusMessage =
    aiStatus === "extracting_image"
      ? "Lendo imagem..."
      : aiStatus === "generating_draft"
        ? "Gerando rascunho..."
        : null;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setImageFile(file);
    setOcrText(null);
    setOcrWarning(null);
  }

  function handleRemoveFile() {
    setImageFile(null);
    setOcrText(null);
    setOcrWarning(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleGenerate() {
    if (!prompt.trim() && !imageFile) {
      setErrorMessage(
        "Informe uma descrição ou selecione uma imagem para gerar o rascunho.",
      );
      return;
    }

    setErrorMessage(null);
    setOcrWarning(null);
    setDraft(null);
    setNeedsReview([]);
    setUsage(null);

    let extractedOcrText: string | null = null;

    if (imageFile) {
      setAiStatus("extracting_image");
      try {
        const ocr = await extractJobTextFromImage(imageFile);
        extractedOcrText = ocr.extracted_text;
        setOcrText(ocr.extracted_text);
      } catch {
        if (!prompt.trim()) {
          setErrorMessage(
            "Não foi possível ler a imagem. Digite uma descrição da vaga e tente novamente.",
          );
          setAiStatus("idle");
          return;
        }
        setOcrWarning(
          "Não foi possível ler a imagem. Continuando com o texto digitado.",
        );
      }
    }

    setAiStatus("generating_draft");
    try {
      const response = await generateJobAiDraft({
        text_input: prompt.trim() || null,
        ocr_text: extractedOcrText,
        source: {
          text_used: Boolean(prompt.trim()),
          image_used: Boolean(imageFile),
        },
      });
      setDraft(response.draft);
      setNeedsReview(response.needs_review);
      setUsage(response.usage);
      setAiStatus("ready");
    } catch (err) {
      if (err instanceof HttpError && err.status === 429) {
        setErrorMessage("Limite de gerações atingido. Tente novamente mais tarde.");
      } else {
        setErrorMessage(
          "Não foi possível gerar o rascunho agora. Tente novamente em instantes.",
        );
      }
      setAiStatus("error");
    }
  }

  function handleApply() {
    if (formHasData) {
      setShowConfirm(true);
      return;
    }
    confirmApply();
  }

  function confirmApply() {
    if (!draft) return;
    onApply(draftToFormUpdates(draft), {
      mandatory: (draft.mandatory_skills ?? []).filter((s) => s.trim()),
      optional: (draft.nice_to_have_skills ?? []).filter((s) => s.trim()),
    });
  }

  const ocrPreview = ocrText
    ? ocrExpanded
      ? ocrText
      : ocrText.slice(0, OCR_PREVIEW_CHARS)
    : null;
  const ocrTruncated = ocrText !== null && ocrText.length > OCR_PREVIEW_CHARS;

  return (
    <div
      className="rounded-2xl border border-border bg-surface p-4 space-y-4"
      data-testid="ai-draft-panel"
    >
      {/* Security notice */}
      <div className="flex items-start gap-2 rounded-xl bg-surface-muted px-3 py-2">
        <Upload className="h-3.5 w-3.5 mt-0.5 shrink-0 text-text-muted" aria-hidden="true" />
        <p className="text-xs text-text-muted">
          A imagem é lida por OCR. A IA recebe apenas o texto extraído, não a imagem.
        </p>
      </div>

      {/* Prompt input */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="ai-draft-prompt" className="text-sm font-semibold text-text">
            Descreva a vaga
          </label>
          <button
            type="button"
            onClick={() => setPrompt(MOCK_AI_PROMPT_EXAMPLE)}
            className="text-xs font-medium text-[hsl(var(--primary))] hover:underline"
          >
            Preencher exemplo
          </button>
        </div>
        <textarea
          id="ai-draft-prompt"
          aria-label="Descrição da vaga para IA"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ex: Operador de Caixa, turno integral, varejo..."
          rows={3}
          className="w-full rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm text-text placeholder:text-text-muted resize-none focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/30"
        />
      </div>

      {/* Image upload */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label="Selecionar imagem da vaga"
          onChange={handleFileChange}
        />
        {imageFile ? (
          <div className="flex items-center justify-between rounded-xl border border-border bg-surface-muted px-3 py-2">
            <span className="truncate text-xs text-text">{imageFile.name}</span>
            <button
              type="button"
              aria-label="Remover imagem"
              onClick={handleRemoveFile}
              className="ml-2 shrink-0 text-text-muted hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-2 text-xs text-text-muted hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))] transition-colors"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            Selecionar imagem (opcional)
          </button>
        )}
      </div>

      {/* Generate button */}
      <Button
        type="button"
        size="sm"
        onClick={() => void handleGenerate()}
        disabled={isLoading}
        className="w-full"
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            {statusMessage}
          </>
        ) : (
          <>
            <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
            Gerar rascunho com IA
          </>
        )}
      </Button>

      {/* Loading status — visually hidden; button label already shows state */}
      {isLoading && (
        <p role="status" aria-live="polite" className="sr-only">
          {statusMessage}
        </p>
      )}

      {/* OCR warning */}
      {ocrWarning && (
        <div className="flex items-start gap-2 rounded-xl border border-[hsl(var(--warning))]/30 bg-warning-soft px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-xs text-warning">{ocrWarning}</p>
        </div>
      )}

      {/* Validation / generation error */}
      {errorMessage && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-[hsl(var(--danger))]/30 bg-danger-soft px-3 py-2"
        >
          <AlertCircle
            className="h-3.5 w-3.5 mt-0.5 shrink-0 text-danger"
            aria-hidden="true"
          />
          <p className="text-xs text-danger">{errorMessage}</p>
        </div>
      )}

      {/* OCR preview */}
      {ocrText && (
        <div
          className="space-y-1 rounded-xl border border-border bg-surface-muted p-3"
          data-testid="ocr-preview"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-text-muted">Texto extraído da imagem</p>
            {ocrTruncated && (
              <button
                type="button"
                onClick={() => setOcrExpanded((v) => !v)}
                className="text-xs text-[hsl(var(--primary))] hover:underline"
              >
                {ocrExpanded ? "Ver menos" : "Ver mais"}
              </button>
            )}
          </div>
          <p className="text-xs text-text whitespace-pre-wrap break-words">{ocrPreview}</p>
          {!ocrExpanded && ocrTruncated && (
            <p className="text-[11px] text-text-muted">… (texto truncado)</p>
          )}
          <p className="text-[11px] text-text-muted italic">
            A IA receberá apenas o texto extraído, não a imagem.
          </p>
        </div>
      )}

      {/* Draft result */}
      {aiStatus === "ready" && draft && (
        <div className="space-y-3 border-t border-border pt-3" data-testid="ai-draft-result">
          {/* Safety notice */}
          <div className="flex items-start gap-2 rounded-xl border border-[hsl(var(--warning))]/30 bg-warning-soft px-3 py-2">
            <AlertCircle
              className="h-3.5 w-3.5 mt-0.5 shrink-0 text-warning"
              aria-hidden="true"
            />
            <p className="text-xs text-warning">
              A IA ajuda a estruturar a vaga, mas a revisão humana é obrigatória antes da
              publicação.
            </p>
          </div>

          {/* Needs review */}
          {needsReview.length > 0 && (
            <div className="rounded-xl border border-[hsl(var(--warning))]/50 bg-warning-soft px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <AlertCircle className="h-3.5 w-3.5 text-warning shrink-0" aria-hidden="true" />
                <p className="text-xs font-semibold text-warning">
                  Preencha antes de publicar
                </p>
              </div>
              <ul className="space-y-0.5">
                {needsReview.map((field) => (
                  <li
                    key={field}
                    className="flex items-center gap-1.5 text-xs font-medium text-warning"
                    data-testid={`needs-review-${field}`}
                  >
                    <span className="h-1 w-1 rounded-full bg-warning shrink-0" aria-hidden="true" />
                    {NEEDS_REVIEW_LABELS[field] ?? field}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Title + meta */}
          <div>
            <p className="text-base font-bold text-text" data-testid="draft-title">
              {draft.title}
            </p>
            <p className="text-xs text-text-muted">
              {draft.area}
              {draft.work_model && <> · {formatWorkModel(draft.work_model)}</>}
              {draft.unit && <> · {draft.unit}</>}
            </p>
            {draft.description && (
              <p className="mt-1 text-sm text-text">{draft.description}</p>
            )}
          </div>

          {/* Mandatory skills (collapsible) */}
          {draft.mandatory_skills.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setSkillsOpen((v) => !v)}
                className="flex w-full items-center justify-between py-1 text-xs font-semibold uppercase tracking-wide text-text-muted"
              >
                Competências obrigatórias ({draft.mandatory_skills.length})
                {skillsOpen ? (
                  <ChevronUp className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-3 w-3" aria-hidden="true" />
                )}
              </button>
              {skillsOpen && (
                <ul className="mt-1 space-y-1" data-testid="draft-mandatory-skills">
                  {draft.mandatory_skills.map((skill) => (
                    <li
                      key={skill}
                      className="rounded-lg bg-surface-muted px-2 py-1 text-xs text-text"
                    >
                      {skill}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Informações sugeridas:
              Após a Fase 9, todos esses campos têm destino dedicado no formulário
              (mandatory_skills, nice_to_have_skills, screening_questions, benefits, working_hours).
              Esta seção continua exibindo o preview antes do "Aplicar ao formulário"
              para que o RH revise visualmente antes de aplicar.
          */}
          {(draft.nice_to_have_skills.length > 0 ||
            draft.working_hours ||
            draft.benefits.length > 0 ||
            draft.screening_questions.length > 0) && (
            <details className="group rounded-xl border border-border" data-testid="suggested-info">
              <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-text-muted">
                Informações sugeridas
              </summary>
              <div className="space-y-2 px-3 pb-3">
                {draft.working_hours && (
                  <p className="text-xs text-text">
                    <span className="font-medium">Carga horária:</span> {draft.working_hours}
                  </p>
                )}
                {draft.nice_to_have_skills.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-text-muted mb-1">Diferenciais</p>
                    <ul className="space-y-0.5">
                      {draft.nice_to_have_skills.map((s) => (
                        <li key={s} className="text-xs text-text">
                          • {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {draft.benefits.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-text-muted mb-1">Benefícios</p>
                    <ul className="space-y-0.5">
                      {draft.benefits.map((b) => (
                        <li key={b} className="text-xs text-text">
                          • {b}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {draft.screening_questions.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-text-muted mb-1">
                      Perguntas de triagem
                    </p>
                    <ul className="space-y-0.5">
                      {draft.screening_questions.map((q, i) => (
                        // index key is safe — list is static after render
                        <li key={i} className="text-xs text-text">
                          {q}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </details>
          )}

          {/* Usage (collapsible) */}
          {usage && (
            <details className="rounded-xl border border-border" data-testid="usage-section">
              <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-text-muted">
                Uso de IA
              </summary>
              <div className="space-y-0.5 px-3 pb-3">
                <p className="text-xs text-text-muted">
                  Entrada:{" "}
                  <span className="text-text" data-testid="usage-input-tokens">
                    {usage.input_tokens} tokens
                  </span>
                </p>
                <p className="text-xs text-text-muted">
                  Saída:{" "}
                  <span className="text-text" data-testid="usage-output-tokens">
                    {usage.output_tokens} tokens
                  </span>
                </p>
                <p className="text-xs text-text-muted">
                  Total:{" "}
                  <span className="text-text" data-testid="usage-total-tokens">
                    {usage.total_tokens} tokens
                  </span>
                </p>
                <p className="text-xs text-text-muted">
                  Modelo: <span className="text-text">{usage.model}</span>
                </p>
              </div>
            </details>
          )}

          {/* Apply */}
          <Button type="button" size="sm" onClick={handleApply} className="w-full">
            Aplicar ao formulário
          </Button>
        </div>
      )}

      {/* Confirmation dialog */}
      {showConfirm && (
        <div
          role="dialog"
          aria-label="Confirmar substituição dos dados"
          aria-describedby="confirm-apply-desc"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
        >
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl space-y-4">
            <p className="text-sm font-semibold text-text">Substituir dados do formulário?</p>
            <p id="confirm-apply-desc" className="text-sm text-text-muted">
              O formulário já possui dados. Aplicar o rascunho irá sobrescrever os campos básicos.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowConfirm(false)}
              >
                Cancelar
              </Button>
              <Button type="button" size="sm" onClick={confirmApply}>
                Confirmar e aplicar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
