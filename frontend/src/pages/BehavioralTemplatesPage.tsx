import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, Plus, ChevronDown, ChevronRight, Layers, FileText, BarChart2, List, Loader2, X, Check } from "lucide-react";
import { behavioralTemplatesService } from "../services/behavioralTemplatesService";
import type { BehavioralAssessmentTemplate, BehavioralTemplateCompetency, BehavioralTemplateQuestion } from "../types/domain";
import { toast } from "@/shared/utils/toast";
import { TemplateGalleryModal } from "../features/behavioral-templates/TemplateGalleryModal";
import { importTemplateToApi, type RawTemplate } from "../features/behavioral-templates/templateImporter";

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  active: "Ativo",
  archived: "Arquivado",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  archived: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const ANSWER_TYPE_LABEL: Record<string, string> = {
  text: "Texto livre",
  scale: "Escala",
  multiple_choice: "Múltipla escolha",
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function QuestionTypeIcon({ type }: { type: string }) {
  if (type === "scale") return <BarChart2 className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--text-muted))]" />;
  if (type === "multiple_choice") return <List className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--text-muted))]" />;
  return <FileText className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--text-muted))]" />;
}

function QuestionItem({ question, index }: { question: BehavioralTemplateQuestion; index: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-2">
        <QuestionTypeIcon type={question.answer_type} />
        <p className="text-sm text-[hsl(var(--text))] leading-snug">
          <span className="font-medium text-[hsl(var(--text-muted))] mr-1">{index}.</span>
          {question.question_text}
          {question.is_required && (
            <span className="ml-1 text-[hsl(var(--danger))] text-xs">*</span>
          )}
        </p>
      </div>
      <div className="pl-5 flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-1.5 py-0.5 text-[10px] font-semibold text-[hsl(var(--text-muted))]">
          {ANSWER_TYPE_LABEL[question.answer_type] ?? question.answer_type}
        </span>
        {question.answer_type === "multiple_choice" && question.options_json && question.options_json.length > 0 && (
          <div className="mt-1 space-y-0.5 w-full">
            {question.options_json.map((opt, i) => (
              <p key={i} className="text-xs text-[hsl(var(--text-muted))]">
                <span className="font-medium">{String.fromCharCode(97 + i)})</span> {opt}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CompetencySection({
  competency,
  questionOffset,
}: {
  competency: BehavioralTemplateCompetency;
  questionOffset: number;
}) {
  const questions = competency.questions ?? [];
  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-4 py-3 bg-[hsl(var(--surface-muted))]">
        <div className="min-w-0">
          <p className="font-semibold text-sm text-[hsl(var(--text))]">{competency.name}</p>
          {competency.description && (
            <p className="mt-0.5 text-xs text-[hsl(var(--text-muted))] line-clamp-2">{competency.description}</p>
          )}
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <span className="rounded-full bg-[hsl(var(--primary))]/10 px-2 py-0.5 text-[10px] font-bold text-[hsl(var(--primary))]">
            peso {competency.weight}
          </span>
          <span className="text-[10px] text-[hsl(var(--text-muted))]">
            {questions.length} {questions.length === 1 ? "pergunta" : "perguntas"}
          </span>
        </div>
      </div>
      {questions.length > 0 ? (
        <div className="divide-y divide-[hsl(var(--border))]">
          {questions.map((q, qi) => (
            <div key={q.id} className="px-4 py-3">
              <QuestionItem question={q} index={questionOffset + qi + 1} />
            </div>
          ))}
        </div>
      ) : (
        <div className="px-4 py-3">
          <p className="text-xs text-[hsl(var(--text-muted))] italic">Nenhuma pergunta nesta competência.</p>
        </div>
      )}
    </div>
  );
}

function TemplateDetailView({ detail }: { detail: BehavioralAssessmentTemplate }) {
  const competencies = detail.competencies ?? [];
  if (competencies.length === 0) {
    return (
      <p className="text-sm text-[hsl(var(--text-muted))] italic">
        Este template ainda não possui competências.
      </p>
    );
  }
  let questionOffset = 0;
  return (
    <div className="space-y-3">
      {competencies.map((comp) => {
        const section = (
          <CompetencySection key={comp.id} competency={comp} questionOffset={questionOffset} />
        );
        questionOffset += (comp.questions ?? []).length;
        return section;
      })}
    </div>
  );
}

// ── Inline edit form inside the card ──────────────────────────────────────────

function InlineEditForm({
  template,
  onSave,
  onCancel,
}: {
  template: BehavioralAssessmentTemplate;
  onSave: (data: { name: string; description: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? "");
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Nome do template é obrigatório");
      return;
    }
    setSaving(true);
    try {
      await onSave({ name: name.trim(), description });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-5 py-4 space-y-4">
      <p className="text-xs font-bold uppercase tracking-widest text-[hsl(var(--text-muted))]">
        Editar template
      </p>
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-[hsl(var(--text))] mb-1">Nome</label>
          <input
            ref={nameRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSave();
              if (e.key === "Escape") onCancel();
            }}
            className="ui-input w-full"
            placeholder="Nome do template"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[hsl(var(--text))] mb-1">Descrição</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onCancel();
            }}
            className="ui-input w-full resize-none"
            placeholder="Descrição opcional…"
            rows={2}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          onClick={() => void handleSave()}
          disabled={saving}
          size="sm"
          className="flex items-center gap-1.5"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Salvar
        </Button>
        <Button onClick={onCancel} disabled={saving} size="sm" variant="outline" className="flex items-center gap-1.5">
          <X className="h-3.5 w-3.5" />
          Cancelar
        </Button>
      </div>
    </div>
  );
}

// ── New template form (top of page) ───────────────────────────────────────────

function NewTemplateForm({
  onSave,
  onCancel,
}: {
  onSave: (data: { name: string; description: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Nome do template é obrigatório");
      return;
    }
    setSaving(true);
    try {
      await onSave({ name: name.trim(), description });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-5 py-5 space-y-4">
      <p className="text-sm font-bold text-[hsl(var(--text))]">Novo template</p>
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-[hsl(var(--text))] mb-1">Nome</label>
          <input
            ref={nameRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSave();
              if (e.key === "Escape") onCancel();
            }}
            className="ui-input w-full"
            placeholder="Ex: Avaliação de Liderança"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[hsl(var(--text))] mb-1">Descrição</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="ui-input w-full resize-none"
            placeholder="Descrição do template…"
            rows={2}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={() => void handleSave()} disabled={saving} size="sm" className="flex items-center gap-1.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Criar
        </Button>
        <Button onClick={onCancel} disabled={saving} size="sm" variant="outline" className="flex items-center gap-1.5">
          <X className="h-3.5 w-3.5" />
          Cancelar
        </Button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type TabKey = "templates" | "arquivados";

export function BehavioralTemplatesPage() {
  const [templates, setTemplates] = useState<BehavioralAssessmentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("templates");
  const [newTemplateOpen, setNewTemplateOpen] = useState(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [importingName, setImportingName] = useState<string | null>(null);
  // Which card is in inline edit mode (mutually exclusive with expanded)
  const [editingId, setEditingId] = useState<string | null>(null);
  // Which card is expanded to show competencies/questions
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Detail cache: fetched lazily on expand, keyed by template ID
  const [detailCache, setDetailCache] = useState<Record<string, BehavioralAssessmentTemplate>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    try {
      setLoading(true);
      setError(null);
      const data = await behavioralTemplatesService.listTemplates();
      setTemplates(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar templates");
      toast.error("Erro ao carregar templates");
    } finally {
      setLoading(false);
    }
  }

  function invalidateDetailCache(id: string) {
    setDetailCache((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function handleExpandTemplate(templateId: string) {
    // Editing and expanding are mutually exclusive
    if (editingId === templateId) return;

    const isClosing = expandedId === templateId;
    setExpandedId(isClosing ? null : templateId);
    if (isClosing || detailCache[templateId]) return;

    setDetailLoading(templateId);
    try {
      const detail = await behavioralTemplatesService.getTemplate(templateId);
      setDetailCache((prev) => ({ ...prev, [templateId]: detail }));
    } catch {
      // Section stays open but shows the error state
    } finally {
      setDetailLoading(null);
    }
  }

  function handleStartEdit(template: BehavioralAssessmentTemplate) {
    // Close expand + new form before entering edit mode
    setExpandedId(null);
    setNewTemplateOpen(false);
    setEditingId(template.id);
  }

  function handleCancelEdit() {
    setEditingId(null);
  }

  async function handleSaveEdit(id: string, data: { name: string; description: string }) {
    await behavioralTemplatesService.updateTemplate(id, data);
    toast.success("Template atualizado");
    invalidateDetailCache(id);
    setEditingId(null);
    await loadTemplates();
  }

  async function handleCreateTemplate(data: { name: string; description: string }) {
    try {
      await behavioralTemplatesService.createTemplate(data);
      toast.success("Template criado");
      setNewTemplateOpen(false);
      await loadTemplates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar template");
    }
  }

  async function handleActivate(id: string) {
    try {
      await behavioralTemplatesService.activateTemplate(id);
      toast.success("Template ativado");
      invalidateDetailCache(id);
      await loadTemplates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao ativar template");
    }
  }

  async function handleArchive(id: string) {
    try {
      await behavioralTemplatesService.archiveTemplate(id);
      toast.success("Template arquivado");
      invalidateDetailCache(id);
      await loadTemplates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao arquivar template");
    }
  }

  async function handleImportTemplate(template: RawTemplate) {
    setImportingName(template.name);
    try {
      await importTemplateToApi(template, behavioralTemplatesService);
      toast.success(`Template "${template.name.replace("Avaliação Comportamental — ", "")}" importado`);
      setIsGalleryOpen(false);
      await loadTemplates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao importar template");
    } finally {
      setImportingName(null);
    }
  }

  const visibleTemplates = templates.filter((t) =>
    activeTab === "arquivados" ? t.status === "archived" : t.status !== "archived",
  );

  const archivedCount = templates.filter((t) => t.status === "archived").length;

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-[hsl(var(--text-muted))]">Carregando templates…</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* ── Header ── */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[hsl(var(--text))]">Templates Comportamentais</h1>
          <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
            Gerencie templates de avaliação com competências e perguntas
          </p>
        </div>
        {activeTab === "templates" && (
          <div className="flex gap-2">
            <Button
              onClick={() => setIsGalleryOpen(true)}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Layers className="h-4 w-4" />
              Usar modelo pronto
            </Button>
            <Button
              onClick={() => {
                setNewTemplateOpen(true);
                setEditingId(null);
              }}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Novo Template
            </Button>
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="mb-5 flex gap-1 border-b border-[hsl(var(--border))]">
        <button
          type="button"
          onClick={() => {
            setActiveTab("templates");
            setNewTemplateOpen(false);
            setEditingId(null);
            setExpandedId(null);
          }}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === "templates"
              ? "border-[hsl(var(--primary))] text-[hsl(var(--primary))]"
              : "border-transparent text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text))]"
          }`}
        >
          Templates
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab("arquivados");
            setNewTemplateOpen(false);
            setEditingId(null);
            setExpandedId(null);
          }}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === "arquivados"
              ? "border-[hsl(var(--primary))] text-[hsl(var(--primary))]"
              : "border-transparent text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text))]"
          }`}
        >
          Arquivados
          {archivedCount > 0 && (
            <span className="rounded-full bg-[hsl(var(--surface-muted))] px-1.5 py-0.5 text-xs font-semibold text-[hsl(var(--text-muted))]">
              {archivedCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-900 dark:text-red-400">Erro</p>
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        </div>
      )}

      {/* ── New template form (top of page, only in Templates tab) ── */}
      {activeTab === "templates" && newTemplateOpen && (
        <NewTemplateForm
          onSave={handleCreateTemplate}
          onCancel={() => setNewTemplateOpen(false)}
        />
      )}

      {/* ── Empty state ── */}
      {visibleTemplates.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-[hsl(var(--border))] p-12 text-center">
          {activeTab === "arquivados" ? (
            <p className="text-[hsl(var(--text-muted))]">Nenhum template arquivado</p>
          ) : (
            <>
              <p className="text-[hsl(var(--text-muted))]">Nenhum template criado ainda</p>
              <Button
                onClick={() => setNewTemplateOpen(true)}
                variant="ghost"
                className="mt-4"
              >
                Criar primeiro template
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {visibleTemplates.map((template) => {
            const isEditing = editingId === template.id;
            const isExpanded = expandedId === template.id;
            const isArchived = template.status === "archived";

            return (
              <div
                key={template.id}
                className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] overflow-hidden"
              >
                {/* ── Inline edit form (not available for archived) ── */}
                {isEditing ? (
                  <InlineEditForm
                    template={template}
                    onSave={(data) => handleSaveEdit(template.id, data)}
                    onCancel={handleCancelEdit}
                  />
                ) : (
                  /* ── Normal card header ── */
                  <div
                    className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-[hsl(var(--surface-muted))] transition-colors select-none"
                    onClick={() => void handleExpandTemplate(template.id)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-5 w-5 shrink-0 text-[hsl(var(--text-muted))]" />
                    ) : (
                      <ChevronRight className="h-5 w-5 shrink-0 text-[hsl(var(--text-muted))]" />
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className={`font-semibold ${isArchived ? "text-[hsl(var(--text-muted))]" : "text-[hsl(var(--text))]"}`}>
                          {template.name}
                        </h3>
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[template.status] ?? "bg-gray-100 text-gray-700"}`}
                        >
                          {STATUS_LABEL[template.status] ?? template.status}
                        </span>
                      </div>
                      {template.description && (
                        <p className="mt-1 text-sm text-[hsl(var(--text-muted))] line-clamp-1">
                          {template.description}
                        </p>
                      )}
                      <div className="mt-1.5 flex gap-4 text-xs text-[hsl(var(--text-muted))]">
                        <span>{template.competency_count} {template.competency_count === 1 ? "competência" : "competências"}</span>
                        <span>{template.question_count} {template.question_count === 1 ? "pergunta" : "perguntas"}</span>
                        <span>v{template.version}</span>
                      </div>
                    </div>

                    {/* Buttons — stop propagation so clicks don't toggle expand */}
                    <div
                      className="flex shrink-0 gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {(template.status === "draft" || isArchived) && (
                        <Button
                          onClick={() => void handleActivate(template.id)}
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          Ativar
                        </Button>
                      )}
                      {!isArchived && (
                        <>
                          <Button
                            onClick={() => handleStartEdit(template)}
                            size="sm"
                            variant="outline"
                          >
                            Editar
                          </Button>
                          <Button
                            onClick={() => void handleArchive(template.id)}
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                          >
                            Arquivar
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Expanded detail (only when not editing) ── */}
                {isExpanded && !isEditing && (
                  <div className="border-t border-[hsl(var(--border))] bg-[hsl(var(--bg))] px-5 py-5">
                    {detailLoading === template.id ? (
                      <div className="flex items-center gap-2 text-sm text-[hsl(var(--text-muted))]">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Carregando competências e perguntas…
                      </div>
                    ) : detailCache[template.id] ? (
                      <TemplateDetailView detail={detailCache[template.id]} />
                    ) : (
                      <p className="text-sm text-[hsl(var(--text-muted))] italic">
                        Não foi possível carregar os detalhes. Tente expandir novamente.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Gallery modal ── */}
      {isGalleryOpen && (
        <TemplateGalleryModal
          onClose={() => setIsGalleryOpen(false)}
          onImport={handleImportTemplate}
          importingName={importingName}
        />
      )}
    </div>
  );
}
