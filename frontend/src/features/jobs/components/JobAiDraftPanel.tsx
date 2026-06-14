import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Info, Loader2, Plus, ShieldAlert, Sparkles, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { StatusPill } from "@/components/ui/status-pill";
import type { JobFormValues } from "../jobFormConfig";
import {
  applyApiDraftToForm,
  applyLegacyDraftToForm,
  extractSkillSuggestions,
  JOB_AI_PROMPT_EXAMPLE,
} from "../utils/jobAiDraftHelpers";
import {
  generateJobAiDraft,
  generateJobAiDraftFromImage,
  type JobAiDraftFields,
  type JobAiDraftSafetyCheck,
  type JobAiDraftSuggestedSkill,
} from "../services/jobAiDraftService";

interface JobAiDraftPanelProps {
  formHasData: boolean;
  currentFormSnapshot?: Pick<JobFormValues, "salary_min" | "salary_max" | "benefits">;
  onApply: (
    updates: Partial<JobFormValues>,
    skillSuggestions: { mandatory: string[]; optional: string[] },
  ) => void;
  onClose?: () => void;
}

type AiStatus = "idle" | "loading" | "ready" | "error";
type DraftInputMode = "text" | "image";

const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg"];
const ACCEPTED_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg"];

/**
 * @deprecated Use applyApiDraftToForm from jobAiDraftHelpers.ts instead.
 * Kept only for backwards-compat with existing tests that import this.
 */
export const draftToFormUpdates = applyLegacyDraftToForm;

function SectionTitle({ children }: { children: string }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{children}</p>;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex flex-col gap-1 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <span className="font-medium text-text">{label}</span>
      <span className="text-text-muted sm:text-right">{value}</span>
    </li>
  );
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

function SuggestedSkillStatusBadge({
  status,
}: {
  status: JobAiDraftSuggestedSkill["catalog_status"];
}) {
  const config =
    status === "existing"
      ? { label: "Existente no catálogo", className: "bg-success-soft text-success" }
      : status === "conflict"
        ? { label: "Conflito — revisar", className: "bg-danger-soft text-danger" }
        : { label: "Nova sugestão", className: "bg-warning-soft text-warning" };

  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${config.className}`}>
      {config.label}
    </span>
  );
}

function getSuggestedSkillKey(item: JobAiDraftSuggestedSkill) {
  return [
    item.name,
    item.importance,
    item.catalog_status,
    item.catalog_skill_id ?? item.catalog_skill_name ?? "catalog-skill",
  ].join("::");
}

function formatSuggestedSkillImportance(importance: JobAiDraftSuggestedSkill["importance"]) {
  if (importance === "essential") return "Essencial";
  if (importance === "differential") return "Diferencial";
  return "Competência";
}

function formatOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "Não será preenchido";
}

function formatOptionalNumber(value: number | null | undefined, suffix = "") {
  if (value === null || value === undefined) return "Não será preenchido";
  return `${value}${suffix}`;
}

function formatListSummary(items: string[] | null | undefined) {
  if (!Array.isArray(items) || items.length === 0) return "Não será preenchido";
  return items.map((item) => item.trim()).filter(Boolean).join(", ") || "Não será preenchido";
}

function formatSalaryRange(min: number | null | undefined, max: number | null | undefined) {
  if (min == null && max == null) return null;
  if (min != null && max != null) {
    return `R$ ${min.toLocaleString("pt-BR")} a R$ ${max.toLocaleString("pt-BR")}`;
  }
  if (min != null) return `A partir de R$ ${min.toLocaleString("pt-BR")}`;
  return `Até R$ ${max?.toLocaleString("pt-BR")}`;
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

export function JobAiDraftPanel({
  formHasData,
  currentFormSnapshot,
  onApply,
  onClose,
}: JobAiDraftPanelProps) {
  const [inputMode, setInputMode] = useState<DraftInputMode>("text");
  const [prompt, setPrompt] = useState("");
  const [contextText, setContextText] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus>("idle");
  const [draft, setDraft] = useState<JobAiDraftFields | null>(null);
  const [needsReview, setNeedsReview] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [safetyCheck, setSafetyCheck] = useState<JobAiDraftSafetyCheck | null>(null);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedSuggestedSkillKeys, setSelectedSuggestedSkillKeys] = useState<string[]>([]);

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

  const suggestedSkillReviewGroups = useMemo(() => {
    const groups: Record<"existing" | "new" | "conflict", JobAiDraftSuggestedSkill[]> = {
      existing: [],
      new: [],
      conflict: [],
    };

    for (const item of draft?.suggested_skills ?? []) {
      groups[item.catalog_status].push(item);
    }

    return groups;
  }, [draft]);

  useEffect(() => {
    const defaults = (draft?.suggested_skills ?? [])
      .filter((item) => item.catalog_status === "existing")
      .map((item) => getSuggestedSkillKey(item));
    setSelectedSuggestedSkillKeys(defaults);
  }, [draft]);

  const selectedSuggestedSkillCount = useMemo(
    () => selectedSuggestedSkillKeys.length,
    [selectedSuggestedSkillKeys],
  );

  const confirmSummary = useMemo(() => {
    if (!draft) return null;

    const draftSalaryRange = formatSalaryRange(draft.salary_min, draft.salary_max);
    const currentSalaryRange = formatSalaryRange(
      currentFormSnapshot?.salary_min,
      currentFormSnapshot?.salary_max,
    );
    const draftBenefits = Array.isArray(draft.benefits)
      ? draft.benefits.map((item) => item.trim()).filter(Boolean)
      : [];
    const hasDraftBenefits = draftBenefits.length > 0;
    const hasDraftSalary = Boolean(draftSalaryRange);

    return {
      title: formatOptionalText(draft.title),
      area: formatOptionalText(draft.area),
      seniority: formatOptionalText(draft.seniority),
      workModel: formatOptionalText(draft.work_model),
      unit: formatOptionalText(draft.unit),
      workingHours: formatOptionalText(draft.working_hours),
      description: formatOptionalText(draft.description),
      responsibilities: formatListSummary(draft.responsibilities),
      requirements: formatListSummary(draft.requirements),
      education: formatOptionalText(draft.minimum_education_level),
      experience: formatOptionalNumber(draft.minimum_years_experience, " ano(s)"),
      salary: draftSalaryRange
        ? `Rascunho indica ${draftSalaryRange}, mas salário não será aplicado automaticamente nesta fase.`
        : currentSalaryRange
          ? `Formulário atual: ${currentSalaryRange}. O rascunho não vai alterar salário nesta fase.`
          : "Nenhum salário ou benefício será preenchido por este rascunho.",
      benefits: hasDraftBenefits
        ? draftBenefits.join(", ")
        : "Nenhum salário ou benefício será preenchido por este rascunho.",
      mandatorySkills: formatListSummary(draft.mandatory_skills),
      niceToHaveSkills: formatListSummary(draft.nice_to_have_skills),
      screeningQuestions: formatListSummary(draft.screening_questions),
      suggestedSkillsInfo:
        draft.suggested_skills.length > 0
          ? "Skills sugeridas revisadas não serão aplicadas como catálogo nesta fase."
          : "Nenhuma skill sugerida adicional nesta fase.",
      operationalFlags: [
        draft.requires_manager_review ? "Requer revisão do gestor" : null,
        draft.requires_behavioral_assessment ? "Requer avaliação comportamental" : null,
      ].filter(Boolean) as string[],
      hasSensitiveDraftData: hasDraftBenefits || hasDraftSalary,
    };
  }, [currentFormSnapshot?.salary_max, currentFormSnapshot?.salary_min, draft]);

  function toggleSuggestedSkillSelection(item: JobAiDraftSuggestedSkill) {
    const key = getSuggestedSkillKey(item);
    setSelectedSuggestedSkillKeys((current) =>
      current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key],
    );
  }

  async function handleGenerate() {
    if (!prompt.trim()) {
      setAiStatus("error");
      setDraft(null);
      setNeedsReview([]);
      setWarnings([]);
      setSafetyCheck(null);
      setErrorMessage("Informe uma descrição para gerar o rascunho.");
      return;
    }

    setAiStatus("loading");
    setErrorMessage(null);
    setDraft(null);
    setNeedsReview([]);
    setWarnings([]);
    setSafetyCheck(null);
    setExtractedText(null);

    try {
      const response = await generateJobAiDraft({ text_input: prompt, ocr_text: null });
      setDraft(response.draft);
      setNeedsReview(response.needs_review ?? []);
      setWarnings(response.warnings ?? []);
      setSafetyCheck(response.safety_check ?? null);
      setExtractedText(response.extracted_text ?? null);
      setAiStatus("ready");
    } catch (err: unknown) {
      setAiStatus("error");
      const message =
        err instanceof Error && err.message ? err.message : "Não foi possível gerar o rascunho.";
      setErrorMessage(message);
    }
  }

  function validateImage(file: File): string | null {
    const fileName = file.name.toLowerCase();
    const allowedExtension = ACCEPTED_IMAGE_EXTENSIONS.some((ext) => fileName.endsWith(ext));
    const allowedMime = ACCEPTED_IMAGE_TYPES.includes(file.type);

    if (!allowedExtension || !allowedMime) {
      return "Envie uma imagem PNG ou JPG/JPEG para gerar o rascunho.";
    }

    if (file.size > 5 * 1024 * 1024) {
      return "A imagem excede o limite de 5 MB.";
    }

    return null;
  }

  function handleImageSelection(file: File | null) {
    setSelectedImage(file);
    setErrorMessage(null);
    if (!file) {
      return;
    }

    const validationError = validateImage(file);
    if (validationError) {
      setSelectedImage(null);
      setAiStatus("error");
      setErrorMessage(validationError);
    }
  }

  async function handleGenerateFromImage() {
    if (!selectedImage) {
      setAiStatus("error");
      setErrorMessage("Selecione uma imagem da vaga para extrair o rascunho.");
      return;
    }

    const validationError = validateImage(selectedImage);
    if (validationError) {
      setAiStatus("error");
      setErrorMessage(validationError);
      return;
    }

    setAiStatus("loading");
    setErrorMessage(null);
    setDraft(null);
    setNeedsReview([]);
    setWarnings([]);
    setSafetyCheck(null);
    setExtractedText(null);

    try {
      const response = await generateJobAiDraftFromImage(selectedImage, contextText);
      setDraft(response.draft);
      setNeedsReview(response.needs_review ?? []);
      setWarnings(response.warnings ?? []);
      setSafetyCheck(response.safety_check ?? null);
      setExtractedText(response.extracted_text ?? null);
      setAiStatus("ready");
    } catch (err: unknown) {
      setAiStatus("error");
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Não foi possível extrair a imagem e gerar o rascunho.";
      setErrorMessage(message);
    }
  }

  function updateDraftField(field: keyof JobAiDraftFields, value: string) {
    setDraft((prev) => (prev ? { ...prev, [field]: value } : null));
  }

  function updateDraftNumberField(field: keyof JobAiDraftFields, value: string) {
    setDraft((prev) => (prev ? { ...prev, [field]: value ? Number(value) : null } : null));
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
    setShowConfirm(true);
  }

  function handleDiscard() {
    setDraft(null);
    setNeedsReview([]);
    setWarnings([]);
    setSafetyCheck(null);
    setExtractedText(null);
    setAiStatus("idle");
    setErrorMessage(null);
  }

  const NEEDS_REVIEW_LABELS: Record<string, string> = {
    salary_range: "Faixa salarial não informada",
    unit: "Local de trabalho não informado",
    work_model: "Modelo de trabalho não informado",
    title: "Título não gerado",
    description: "Descrição não gerada",
    extracted_text: "Texto extraído da imagem exige revisão",
  };

  const WARNING_LABELS: Record<string, string> = {
    salary_removed_no_source_evidence:
      "Salário removido porque não havia evidência explícita no texto.",
    benefit_removed_no_source_evidence:
      "Benefício removido porque não havia evidência explícita no texto.",
    minimum_years_experience_removed_no_source_evidence:
      "Experiência mínima removida porque não havia evidência explícita no texto.",
    minimum_education_level_removed_no_source_evidence:
      "Escolaridade mínima removida porque não havia evidência explícita no texto.",
    experience_context_removed_no_source_evidence:
      "Contexto de experiência removido porque não havia evidência explícita no texto.",
    requires_manager_review_removed_no_source_evidence:
      "Revisão do gestor removida porque não havia evidência explícita no texto.",
    requires_manager_review_preserved_from_source:
      "Revisão do gestor preservada porque havia evidência explícita no texto.",
    requires_behavioral_assessment_removed_no_source_evidence:
      "Avaliação comportamental removida porque não havia evidência explícita no texto.",
    requires_behavioral_assessment_preserved_from_source:
      "Avaliação comportamental preservada porque havia evidência explícita no texto.",
    selection_flow_type_requires_manual_review:
      "Fluxo de seleção identificado no texto, mas exige revisão manual antes de configurar o formulário.",
    discriminatory_text_removed:
      "Texto potencialmente discriminatório foi removido e precisa de validação humana.",
    safety_check_requires_review:
      "A checagem de segurança identificou pontos que exigem revisão humana antes de aplicar.",
    nice_to_have_preserved_from_source:
      "Um diferencial explícito da imagem foi mantido como opcional e não como requisito obrigatório.",
    image_text_extraction_requires_review:
      "O texto extraído da imagem pode conter OCR imperfeito. Revise antes de aplicar.",
    ocr_text_may_be_incomplete:
      "A extração da imagem parece parcial. Confirme título, requisitos, jornada e benefícios.",
  };

  const SAFETY_FIELD_LABELS: Record<string, string> = {
    title: "Título",
    description: "Descrição",
    requirements: "Requisitos",
    responsibilities: "Responsabilidades",
    benefits: "Benefícios",
    salary_range: "Faixa salarial",
    minimum_education_level: "Escolaridade mínima",
    minimum_years_experience: "Experiência mínima",
  };

  const SAFETY_SEVERITY_LABELS: Record<"low" | "medium" | "high", string> = {
    low: "Baixa",
    medium: "Média",
    high: "Alta",
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
              Escolha como enviar o conteúdo da vaga para gerar um rascunho revisável.
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
          <Tabs
            value={inputMode}
            onValueChange={(value) => setInputMode(value as DraftInputMode)}
            data-testid="ai-draft-mode-tabs"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="text">Colar descrição</TabsTrigger>
              <TabsTrigger value="image">Enviar imagem</TabsTrigger>
            </TabsList>

            <TabsContent value="text" className="space-y-4">
              <p className="text-sm text-text-muted">
                Cole a descrição da vaga e gere um rascunho revisável.
              </p>
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
                    onClick={() => setPrompt(JOB_AI_PROMPT_EXAMPLE)}
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
              </div>
            </TabsContent>

            <TabsContent value="image" className="space-y-4" data-testid="ai-draft-image-tab">
              <p className="text-sm text-text-muted">
                Envie uma arte da vaga. A IA extrai as informações e gera um rascunho revisável.
              </p>

              <div className="space-y-3 rounded-xl border border-dashed border-border bg-surface px-4 py-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-text">Enviar imagem da vaga</p>
                  <p className="text-xs text-text-muted">
                    Aceita PNG e JPG/JPEG. A imagem gera apenas um rascunho revisável.
                  </p>
                </div>

                <label
                  htmlFor="ai-draft-image-input"
                  className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-border bg-background px-4 py-5 text-center text-sm text-text-muted transition hover:border-[hsl(var(--primary))]/40"
                >
                  <span className="font-medium text-text">Selecionar imagem</span>
                  <span className="mt-1 text-xs">Clique para enviar a arte da vaga</span>
                </label>
                <input
                  id="ai-draft-image-input"
                  type="file"
                  accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                  className="sr-only"
                  data-testid="ai-draft-image-input"
                  onChange={(event) => handleImageSelection(event.target.files?.[0] ?? null)}
                />

                {selectedImage && (
                  <div
                    className="rounded-lg border border-border bg-surface-muted/70 px-3 py-2 text-sm text-text"
                    data-testid="ai-draft-image-filename"
                  >
                    {selectedImage.name}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="ai-draft-context-text" className="text-sm font-medium text-text">
                  Contexto adicional opcional
                </label>
                <Textarea
                  id="ai-draft-context-text"
                  value={contextText}
                  onChange={(event) => setContextText(event.target.value)}
                  className="min-h-[96px] text-sm"
                  placeholder="Ex: priorizar informações do banner e manter benefícios exatamente como estiverem na imagem."
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  onClick={() => void handleGenerateFromImage()}
                  disabled={isLoading}
                  data-testid="ai-draft-generate-image-btn"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                      Extraindo e gerando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
                      Extrair e gerar rascunho
                    </>
                  )}
                </Button>
              </div>

              <p className="text-xs text-text-muted">
                O rascunho é para revisão humana — não salva nem publica automaticamente.
              </p>
            </TabsContent>
          </Tabs>
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

              {extractedText && (
                <div
                  className="space-y-2 rounded-xl border border-border bg-surface px-3 py-3"
                  data-testid="ai-draft-extracted-text"
                >
                  <SectionTitle>Texto extraído da imagem</SectionTitle>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-text-muted">
                    {extractedText}
                  </p>
                </div>
              )}

              {warnings.length > 0 && (
                <div
                  className="space-y-1 rounded-xl border border-[hsl(var(--warning))]/25 bg-warning-soft px-3 py-2 text-sm text-warning"
                  data-testid="ai-draft-warnings"
                >
                  <span className="font-medium">Ajustes automáticos de segurança:</span>
                  <ul className="list-disc space-y-1 pl-4">
                    {warnings.map((warning) => (
                      <li key={warning}>{WARNING_LABELS[warning] ?? warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              {safetyCheck?.status === "needs_review" && (
                <div
                  role="alert"
                  className="space-y-2 rounded-xl border border-[hsl(var(--danger))]/25 bg-danger-soft px-3 py-3 text-sm text-danger"
                  data-testid="ai-draft-safety-check"
                >
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <div className="space-y-1">
                      <p className="font-medium">Revisão de segurança necessária</p>
                      <p>
                        A IA removeu ou bloqueou conteúdo sensível. Revise os campos sinalizados
                        antes de aplicar o rascunho ao formulário.
                      </p>
                    </div>
                  </div>

                  {safetyCheck.highest_severity && (
                    <p className="pl-6">
                      <span className="font-medium">Severidade </span>
                      {SAFETY_SEVERITY_LABELS[safetyCheck.highest_severity]}
                    </p>
                  )}

                  {safetyCheck.findings.length > 0 && (
                    <ul className="list-disc space-y-1 pl-10">
                      {safetyCheck.findings.map((finding, index) => (
                        <li key={`${finding.field}-${finding.code}-${index}`}>
                          <span className="font-medium">
                            {SAFETY_FIELD_LABELS[finding.field] ?? finding.field}
                          </span>
                          {": "}
                          {finding.message}
                        </li>
                      ))}
                    </ul>
                  )}
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
                <div>
                  <SectionTitle>Escolaridade mínima</SectionTitle>
                  <Input
                    value={draft.minimum_education_level ?? ""}
                    onChange={(e) => updateDraftField("minimum_education_level", e.target.value)}
                    className="mt-1 h-8 text-sm"
                    aria-label="Escolaridade mínima"
                  />
                </div>
                <div>
                  <SectionTitle>Anos mínimos de experiência</SectionTitle>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={draft.minimum_years_experience ?? ""}
                    onChange={(e) => updateDraftNumberField("minimum_years_experience", e.target.value)}
                    className="mt-1 h-8 text-sm"
                    data-testid="draft-min-years"
                    aria-label="Anos mínimos de experiência"
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
                <div className="rounded-xl border border-border bg-surface px-3 py-3">
                  <SectionTitle>Contexto de experiência</SectionTitle>
                  <Textarea
                    value={draft.experience_context ?? ""}
                    onChange={(e) => updateDraftField("experience_context", e.target.value)}
                    className="mt-2 min-h-[100px] text-sm leading-6"
                    data-testid="draft-experience-context"
                    aria-label="Contexto de experiência"
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

            {draft.suggested_skills.length > 0 && (
              <div
                className="space-y-4 rounded-xl border border-border bg-surface px-4 py-4"
                data-testid="draft-suggested-skills"
              >
                <div className="space-y-2">
                  <SectionTitle>Revisão de skills sugeridas</SectionTitle>
                  <p className="text-sm text-text-muted">
                    As skills sugeridas ajudam a revisar o rascunho gerado pela IA. A criação de
                    novas skills no catálogo não é automática.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-3" data-testid="draft-suggested-skills-summary">
                    <div className="rounded-xl border border-success/20 bg-success-soft/60 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-success">
                        Existentes selecionadas
                      </p>
                      <p className="mt-1 text-lg font-semibold text-text">{selectedSuggestedSkillCount}</p>
                    </div>
                    <div className="rounded-xl border border-warning/20 bg-warning-soft/60 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-warning">
                        Novas sugestões
                      </p>
                      <p className="mt-1 text-lg font-semibold text-text">
                        {suggestedSkillReviewGroups.new.length}
                      </p>
                    </div>
                    <div className="rounded-xl border border-danger/20 bg-danger-soft/60 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-danger">
                        Conflitos
                      </p>
                      <p className="mt-1 text-lg font-semibold text-text">
                        {suggestedSkillReviewGroups.conflict.length}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-text-muted">
                    A seleção abaixo é apenas visual nesta fase. O botão “Aplicar ao formulário”
                    continua usando os campos estruturados do rascunho como antes.
                  </p>
                </div>

                {(
                  [
                    [
                      "existing",
                      "Encontradas no catálogo",
                      "Encontrada no catálogo. Pode ser usada com segurança no matching IA.",
                    ],
                    [
                      "new",
                      "Novas sugestões",
                      "Nova sugestão. Não será criada automaticamente no catálogo.",
                    ],
                    [
                      "conflict",
                      "Conflitos",
                      "Conflito de catálogo. Escolha manualmente a skill correta antes de confiar no matching.",
                    ],
                  ] as const
                ).map(([status, label, helperText]) => {
                  const items = suggestedSkillReviewGroups[status];
                  if (items.length === 0) return null;

                  return (
                    <div key={status} className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                        {label} ({items.length})
                      </p>
                      <div className="space-y-3" data-testid={`draft-suggested-skills-group-${status}`}>
                        {items.map((item) => {
                          const itemKey = getSuggestedSkillKey(item);
                          const isSelected = selectedSuggestedSkillKeys.includes(itemKey);

                          return (
                          <div
                            key={itemKey}
                            className="rounded-xl border border-border bg-background px-3 py-3"
                            data-testid={`draft-suggested-skill-${item.catalog_status}`}
                          >
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSuggestedSkillSelection(item)}
                                className="mt-1 h-4 w-4 rounded border-border text-[hsl(var(--primary))] focus:ring-[hsl(var(--primary))]"
                                aria-label={`Selecionar skill sugerida ${item.name}`}
                                data-testid={`draft-suggested-skill-checkbox-${item.catalog_status}-${item.name}`}
                              />
                              <div className="min-w-0 flex-1 space-y-3">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="text-sm font-semibold text-text">{item.name}</p>
                                      <Badge variant="outline" className="rounded-md px-2 py-0.5 text-[11px]">
                                        {item.category}
                                      </Badge>
                                      <Badge variant="secondary" className="rounded-md px-2 py-0.5 text-[11px]">
                                        {formatSuggestedSkillImportance(item.importance)}
                                      </Badge>
                                    </div>
                                    {item.description && (
                                      <p className="text-sm text-text-muted">{item.description}</p>
                                    )}
                                  </div>
                                  <SuggestedSkillStatusBadge status={item.catalog_status} />
                                </div>

                                {item.aliases.length > 0 && (
                                  <div className="space-y-1">
                                    <p className="text-xs font-medium text-text-muted">Aliases sugeridos</p>
                                    <ChipList items={item.aliases} />
                                  </div>
                                )}

                                {item.catalog_status === "existing" && item.catalog_skill_name && (
                                  <div className="space-y-1 text-xs text-success">
                                    <p>
                                      Nome no catálogo: <span className="font-semibold">{item.catalog_skill_name}</span>
                                    </p>
                                    {item.catalog_matched_by.length > 0 && (
                                      <p>Correspondência: {item.catalog_matched_by.join(", ")}</p>
                                    )}
                                  </div>
                                )}

                                {item.catalog_status === "conflict" && item.catalog_conflicts.length > 0 && (
                                  <details className="rounded-lg border border-danger/20 bg-danger-soft/50 px-3 py-2 text-xs text-danger">
                                    <summary className="cursor-pointer font-medium">
                                      Possíveis matches no catálogo ({item.catalog_conflicts.length})
                                    </summary>
                                    <ul className="mt-2 list-disc space-y-1 pl-4">
                                      {item.catalog_conflicts.map((conflict) => (
                                        <li key={conflict}>{conflict}</li>
                                      ))}
                                    </ul>
                                  </details>
                                )}

                                <p className="text-xs text-text-muted">{helperText}</p>
                              </div>
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

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

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent
          className="max-h-[90vh] max-w-3xl overflow-y-auto"
          data-testid="job-ai-apply-confirmation-dialog"
        >
          <DialogHeader>
            <DialogTitle>Aplicar rascunho da IA?</DialogTitle>
            <DialogDescription className="space-y-2">
              <span className="block">
                A IA vai preencher ou alterar campos do formulário. Revise antes de continuar.
              </span>
              {formHasData ? (
                <span className="block">
                  O formulário já possui dados e alguns campos poderão ser sobrescritos por este rascunho.
                </span>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          {confirmSummary ? (
            <div className="space-y-4">
              <section className="rounded-xl border border-border bg-surface p-4">
                <SectionTitle>Informações principais</SectionTitle>
                <ul className="mt-3 space-y-3">
                  <SummaryRow label="Título" value={confirmSummary.title} />
                  <SummaryRow label="Área" value={confirmSummary.area} />
                  <SummaryRow label="Senioridade" value={confirmSummary.seniority} />
                  <SummaryRow label="Modalidade" value={confirmSummary.workModel} />
                  <SummaryRow label="Localização/unidade" value={confirmSummary.unit} />
                  <SummaryRow label="Jornada" value={confirmSummary.workingHours} />
                </ul>
              </section>

              <section className="rounded-xl border border-border bg-surface p-4">
                <SectionTitle>Descrição e requisitos</SectionTitle>
                <ul className="mt-3 space-y-3">
                  <SummaryRow label="Descrição" value={confirmSummary.description} />
                  <SummaryRow label="Responsabilidades" value={confirmSummary.responsibilities} />
                  <SummaryRow label="Requisitos" value={confirmSummary.requirements} />
                  <SummaryRow label="Escolaridade" value={confirmSummary.education} />
                  <SummaryRow label="Experiência mínima" value={confirmSummary.experience} />
                </ul>
              </section>

              <section
                className={`rounded-xl border p-4 ${
                  confirmSummary.hasSensitiveDraftData
                    ? "border-warning bg-warning-soft/40"
                    : "border-border bg-surface"
                }`}
              >
                <SectionTitle>Salário e benefícios</SectionTitle>
                <ul className="mt-3 space-y-3">
                  <SummaryRow label="Salário/faixa salarial" value={confirmSummary.salary} />
                  <SummaryRow label="Benefícios" value={confirmSummary.benefits} />
                </ul>
                <p className="mt-4 text-sm font-medium text-text">
                  Revise salário, benefícios e requisitos antes de aplicar. O rascunho da IA não salva
                  nem publica a vaga automaticamente.
                </p>
              </section>

              <section className="rounded-xl border border-border bg-surface p-4">
                <SectionTitle>Skills e perguntas</SectionTitle>
                <ul className="mt-3 space-y-3">
                  <SummaryRow label="Mandatory skills" value={confirmSummary.mandatorySkills} />
                  <SummaryRow label="Nice to have skills" value={confirmSummary.niceToHaveSkills} />
                  <SummaryRow label="Screening questions" value={confirmSummary.screeningQuestions} />
                  <SummaryRow label="Suggested skills" value={confirmSummary.suggestedSkillsInfo} />
                </ul>
              </section>

              <section className="rounded-xl border border-border bg-surface p-4">
                <SectionTitle>Campos operacionais</SectionTitle>
                <ul className="mt-3 space-y-3">
                  <SummaryRow
                    label="Flags relevantes"
                    value={
                      confirmSummary.operationalFlags.length > 0
                        ? confirmSummary.operationalFlags.join(", ")
                        : "Nenhum campo operacional será alterado"
                    }
                  />
                </ul>
              </section>
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowConfirm(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={confirmApply}>
              Aplicar rascunho
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
