import { useEffect, useMemo, useState } from "react";
import { Archive, ArrowDown, ArrowUp, Copy, Plus, RefreshCcw, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  AssessmentOption,
  AssessmentQuestion,
  AssessmentQuestionType,
  AssessmentTemplateDetail,
  AssessmentTemplateStatus,
  AssessmentType,
} from "../types/domain";
import { assessmentsService } from "../services/assessmentsService";
import { toast } from "../shared/utils/toast";
import { handleApiError } from "../shared/utils/errorHandler";

const TYPE_LABEL: Record<AssessmentType, string> = {
  behavioral_test: "Teste comportamental",
  behavioral_survey: "Pesquisa comportamental",
};

const STATUS_LABEL: Record<AssessmentTemplateStatus, string> = {
  draft: "Rascunho",
  active: "Ativo",
  archived: "Arquivado",
};

type TemplateListItem = {
  id: string;
  title: string;
  type: AssessmentType;
  status: AssessmentTemplateStatus;
  version: number;
  question_count: number;
  updated_at: string;
};

type QuestionDraft = {
  question_text: string;
  question_type: AssessmentQuestionType;
  required: boolean;
  order_index: number;
  metadataMin: string;
  metadataMax: string;
  options: Array<{ option_text: string; order_index: number }>;
};

const EMPTY_QUESTION_DRAFT: QuestionDraft = {
  question_text: "",
  question_type: "single_choice",
  required: true,
  order_index: 0,
  metadataMin: "1",
  metadataMax: "5",
  options: [
    { option_text: "", order_index: 1 },
    { option_text: "", order_index: 2 },
  ],
};

function choiceQuestion(type: AssessmentQuestionType): boolean {
  return type === "single_choice" || type === "multiple_choice";
}

function scaleMetadata(min: string, max: string): Record<string, number> {
  return {
    min: Number(min || "1"),
    max: Number(max || "5"),
  };
}

export function AssessmentsAdminPage() {
  const [typeFilter, setTypeFilter] = useState<"all" | AssessmentType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | AssessmentTemplateStatus>("all");
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<AssessmentTemplateDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const [newTemplateTitle, setNewTemplateTitle] = useState("");
  const [newTemplateType, setNewTemplateType] = useState<AssessmentType>("behavioral_test");
  const [newTemplateStatus, setNewTemplateStatus] = useState<AssessmentTemplateStatus>("draft");
  const [questionDraft, setQuestionDraft] = useState<QuestionDraft>(EMPTY_QUESTION_DRAFT);
  const [optionDrafts, setOptionDrafts] = useState<Record<string, string>>({});

  const selectedTypeOptions = useMemo(() => choiceQuestion(questionDraft.question_type), [questionDraft.question_type]);
  const structuralLocked = Boolean(
    selectedTemplate && selectedTemplate.status === "active" && selectedTemplate.is_used,
  );
  const selectedQuestions = selectedTemplate?.questions ?? [];

  async function loadTemplates() {
    setLoading(true);
    try {
      const result = await assessmentsService.listTemplates({
        type: typeFilter === "all" ? undefined : typeFilter,
        status: statusFilter === "all" ? undefined : statusFilter,
      });
      setTemplates(result);
      if (!selectedTemplateId && result.length > 0) {
        setSelectedTemplateId(result[0].id);
      }
      if (selectedTemplateId && !result.some((template) => template.id === selectedTemplateId)) {
        setSelectedTemplateId(result[0]?.id ?? null);
      }
    } catch (error) {
      toast.error(handleApiError(error).message);
    } finally {
      setLoading(false);
    }
  }

  async function loadTemplateDetail(templateId: string) {
    try {
      const detail = await assessmentsService.getTemplate(templateId);
      setSelectedTemplate(detail);
    } catch (error) {
      setSelectedTemplate(null);
      toast.error(handleApiError(error).message);
    }
  }

  useEffect(() => {
    void loadTemplates();
  }, [typeFilter, statusFilter]);

  useEffect(() => {
    if (!selectedTemplateId) {
      setSelectedTemplate(null);
      return;
    }
    void loadTemplateDetail(selectedTemplateId);
  }, [selectedTemplateId]);

  async function refreshSelected(templateId = selectedTemplate?.id) {
    await loadTemplates();
    if (templateId) {
      await loadTemplateDetail(templateId);
    }
  }

  async function runMutation(action: () => Promise<void>) {
    setSaving(true);
    try {
      await action();
    } catch (error) {
      toast.error(handleApiError(error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateTemplate() {
    const title = newTemplateTitle.trim();
    if (!title) {
      toast.error("Informe um título para a avaliação.");
      return;
    }
    await runMutation(async () => {
      const created = await assessmentsService.createTemplate({
        title,
        type: newTemplateType,
        status: newTemplateStatus,
      });
      toast.success("Template criado.");
      setNewTemplateTitle("");
      setSelectedTemplateId(created.id);
      await refreshSelected(created.id);
    });
  }

  async function handleUpdateTemplateMetadata() {
    if (!selectedTemplate) return;
    await runMutation(async () => {
      await assessmentsService.updateTemplate(selectedTemplate.id, {
        title: selectedTemplate.title,
        description: selectedTemplate.description,
        status: selectedTemplate.status,
      });
      toast.success("Template atualizado.");
      await refreshSelected(selectedTemplate.id);
    });
  }

  async function handleArchiveTemplate() {
    if (!selectedTemplate) return;
    await runMutation(async () => {
      await assessmentsService.archiveTemplate(selectedTemplate.id);
      toast.success("Template arquivado.");
      await refreshSelected(selectedTemplate.id);
    });
  }

  async function handleDuplicateTemplate() {
    if (!selectedTemplate) return;
    await runMutation(async () => {
      const duplicated = await assessmentsService.duplicateTemplate(selectedTemplate.id, {
        title: `${selectedTemplate.title} (cópia)`,
        status: "draft",
      });
      toast.success("Template duplicado.");
      setSelectedTemplateId(duplicated.id);
      await refreshSelected(duplicated.id);
    });
  }

  async function handleAddQuestion() {
    if (!selectedTemplate || structuralLocked) return;
    const questionText = questionDraft.question_text.trim();
    if (!questionText) {
      toast.error("Informe o texto da pergunta.");
      return;
    }
    const options = selectedTypeOptions
      ? questionDraft.options
          .filter((item) => item.option_text.trim())
          .map((item) => ({
            option_text: item.option_text.trim(),
            order_index: item.order_index,
          }))
      : [];

    await runMutation(async () => {
      await assessmentsService.createQuestion(selectedTemplate.id, {
        question_text: questionText,
        question_type: questionDraft.question_type,
        required: questionDraft.required,
        order_index: Number(questionDraft.order_index || selectedQuestions.length + 1),
        metadata: questionDraft.question_type === "scale" ? scaleMetadata(questionDraft.metadataMin, questionDraft.metadataMax) : undefined,
        options,
      });
      toast.success("Pergunta adicionada.");
      setQuestionDraft(EMPTY_QUESTION_DRAFT);
      await refreshSelected(selectedTemplate.id);
    });
  }

  async function handleUpdateQuestion(question: AssessmentQuestion) {
    if (!selectedTemplate || structuralLocked) return;
    await runMutation(async () => {
      await assessmentsService.updateQuestion(question.id, {
        question_text: question.question_text,
        question_type: question.question_type,
        required: question.required,
        order_index: question.order_index,
        metadata: question.metadata,
      });
      toast.success("Pergunta atualizada.");
      await refreshSelected(selectedTemplate.id);
    });
  }

  async function handleMoveQuestion(index: number, direction: -1 | 1) {
    if (!selectedTemplate || structuralLocked) return;
    const nextIndex = index + direction;
    const current = selectedQuestions[index];
    const next = selectedQuestions[nextIndex];
    if (!current || !next) return;
    await runMutation(async () => {
      await assessmentsService.updateQuestion(current.id, { order_index: next.order_index });
      await assessmentsService.updateQuestion(next.id, { order_index: current.order_index });
      toast.success("Ordem da pergunta atualizada.");
      await refreshSelected(selectedTemplate.id);
    });
  }

  async function handleDeleteQuestion(questionId: string) {
    if (!selectedTemplate || structuralLocked) return;
    await runMutation(async () => {
      await assessmentsService.deleteQuestion(questionId);
      toast.success("Pergunta removida.");
      await refreshSelected(selectedTemplate.id);
    });
  }

  async function handleAddOption(question: AssessmentQuestion) {
    if (!selectedTemplate || structuralLocked) return;
    const value = optionDrafts[question.id]?.trim();
    if (!value) {
      toast.error("Informe o texto da alternativa.");
      return;
    }
    await runMutation(async () => {
      await assessmentsService.createOption(question.id, {
        option_text: value,
        order_index: question.options.length + 1,
      });
      toast.success("Alternativa adicionada.");
      setOptionDrafts((current) => ({ ...current, [question.id]: "" }));
      await refreshSelected(selectedTemplate.id);
    });
  }

  async function handleUpdateOption(option: AssessmentOption) {
    if (!selectedTemplate || structuralLocked) return;
    await runMutation(async () => {
      await assessmentsService.updateOption(option.id, {
        option_text: option.option_text,
        order_index: option.order_index,
        score_value: option.score_value,
        metadata: option.metadata,
      });
      toast.success("Alternativa atualizada.");
      await refreshSelected(selectedTemplate.id);
    });
  }

  async function handleMoveOption(question: AssessmentQuestion, index: number, direction: -1 | 1) {
    if (!selectedTemplate || structuralLocked) return;
    const nextIndex = index + direction;
    const current = question.options[index];
    const next = question.options[nextIndex];
    if (!current || !next) return;
    await runMutation(async () => {
      await assessmentsService.updateOption(current.id, { order_index: next.order_index });
      await assessmentsService.updateOption(next.id, { order_index: current.order_index });
      toast.success("Ordem da alternativa atualizada.");
      await refreshSelected(selectedTemplate.id);
    });
  }

  async function handleDeleteOption(optionId: string) {
    if (!selectedTemplate || structuralLocked) return;
    await runMutation(async () => {
      await assessmentsService.deleteOption(optionId);
      toast.success("Alternativa removida.");
      await refreshSelected(selectedTemplate.id);
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-5">
        <h1 className="text-2xl font-semibold text-[hsl(var(--text))]">Avaliações</h1>
        <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
          Gerencie templates de testes e pesquisas comportamentais usados no processo seletivo.
        </p>
      </header>

      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="space-y-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[hsl(var(--text))]">Templates</h2>
            <Button type="button" variant="outline" onClick={() => void loadTemplates()} disabled={loading || saving}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Atualizar
            </Button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as "all" | AssessmentType)}
              className="ui-input h-10 rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 text-sm"
            >
              <option value="all">Todos os tipos</option>
              <option value="behavioral_test">Teste comportamental</option>
              <option value="behavioral_survey">Pesquisa comportamental</option>
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "all" | AssessmentTemplateStatus)}
              className="ui-input h-10 rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 text-sm"
            >
              <option value="all">Todos os status</option>
              <option value="draft">Rascunho</option>
              <option value="active">Ativo</option>
              <option value="archived">Arquivado</option>
            </select>
          </div>

          <div className="space-y-2 rounded-2xl border border-dashed border-[hsl(var(--border))] p-3">
            <p className="text-xs font-medium text-[hsl(var(--text-muted))]">Criar avaliação</p>
            <input
              value={newTemplateTitle}
              onChange={(event) => setNewTemplateTitle(event.target.value)}
              placeholder="Título do template"
              className="ui-input h-10 w-full rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 text-sm"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                value={newTemplateType}
                onChange={(event) => setNewTemplateType(event.target.value as AssessmentType)}
                className="ui-input h-10 rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 text-sm"
              >
                <option value="behavioral_test">Teste comportamental</option>
                <option value="behavioral_survey">Pesquisa comportamental</option>
              </select>
              <select
                value={newTemplateStatus}
                onChange={(event) => setNewTemplateStatus(event.target.value as AssessmentTemplateStatus)}
                className="ui-input h-10 rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 text-sm"
              >
                <option value="draft">Rascunho</option>
                <option value="active">Ativo</option>
                <option value="archived">Arquivado</option>
              </select>
            </div>
            <Button type="button" className="w-full" onClick={() => void handleCreateTemplate()} disabled={saving}>
              <Plus className="mr-2 h-4 w-4" />
              Criar avaliação
            </Button>
          </div>

          <div className="max-h-[56vh] space-y-2 overflow-auto pr-1">
            {templates.map((template) => {
              const isSelected = template.id === selectedTemplateId;
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setSelectedTemplateId(template.id)}
                  className={[
                    "w-full rounded-2xl border px-3 py-3 text-left transition",
                    isSelected
                      ? "border-[hsl(var(--primary))] bg-[hsl(var(--accent-soft))]"
                      : "border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/40 hover:border-[hsl(var(--primary))]/40",
                  ].join(" ")}
                >
                  <p className="text-sm font-semibold text-[hsl(var(--text))]">{template.title}</p>
                  <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">
                    {TYPE_LABEL[template.type]} · {STATUS_LABEL[template.status]} · v{template.version}
                  </p>
                  <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">
                    {template.question_count} pergunta(s)
                  </p>
                </button>
              );
            })}
            {!loading && templates.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[hsl(var(--border))] p-4 text-sm text-[hsl(var(--text-muted))]">
                Nenhuma avaliação encontrada para os filtros atuais.
              </p>
            ) : null}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
          {!selectedTemplate ? (
            <p className="rounded-2xl border border-dashed border-[hsl(var(--border))] p-5 text-sm text-[hsl(var(--text-muted))]">
              Selecione um template para editar perguntas e opções.
            </p>
          ) : (
            <>
              <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
                <div>
                  <p className="text-xs uppercase tracking-wide text-[hsl(var(--text-muted))]">
                    {TYPE_LABEL[selectedTemplate.type]} · v{selectedTemplate.version}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-[hsl(var(--text))]">Editar template</h2>
                  {structuralLocked ? (
                    <p className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      Este template já está em uso. Para alterar perguntas/opções, duplique o template.
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => void handleDuplicateTemplate()} disabled={saving}>
                    <Copy className="mr-2 h-4 w-4" />
                    Duplicar
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void handleArchiveTemplate()} disabled={saving}>
                    <Archive className="mr-2 h-4 w-4" />
                    Arquivar
                  </Button>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs text-[hsl(var(--text-muted))]">
                  Título
                  <input
                    value={selectedTemplate.title}
                    onChange={(event) =>
                      setSelectedTemplate((current) => current ? { ...current, title: event.target.value } : current)
                    }
                    className="ui-input mt-1 h-10 w-full rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 text-sm"
                  />
                </label>
                <label className="text-xs text-[hsl(var(--text-muted))]">
                  Status
                  <select
                    value={selectedTemplate.status}
                    onChange={(event) =>
                      setSelectedTemplate((current) =>
                        current ? { ...current, status: event.target.value as AssessmentTemplateStatus } : current,
                      )
                    }
                    className="ui-input mt-1 h-10 w-full rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 text-sm"
                  >
                    <option value="draft">Rascunho</option>
                    <option value="active">Ativo</option>
                    <option value="archived">Arquivado</option>
                  </select>
                </label>
              </div>
              <label className="text-xs text-[hsl(var(--text-muted))]">
                Descrição
                <textarea
                  value={selectedTemplate.description ?? ""}
                  onChange={(event) =>
                    setSelectedTemplate((current) => current ? { ...current, description: event.target.value } : current)
                  }
                  className="ui-input mt-1 min-h-[84px] w-full rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-2 text-sm"
                />
              </label>
              <Button type="button" onClick={() => void handleUpdateTemplateMetadata()} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                Salvar template
              </Button>

              <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/35 p-3">
                <p className="text-sm font-semibold text-[hsl(var(--text))]">Adicionar pergunta</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <input
                    value={questionDraft.question_text}
                    onChange={(event) => setQuestionDraft((current) => ({ ...current, question_text: event.target.value }))}
                    placeholder="Texto da pergunta"
                    disabled={structuralLocked}
                    className="ui-input h-10 rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 text-sm disabled:opacity-60 sm:col-span-2"
                  />
                  <select
                    value={questionDraft.question_type}
                    onChange={(event) =>
                      setQuestionDraft((current) => ({ ...current, question_type: event.target.value as AssessmentQuestionType }))
                    }
                    disabled={structuralLocked}
                    className="ui-input h-10 rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 text-sm disabled:opacity-60"
                  >
                    <option value="single_choice">Escolha única</option>
                    <option value="multiple_choice">Múltipla escolha</option>
                    <option value="scale">Escala</option>
                    <option value="text">Texto</option>
                  </select>
                  <input
                    type="number"
                    min={0}
                    aria-label="Ordem da nova pergunta"
                    value={questionDraft.order_index}
                    onChange={(event) => setQuestionDraft((current) => ({ ...current, order_index: Number(event.target.value) }))}
                    disabled={structuralLocked}
                    className="ui-input h-10 rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 text-sm disabled:opacity-60"
                  />
                </div>

                {selectedTypeOptions ? (
                  <div className="mt-2 space-y-2">
                    {questionDraft.options.map((item, index) => (
                      <input
                        key={`${item.order_index}-${index}`}
                        value={item.option_text}
                        onChange={(event) =>
                          setQuestionDraft((current) => ({
                            ...current,
                            options: current.options.map((option, optionIndex) =>
                              optionIndex === index ? { ...option, option_text: event.target.value } : option,
                            ),
                          }))
                        }
                        placeholder={`Alternativa ${index + 1}`}
                        disabled={structuralLocked}
                        className="ui-input h-10 w-full rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 text-sm disabled:opacity-60"
                      />
                    ))}
                  </div>
                ) : null}

                {questionDraft.question_type === "scale" ? (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <input
                      value={questionDraft.metadataMin}
                      onChange={(event) => setQuestionDraft((current) => ({ ...current, metadataMin: event.target.value }))}
                      placeholder="Mínimo"
                      disabled={structuralLocked}
                      className="ui-input h-10 rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 text-sm disabled:opacity-60"
                    />
                    <input
                      value={questionDraft.metadataMax}
                      onChange={(event) => setQuestionDraft((current) => ({ ...current, metadataMax: event.target.value }))}
                      placeholder="Máximo"
                      disabled={structuralLocked}
                      className="ui-input h-10 rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 text-sm disabled:opacity-60"
                    />
                  </div>
                ) : null}

                <label className="mt-2 flex items-center gap-2 text-xs text-[hsl(var(--text-muted))]">
                  <input
                    type="checkbox"
                    checked={questionDraft.required}
                    onChange={(event) => setQuestionDraft((current) => ({ ...current, required: event.target.checked }))}
                    disabled={structuralLocked}
                  />
                  Pergunta obrigatória
                </label>

                <Button type="button" className="mt-3" onClick={() => void handleAddQuestion()} disabled={saving || structuralLocked}>
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar pergunta
                </Button>
              </div>

              <div className="space-y-3">
                {selectedQuestions.map((question, questionIndex) => (
                  <div key={question.id} className="rounded-2xl border border-[hsl(var(--border))] p-3">
                    <div className="grid gap-2 lg:grid-cols-[1fr_160px_120px_auto]">
                      <label className="text-xs text-[hsl(var(--text-muted))]">
                        Pergunta
                        <input
                          value={question.question_text}
                          onChange={(event) =>
                            setSelectedTemplate((current) =>
                              current
                                ? {
                                    ...current,
                                    questions: current.questions.map((item) =>
                                      item.id === question.id ? { ...item, question_text: event.target.value } : item,
                                    ),
                                  }
                                : current,
                            )
                          }
                          disabled={structuralLocked}
                          className="ui-input mt-1 h-10 w-full rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 text-sm disabled:opacity-60"
                        />
                      </label>
                      <label className="text-xs text-[hsl(var(--text-muted))]">
                        Obrigatória
                        <select
                          value={question.required ? "yes" : "no"}
                          onChange={(event) =>
                            setSelectedTemplate((current) =>
                              current
                                ? {
                                    ...current,
                                    questions: current.questions.map((item) =>
                                      item.id === question.id ? { ...item, required: event.target.value === "yes" } : item,
                                    ),
                                  }
                                : current,
                            )
                          }
                          disabled={structuralLocked}
                          className="ui-input mt-1 h-10 w-full rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 text-sm disabled:opacity-60"
                        >
                          <option value="yes">Sim</option>
                          <option value="no">Não</option>
                        </select>
                      </label>
                      <label className="text-xs text-[hsl(var(--text-muted))]">
                        Ordem
                        <input
                          type="number"
                          value={question.order_index}
                          onChange={(event) =>
                            setSelectedTemplate((current) =>
                              current
                                ? {
                                    ...current,
                                    questions: current.questions.map((item) =>
                                      item.id === question.id ? { ...item, order_index: Number(event.target.value) } : item,
                                    ),
                                  }
                                : current,
                            )
                          }
                          disabled={structuralLocked}
                          className="ui-input mt-1 h-10 w-full rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 text-sm disabled:opacity-60"
                        />
                      </label>
                      <div className="flex items-end gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label="Mover pergunta para cima"
                          onClick={() => void handleMoveQuestion(questionIndex, -1)}
                          disabled={saving || structuralLocked || questionIndex === 0}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label="Mover pergunta para baixo"
                          onClick={() => void handleMoveQuestion(questionIndex, 1)}
                          disabled={saving || structuralLocked || questionIndex === selectedQuestions.length - 1}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          aria-label="Salvar pergunta"
                          onClick={() => void handleUpdateQuestion(question)}
                          disabled={saving || structuralLocked}
                        >
                          <Save className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Remover pergunta"
                          onClick={() => void handleDeleteQuestion(question.id)}
                          disabled={saving || structuralLocked}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <p className="mt-2 text-xs text-[hsl(var(--text-muted))]">
                      Tipo: {question.question_type}
                    </p>

                    {question.options.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {question.options.map((option, optionIndex) => (
                          <div key={option.id} className="grid gap-2 rounded-xl bg-[hsl(var(--surface-muted))]/55 p-2 sm:grid-cols-[1fr_96px_auto]">
                            <input
                              value={option.option_text}
                              aria-label={`Texto da alternativa ${optionIndex + 1}`}
                              onChange={(event) =>
                                setSelectedTemplate((current) =>
                                  current
                                    ? {
                                        ...current,
                                        questions: current.questions.map((item) =>
                                          item.id === question.id
                                            ? {
                                                ...item,
                                                options: item.options.map((currentOption) =>
                                                  currentOption.id === option.id
                                                    ? { ...currentOption, option_text: event.target.value }
                                                    : currentOption,
                                                ),
                                              }
                                            : item,
                                        ),
                                      }
                                    : current,
                                )
                              }
                              disabled={structuralLocked}
                              className="ui-input h-9 rounded-lg border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-2 text-sm disabled:opacity-60"
                            />
                            <input
                              type="number"
                              value={option.order_index}
                              aria-label={`Ordem da alternativa ${optionIndex + 1}`}
                              onChange={(event) =>
                                setSelectedTemplate((current) =>
                                  current
                                    ? {
                                        ...current,
                                        questions: current.questions.map((item) =>
                                          item.id === question.id
                                            ? {
                                                ...item,
                                                options: item.options.map((currentOption) =>
                                                  currentOption.id === option.id
                                                    ? { ...currentOption, order_index: Number(event.target.value) }
                                                    : currentOption,
                                                ),
                                              }
                                            : item,
                                        ),
                                      }
                                    : current,
                                )
                              }
                              disabled={structuralLocked}
                              className="ui-input h-9 rounded-lg border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-2 text-sm disabled:opacity-60"
                            />
                            <div className="flex gap-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                aria-label="Mover alternativa para cima"
                                onClick={() => void handleMoveOption(question, optionIndex, -1)}
                                disabled={saving || structuralLocked || optionIndex === 0}
                              >
                                <ArrowUp className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                aria-label="Mover alternativa para baixo"
                                onClick={() => void handleMoveOption(question, optionIndex, 1)}
                                disabled={saving || structuralLocked || optionIndex === question.options.length - 1}
                              >
                                <ArrowDown className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                aria-label="Salvar alternativa"
                                onClick={() => void handleUpdateOption(option)}
                                disabled={saving || structuralLocked}
                              >
                                <Save className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="Remover alternativa"
                                onClick={() => void handleDeleteOption(option.id)}
                                disabled={saving || structuralLocked}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {choiceQuestion(question.question_type) ? (
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <input
                          value={optionDrafts[question.id] ?? ""}
                          onChange={(event) => setOptionDrafts((current) => ({ ...current, [question.id]: event.target.value }))}
                          placeholder="Nova alternativa"
                          disabled={structuralLocked}
                          className="ui-input h-10 flex-1 rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 text-sm disabled:opacity-60"
                        />
                        <Button type="button" variant="outline" onClick={() => void handleAddOption(question)} disabled={saving || structuralLocked}>
                          <Plus className="mr-2 h-4 w-4" />
                          Adicionar opção
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
                {selectedQuestions.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-[hsl(var(--border))] p-4 text-sm text-[hsl(var(--text-muted))]">
                    Este template ainda não possui perguntas.
                  </p>
                ) : null}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
