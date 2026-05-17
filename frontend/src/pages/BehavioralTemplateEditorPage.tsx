import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ChevronUp,
  ChevronDown,
  Trash2,
  Copy,
  Plus,
  Eye,
  Info,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Settings2,
  FileText,
  BarChart,
  List,
  Save,
  HelpCircle,
  HelpCircle as QuestionIcon,
  Sparkles,
  ClipboardCheck,
  UserCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/shared/utils/toast";
import { behavioralTemplatesService } from "../services/behavioralTemplatesService";
import type {
  BehavioralAssessmentTemplate,
  BehavioralTemplateCompetency,
  BehavioralTemplateQuestion
} from "../types/domain";
import {
  parseTemplateDescription,
  serializeTemplateDescription,
  parseQuestionText,
  serializeQuestionText,
  type TemplateDescriptionMetadata,
  type QuestionTextMetadata
} from "../features/behavioral-templates/behavioralTemplateHelper";

export function BehavioralTemplateEditorPage() {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();

  const [template, setTemplate] = useState<BehavioralAssessmentTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editor states
  const [selectedCompId, setSelectedCompId] = useState<string | null>(null);
  const [selectedQuestId, setSelectedQuestId] = useState<string | null>(null);

  // Validation modal
  const [showValidation, setShowValidation] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Local edit states to prevent keystroke-level API spam and Visual stability/focus jumping
  const [localCompName, setLocalCompName] = useState("");
  const [localCompDesc, setLocalCompDesc] = useState("");
  const [localCompWeight, setLocalCompWeight] = useState<number | string>("");

  const [localQuestText, setLocalQuestText] = useState("");
  const [localQuestInstruction, setLocalQuestInstruction] = useState("");
  const [localQuestEvidence, setLocalQuestEvidence] = useState("");
  const [localQuestCriteria, setLocalQuestCriteria] = useState("");
  const [localQuestAlert, setLocalQuestAlert] = useState("");
  const [localQuestNotes, setLocalQuestNotes] = useState("");
  const [localQuestWeight, setLocalQuestWeight] = useState<number | string>("");
  const [localQuestOptions, setLocalQuestOptions] = useState<string[]>([]);
  const [localQuestScaleLabels, setLocalQuestScaleLabels] = useState<Record<number, string>>({});

  const selectedComp = template?.competencies?.find((c) => c.id === selectedCompId);
  const selectedQuest = selectedComp?.questions?.find((q) => q.id === selectedQuestId);
  const parsedQuestMetadata = selectedQuest ? parseQuestionText(selectedQuest.question_text) : null;

  useEffect(() => {
    if (selectedComp) {
      setLocalCompName(selectedComp.name);
      setLocalCompDesc(selectedComp.description ?? "");
      setLocalCompWeight(selectedComp.weight);
    } else {
      setLocalCompName("");
      setLocalCompDesc("");
      setLocalCompWeight("");
    }
  }, [selectedCompId, selectedComp?.id]);

  useEffect(() => {
    if (selectedQuest && parsedQuestMetadata) {
      setLocalQuestText(parsedQuestMetadata.text);
      setLocalQuestInstruction(parsedQuestMetadata.instruction ?? "");
      setLocalQuestEvidence(parsedQuestMetadata.evidence ?? "");
      setLocalQuestCriteria(parsedQuestMetadata.criteria ?? "");
      setLocalQuestAlert(parsedQuestMetadata.alert ?? "");
      setLocalQuestNotes(parsedQuestMetadata.notes ?? "");
      setLocalQuestWeight(selectedQuest.weight);
      setLocalQuestOptions(selectedQuest.options_json ?? []);
      setLocalQuestScaleLabels(parsedQuestMetadata.scale_labels ?? {});
    } else {
      setLocalQuestText("");
      setLocalQuestInstruction("");
      setLocalQuestEvidence("");
      setLocalQuestCriteria("");
      setLocalQuestAlert("");
      setLocalQuestNotes("");
      setLocalQuestWeight("");
      setLocalQuestOptions([]);
      setLocalQuestScaleLabels({});
    }
  }, [selectedQuestId, selectedQuest?.id, JSON.stringify(selectedQuest?.options_json)]);

  useEffect(() => {
    if (templateId) {
      void loadTemplate();
    }
  }, [templateId]);

  async function loadTemplate() {
    try {
      setLoading(true);
      if (!templateId) return;
      const data = await behavioralTemplatesService.getTemplate(templateId);
      setTemplate(data);
    } catch (err) {
      toast.error("Erro ao carregar template");
    } finally {
      setLoading(false);
    }
  }

  // General details state
  const parsedDesc = parseTemplateDescription(template?.description);

  async function handleSaveGeneral(name: string, fields: Partial<TemplateDescriptionMetadata>) {
    if (!template) return;
    setSaving(true);
    try {
      const newDescObj: TemplateDescriptionMetadata = {
        description: fields.description ?? parsedDesc.description,
        category: fields.category ?? parsedDesc.category,
        target_audience: fields.target_audience ?? parsedDesc.target_audience,
        duration: fields.duration ?? parsedDesc.duration,
        flow_type: fields.flow_type ?? parsedDesc.flow_type,
        required_components: fields.required_components ?? parsedDesc.required_components,
      };

      await behavioralTemplatesService.updateTemplate(template.id, {
        name: name.trim(),
        description: serializeTemplateDescription(newDescObj),
      });

      toast.success("Informações gerais salvas");
      await loadTemplate();
    } catch (err) {
      toast.error("Erro ao atualizar informações");
    } finally {
      setSaving(false);
    }
  }

  // Competency CRUD operations
  async function handleAddCompetency() {
    if (!template) return;
    try {
      const nextOrder = (template.competencies?.length ?? 0);
      const newComp = await behavioralTemplatesService.createCompetency(template.id, {
        name: `Nova Competência ${nextOrder + 1}`,
        description: "Descrição da competência",
        weight: 10.0,
        display_order: nextOrder,
      });
      toast.success("Competência adicionada");
      await loadTemplate();
      setSelectedCompId(newComp.id);
      setSelectedQuestId(null);
    } catch {
      toast.error("Erro ao adicionar competência");
    }
  }

  async function handleUpdateCompetency(comp: BehavioralTemplateCompetency, fields: Partial<BehavioralTemplateCompetency>) {
    if (!template) return;
    try {
      await behavioralTemplatesService.updateCompetency(template.id, comp.id, {
        name: fields.name ?? comp.name,
        description: fields.description ?? comp.description,
        weight: fields.weight !== undefined ? Number(fields.weight) : comp.weight,
        display_order: fields.display_order !== undefined ? fields.display_order : comp.display_order,
      });
      toast.success("Competência atualizada");
      await loadTemplate();
    } catch {
      toast.error("Erro ao atualizar competência");
    }
  }

  async function handleDeleteCompetency(compId: string) {
    if (!template) return;
    if (!confirm("Tem certeza de que deseja remover esta competência e todas as suas perguntas?")) return;
    try {
      await behavioralTemplatesService.deleteCompetency(template.id, compId);
      toast.success("Competência removida");
      if (selectedCompId === compId) {
        setSelectedCompId(null);
        setSelectedQuestId(null);
      }
      await loadTemplate();
    } catch {
      toast.error("Erro ao remover competência");
    }
  }

  async function handleDuplicateCompetency(comp: BehavioralTemplateCompetency) {
    if (!template) return;
    try {
      const nextOrder = (template.competencies?.length ?? 0);
      const newComp = await behavioralTemplatesService.createCompetency(template.id, {
        name: `${comp.name} (Cópia)`,
        description: comp.description,
        weight: comp.weight,
        display_order: nextOrder,
      });

      // Duplicate questions
      if (comp.questions && comp.questions.length > 0) {
        for (const q of comp.questions) {
          await behavioralTemplatesService.createQuestion(template.id, newComp.id, {
            question_text: q.question_text,
            answer_type: q.answer_type,
            is_required: q.is_required,
            weight: q.weight,
            display_order: q.display_order,
            options_json: q.options_json,
          });
        }
      }

      toast.success("Competência duplicada");
      await loadTemplate();
      setSelectedCompId(newComp.id);
      setSelectedQuestId(null);
    } catch {
      toast.error("Erro ao duplicar competência");
    }
  }

  // Question CRUD operations
  async function handleAddQuestion(compId: string) {
    if (!template) return;
    const comp = template.competencies?.find((c) => c.id === compId);
    if (!comp) return;

    try {
      const nextOrder = (comp.questions?.length ?? 0);
      const initialText = serializeQuestionText({
        text: `Nova pergunta ${nextOrder + 1}`,
        custom_type: "text",
      });

      const newQ = await behavioralTemplatesService.createQuestion(template.id, compId, {
        question_text: initialText,
        answer_type: "text",
        is_required: true,
        weight: 10.0,
        display_order: nextOrder,
      });

      toast.success("Pergunta adicionada");
      await loadTemplate();
      setSelectedQuestId(newQ.id);
    } catch {
      toast.error("Erro ao adicionar pergunta");
    }
  }

  async function handleUpdateQuestion(quest: BehavioralTemplateQuestion, fields: Partial<BehavioralTemplateQuestion>) {
    if (!template || !selectedCompId) return;
    try {
      await behavioralTemplatesService.updateQuestion(template.id, selectedCompId, quest.id, {
        question_text: fields.question_text ?? quest.question_text,
        answer_type: fields.answer_type ?? quest.answer_type,
        is_required: fields.is_required !== undefined ? fields.is_required : quest.is_required,
        weight: fields.weight !== undefined ? Number(fields.weight) : quest.weight,
        display_order: fields.display_order !== undefined ? fields.display_order : quest.display_order,
        options_json: fields.options_json !== undefined ? fields.options_json : quest.options_json,
      });
      await loadTemplate();
    } catch {
      toast.error("Erro ao atualizar pergunta");
    }
  }

  async function handleDeleteQuestion(questId: string) {
    if (!template || !selectedCompId) return;
    if (!confirm("Tem certeza de que deseja remover esta pergunta?")) return;
    try {
      await behavioralTemplatesService.deleteQuestion(template.id, selectedCompId, questId);
      toast.success("Pergunta removida");
      if (selectedQuestId === questId) {
        setSelectedQuestId(null);
      }
      await loadTemplate();
    } catch {
      toast.error("Erro ao remover pergunta");
    }
  }

  async function handleDuplicateQuestion(quest: BehavioralTemplateQuestion) {
    if (!template || !selectedCompId) return;
    try {
      const comp = template.competencies?.find((c) => c.id === selectedCompId);
      if (!comp) return;
      const nextOrder = (comp.questions?.length ?? 0);

      const parsed = parseQuestionText(quest.question_text);
      const duplicatedText = serializeQuestionText({
        ...parsed,
        text: `${parsed.text} (Cópia)`,
      });

      const newQ = await behavioralTemplatesService.createQuestion(template.id, selectedCompId, {
        question_text: duplicatedText,
        answer_type: quest.answer_type,
        is_required: quest.is_required,
        weight: quest.weight,
        display_order: nextOrder,
        options_json: quest.options_json,
      });

      toast.success("Pergunta duplicada");
      await loadTemplate();
      setSelectedQuestId(newQ.id);
    } catch {
      toast.error("Erro ao duplicar pergunta");
    }
  }

  async function handleMoveQuestion(quest: BehavioralTemplateQuestion, direction: "up" | "down") {
    if (!template || !selectedCompId) return;
    const comp = template.competencies?.find((c) => c.id === selectedCompId);
    if (!comp || !comp.questions) return;

    const sorted = [...comp.questions].sort((a, b) => a.display_order - b.display_order);
    const idx = sorted.findIndex((q) => q.id === quest.id);

    if (direction === "up" && idx > 0) {
      const prev = sorted[idx - 1];
      await behavioralTemplatesService.updateQuestion(template.id, selectedCompId, quest.id, { display_order: prev.display_order });
      await behavioralTemplatesService.updateQuestion(template.id, selectedCompId, prev.id, { display_order: quest.display_order });
      await loadTemplate();
    } else if (direction === "down" && idx < sorted.length - 1) {
      const next = sorted[idx + 1];
      await behavioralTemplatesService.updateQuestion(template.id, selectedCompId, quest.id, { display_order: next.display_order });
      await behavioralTemplatesService.updateQuestion(template.id, selectedCompId, next.id, { display_order: quest.display_order });
      await loadTemplate();
    }
  }

  // Publication checklist validator
  function runValidationChecks(): string[] {
    const errors: string[] = [];
    if (!template) return errors;

    if (!template.name.trim()) {
      errors.push("O template deve possuir um nome preenchido.");
    }
    const tDesc = parseTemplateDescription(template.description);
    if (!tDesc.description.trim()) {
      errors.push("O template deve possuir uma descrição preenchida.");
    }

    const competencies = template.competencies ?? [];
    if (competencies.length === 0) {
      errors.push("O template precisa ter pelo menos 1 competência cadastrada.");
      return errors;
    }

    let compWeightSum = 0;
    for (const comp of competencies) {
      compWeightSum += comp.weight;
      if (comp.weight <= 0) {
        errors.push(`A competência "${comp.name}" deve possuir um peso maior que zero.`);
      }

      const questions = comp.questions ?? [];
      if (questions.length === 0) {
        errors.push(`A competência "${comp.name}" precisa ter pelo menos 1 pergunta cadastrada.`);
      }

      for (const q of questions) {
        const parsedQ = parseQuestionText(q.question_text);
        if (!parsedQ.text.trim()) {
          errors.push(`Há uma pergunta sem texto na competência "${comp.name}".`);
        }
        if (q.weight <= 0) {
          errors.push(`A pergunta "${parsedQ.text || 'sem texto'}" deve possuir um peso maior que zero.`);
        }
        if (q.answer_type === "multiple_choice") {
          const opts = q.options_json ?? [];
          if (opts.length < 2) {
            errors.push(`A pergunta de múltipla escolha "${parsedQ.text || 'sem texto'}" deve ter pelo menos 2 alternativas.`);
          }
        }
      }
    }

    if (Math.abs(compWeightSum - 100) > 0.01) {
      errors.push(`A soma dos pesos das competências deve ser exatamente 100%. Soma atual: ${compWeightSum}%.`);
    }

    return errors;
  }

  async function handlePublish() {
    if (!template) return;
    const errors = runValidationChecks();
    if (errors.length > 0) {
      setValidationErrors(errors);
      setShowValidation(true);
      return;
    }

    setSaving(true);
    try {
      await behavioralTemplatesService.activateTemplate(template.id);
      toast.success("Template publicado com sucesso!");
      navigate("/admin/behavioral-templates");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao publicar template");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[hsl(var(--bg))]">
        <div className="text-center space-y-2">
          <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--primary))] mx-auto" />
          <p className="text-[hsl(var(--text-muted))]">Carregando workspace do editor…</p>
        </div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="p-8 text-center bg-[hsl(var(--bg))] text-[hsl(var(--text-muted))]">
        Template não encontrado.
      </div>
    );
  }


  return (
    <div className="flex flex-col min-h-screen bg-[hsl(var(--bg))]">
      {/* ── TOP BAR ── */}
      <header className="border-b border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-6 py-4 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <button
              onClick={() => navigate("/admin/behavioral-templates")}
              className="flex items-center gap-1.5 text-xs text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text))] transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Voltar para avaliações
            </button>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-[hsl(var(--text))]">{template.name}</h1>
              <span className="rounded-full bg-[hsl(var(--surface-muted))] px-2.5 py-0.5 text-xs font-semibold text-[hsl(var(--text-muted))] border">
                v{template.version}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                template.status === "active" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
              }`}>
                {template.status === "active" ? "Ativo" : "Rascunho"}
              </span>
            </div>
            <p className="text-xs text-[hsl(var(--text-muted))]">
              Categoria: <span className="font-semibold">{parsedDesc.category}</span> | Duração: <span className="font-semibold">{parsedDesc.duration} min</span>
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => {
                const errs = runValidationChecks();
                setValidationErrors(errs);
                setShowValidation(true);
              }}
              variant="outline"
              className="flex items-center gap-1.5"
            >
              <ClipboardCheck className="h-4 w-4" /> Qualidade
            </Button>
            {template.status !== "active" && (
              <Button
                onClick={handlePublish}
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                Publicar Versão
              </Button>
            )}
          </div>
        </div>

        {/* Professional compliance regulatory banner */}
        <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs text-blue-900 leading-snug">
          <Info className="h-4 w-4 shrink-0 text-blue-600 mt-0.5" />
          <p>
            <strong>Aviso de Conformidade:</strong> Este é um modelo de avaliação comportamental operacional, não um teste psicológico. Use os resultados como apoio à decisão, nunca como critério único de contratação.
          </p>
        </div>
      </header>

      {/* ── WORKSPACE 3 COLUMNS ── */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        
        {/* COLUNA A: NAVEGAÇÃO LATERAL (3/12 cols) */}
        <section className="lg:col-span-3 border-r border-[hsl(var(--border))] bg-[hsl(var(--surface))] flex flex-col">
          <div className="p-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/30 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--text-muted))]">Competências</span>
            <Button size="sm" onClick={handleAddCompetency} className="h-7 px-2 flex items-center gap-1">
              <Plus className="h-3 w-3" /> Add
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            <button
              onClick={() => {
                setSelectedCompId(null);
                setSelectedQuestId(null);
              }}
              className={`w-full text-left px-3 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${
                selectedCompId === null
                  ? "bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]"
                  : "text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface-muted))]/60"
              }`}
            >
              <Settings2 className="h-4 w-4" /> Configurações Gerais
            </button>

            {template.competencies?.map((c) => (
              <div
                key={c.id}
                className={`group relative rounded-xl transition-all ${
                  selectedCompId === c.id ? "bg-[hsl(var(--surface-muted))]" : "hover:bg-[hsl(var(--surface-muted))]/40"
                }`}
              >
                <button
                  onClick={() => {
                    setSelectedCompId(c.id);
                    setSelectedQuestId(null);
                  }}
                  className="w-full text-left px-3 py-2.5 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-semibold truncate pr-4 ${selectedCompId === c.id ? "text-[hsl(var(--text))]" : "text-[hsl(var(--text-muted))]"}`}>
                      {c.name}
                    </span>
                    <span className="text-[10px] bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] font-bold rounded-full px-1.5 py-0.5 shrink-0">
                      p{c.weight}%
                    </span>
                  </div>
                  <p className="text-[10px] text-[hsl(var(--text-muted))] mt-0.5">
                    {c.questions?.length ?? 0} {c.questions?.length === 1 ? "pergunta" : "perguntas"}
                  </p>
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* COLUNA B: CONTEÚDO CENTRAL - BUILDER (5/12 cols) */}
        <section className="lg:col-span-5 border-r border-[hsl(var(--border))] bg-[hsl(var(--bg))] flex flex-col">
          {selectedCompId === null ? (
            /* CONFIGURAÇÕES GERAIS DO TEMPLATE */
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="border-b pb-4">
                <h2 className="text-base font-bold text-[hsl(var(--text))]">Informações Gerais</h2>
                <p className="text-xs text-[hsl(var(--text-muted))]">Metadados e preferências operacionais do template</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-[hsl(var(--text))] mb-1">Nome do Template *</label>
                  <input
                    type="text"
                    defaultValue={template.name}
                    onBlur={(e) => void handleSaveGeneral(e.target.value, {})}
                    className="ui-input w-full"
                    placeholder="Ex: Avaliação de Liderança Avançada"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[hsl(var(--text))] mb-1">Descrição Comercial *</label>
                  <textarea
                    defaultValue={parsedDesc.description}
                    onBlur={(e) => void handleSaveGeneral(template.name, { description: e.target.value })}
                    className="ui-input w-full min-h-20"
                    placeholder="Descreva o propósito deste template..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-[hsl(var(--text))] mb-1">Categoria</label>
                    <select
                      value={parsedDesc.category}
                      onChange={(e) => void handleSaveGeneral(template.name, { category: e.target.value })}
                      className="ui-input w-full"
                    >
                      <option value="Administrativo">Administrativo</option>
                      <option value="Operacional">Operacional</option>
                      <option value="Liderança">Liderança</option>
                      <option value="Tecnologia">Tecnologia</option>
                      <option value="Aprendizagem">Aprendizagem</option>
                      <option value="Geral">Geral</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[hsl(var(--text))] mb-1">Duração Estimada (min)</label>
                    <input
                      type="number"
                      value={parsedDesc.duration}
                      onChange={(e) => void handleSaveGeneral(template.name, { duration: Number(e.target.value) })}
                      className="ui-input w-full"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[hsl(var(--text))] mb-1">Público Recomendado</label>
                  <input
                    type="text"
                    defaultValue={parsedDesc.target_audience}
                    onBlur={(e) => void handleSaveGeneral(template.name, { target_audience: e.target.value })}
                    className="ui-input w-full"
                    placeholder="Ex: Cargos de Coordenação e Gerência"
                  />
                </div>
              </div>
            </div>
          ) : (
            /* BUILDER DA COMPETÊNCIA SELECIONADA */
            selectedComp && (
              <div className="flex-1 overflow-y-auto flex flex-col">
                {/* Competency settings bar */}
                <div className="p-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--surface))] space-y-3">
                  <div className="flex items-center justify-between">
                    <input
                      type="text"
                      value={localCompName}
                      onChange={(e) => setLocalCompName(e.target.value)}
                      onBlur={() => {
                        if (localCompName.trim() && localCompName !== selectedComp.name) {
                          void handleUpdateCompetency(selectedComp, { name: localCompName });
                        } else {
                          setLocalCompName(selectedComp.name);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.currentTarget.blur();
                        }
                      }}
                      className="text-sm font-bold text-[hsl(var(--text))] bg-transparent border-b border-transparent hover:border-gray-300 focus:border-[hsl(var(--primary))] outline-none"
                    />
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => void handleDuplicateCompetency(selectedComp)}
                        title="Duplicar Competência"
                        className="p-1 rounded hover:bg-gray-100 text-gray-500"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => void handleDeleteCompetency(selectedComp.id)}
                        title="Excluir Competência"
                        className="p-1 rounded hover:bg-red-50 text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-3 items-center">
                    <div className="col-span-9">
                      <input
                        type="text"
                        value={localCompDesc}
                        placeholder="Adicione uma breve descrição para contextualizar..."
                        onChange={(e) => setLocalCompDesc(e.target.value)}
                        onBlur={() => {
                          if (localCompDesc !== (selectedComp.description ?? "")) {
                            void handleUpdateCompetency(selectedComp, { description: localCompDesc });
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.currentTarget.blur();
                          }
                        }}
                        className="text-xs text-[hsl(var(--text-muted))] bg-transparent w-full border-b border-transparent hover:border-gray-300 outline-none"
                      />
                    </div>
                    <div className="col-span-3 flex items-center gap-1 justify-end">
                      <label className="text-[10px] font-bold text-[hsl(var(--text-muted))]">Peso:</label>
                      <input
                        type="number"
                        value={localCompWeight}
                        onChange={(e) => setLocalCompWeight(e.target.value)}
                        onBlur={() => {
                          const w = Number(localCompWeight);
                          if (!isNaN(w) && w >= 0 && w !== selectedComp.weight) {
                            void handleUpdateCompetency(selectedComp, { weight: w });
                          } else {
                            setLocalCompWeight(selectedComp.weight);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.currentTarget.blur();
                          }
                        }}
                        className="w-14 text-xs font-semibold text-center border rounded px-1"
                      />
                      <span className="text-xs text-gray-500">%</span>
                    </div>
                  </div>
                </div>

                {/* Question Cards Area */}
                <div className="flex-1 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--text-muted))]">
                      Perguntas ({selectedComp.questions?.length ?? 0})
                    </span>
                    <Button
                      size="sm"
                      onClick={() => void handleAddQuestion(selectedComp.id)}
                      className="h-7 px-2 flex items-center gap-1"
                    >
                      <Plus className="h-3.5 w-3.5" /> Adicionar Pergunta
                    </Button>
                  </div>

                  <div className="space-y-2.5">
                    {selectedComp.questions && selectedComp.questions.length > 0 ? (
                      [...selectedComp.questions]
                        .sort((a, b) => a.display_order - b.display_order)
                        .map((q, index) => {
                          const parsed = parseQuestionText(q.question_text);
                          const isSelected = selectedQuestId === q.id;

                          return (
                            <div
                              key={q.id}
                              onClick={() => setSelectedQuestId(q.id)}
                              className={`p-3 rounded-xl border transition-all cursor-pointer flex gap-3 ${
                                isSelected
                                  ? "border-[hsl(var(--primary))] bg-[hsl(var(--surface))] shadow-sm"
                                  : "border-[hsl(var(--border))] bg-[hsl(var(--surface))] hover:shadow-xs hover:border-gray-300"
                              }`}
                            >
                              {/* Left visual handles and sorting */}
                              <div className="flex flex-col items-center justify-between shrink-0 text-gray-400">
                                <span className="text-[10px] font-bold bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">
                                  {index + 1}
                                </span>
                                <div className="flex flex-col mt-2 gap-0.5">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void handleMoveQuestion(q, "up");
                                    }}
                                    className="p-0.5 hover:bg-gray-100 rounded"
                                  >
                                    <ChevronUp className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void handleMoveQuestion(q, "down");
                                    }}
                                    className="p-0.5 hover:bg-gray-100 rounded"
                                  >
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* Question Main Block */}
                              <div className="flex-1 min-w-0 space-y-1.5">
                                <p className="text-sm font-semibold text-[hsl(var(--text))] leading-snug break-words">
                                  {parsed.text}
                                  {q.is_required && <span className="text-red-500 ml-1">*</span>}
                                </p>

                                <div className="flex flex-wrap gap-2 items-center">
                                  <span className="rounded-md border bg-[hsl(var(--bg))] px-1.5 py-0.5 text-[9px] font-bold text-[hsl(var(--text-muted))]">
                                    {q.answer_type === "multiple_choice"
                                      ? "Múltipla Escolha"
                                      : q.answer_type === "scale"
                                      ? "Escala 1 a 5"
                                      : "Texto Livre"}
                                  </span>
                                  <span className="text-[9px] text-[hsl(var(--text-muted))] font-medium">
                                    Peso: <span className="font-semibold text-gray-700">{q.weight}</span>
                                  </span>
                                </div>
                              </div>

                              {/* Action controls */}
                              <div className="flex flex-col items-end gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => void handleDuplicateQuestion(q)}
                                  className="p-1 rounded hover:bg-gray-100 text-gray-400"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => void handleDeleteQuestion(q.id)}
                                  className="p-1 rounded hover:bg-red-50 text-red-500"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })
                    ) : (
                      <div className="border-2 border-dashed rounded-xl p-8 text-center text-[hsl(var(--text-muted))]">
                        <QuestionIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        Nenhuma pergunta cadastrada nesta competência.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          )}
        </section>

        {/* COLUNA C: PAINEL DIREITO - CONFIGURAÇÕES & PREVIEW (4/12 cols) */}
        <section className="lg:col-span-4 bg-[hsl(var(--surface))] flex flex-col overflow-y-auto">
          {selectedQuest && parsedQuestMetadata ? (
            <div className="p-5 space-y-6">
              {/* SECTION HEADER */}
              <div className="border-b pb-3 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--text-muted))]">Configurar Pergunta</span>
                <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-1.5 py-0.5 font-bold">Ativa</span>
              </div>

              {/* TABS SELECTOR (Local editor form) */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[hsl(var(--text))] uppercase mb-1">Texto da Pergunta *</label>
                  <textarea
                    value={localQuestText}
                    onChange={(e) => setLocalQuestText(e.target.value)}
                    onBlur={() => {
                      if (localQuestText.trim() && localQuestText !== parsedQuestMetadata.text) {
                        const newObj = { ...parsedQuestMetadata, text: localQuestText };
                        void handleUpdateQuestion(selectedQuest, { question_text: serializeQuestionText(newObj) });
                      } else {
                        setLocalQuestText(parsedQuestMetadata.text);
                      }
                    }}
                    className="ui-input w-full min-h-16"
                    placeholder="Enunciado ou provocação comportamental..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[hsl(var(--text))] uppercase mb-1">Tipo de Resposta</label>
                    <select
                      value={selectedQuest.answer_type}
                      onChange={(e) => {
                        const newType = e.target.value as "text" | "scale" | "multiple_choice";
                        void handleUpdateQuestion(selectedQuest, {
                          answer_type: newType,
                          options_json: newType === "multiple_choice" ? ["Opção A", "Opção B"] : null,
                        });
                      }}
                      className="ui-input w-full"
                    >
                      <option value="text">Texto Livre</option>
                      <option value="multiple_choice">Múltipla Escolha</option>
                      <option value="scale">Escala 1 a 5</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[hsl(var(--text))] uppercase mb-1">Peso</label>
                    <input
                      type="number"
                      value={localQuestWeight}
                      onChange={(e) => setLocalQuestWeight(e.target.value)}
                      onBlur={() => {
                        const w = Number(localQuestWeight);
                        if (!isNaN(w) && w >= 0 && w !== selectedQuest.weight) {
                          void handleUpdateQuestion(selectedQuest, { weight: w });
                        } else {
                          setLocalQuestWeight(selectedQuest.weight);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.currentTarget.blur();
                        }
                      }}
                      className="ui-input w-full"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[hsl(var(--text))] uppercase mb-1">Instrução ao Candidato</label>
                  <input
                    type="text"
                    value={localQuestInstruction}
                    placeholder="Dicas sobre como estruturar a resposta..."
                    onChange={(e) => setLocalQuestInstruction(e.target.value)}
                    onBlur={() => {
                      if (localQuestInstruction !== (parsedQuestMetadata.instruction ?? "")) {
                        const newObj = { ...parsedQuestMetadata, instruction: localQuestInstruction };
                        void handleUpdateQuestion(selectedQuest, { question_text: serializeQuestionText(newObj) });
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.currentTarget.blur();
                      }
                    }}
                    className="ui-input w-full"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_req_check"
                    checked={selectedQuest.is_required}
                    onChange={(e) => void handleUpdateQuestion(selectedQuest, { is_required: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 focus:ring-[hsl(var(--primary))]"
                  />
                  <label htmlFor="is_req_check" className="text-sm font-semibold text-[hsl(var(--text))]">Resposta obrigatória</label>
                </div>

                {/* Multiple choice options configurator */}
                {selectedQuest.answer_type === "multiple_choice" && (
                  <div className="border-t pt-4 space-y-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--text-muted))]">Alternativas</span>
                    
                    <div className="space-y-2">
                      {localQuestOptions.map((opt, oIdx) => (
                        <div key={oIdx} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => {
                              const nextOpts = [...localQuestOptions];
                              nextOpts[oIdx] = e.target.value;
                              setLocalQuestOptions(nextOpts);
                            }}
                            onBlur={() => {
                              const currentOpts = selectedQuest.options_json ?? [];
                              if (JSON.stringify(localQuestOptions) !== JSON.stringify(currentOpts)) {
                                void handleUpdateQuestion(selectedQuest, { options_json: localQuestOptions });
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.currentTarget.blur();
                              }
                            }}
                            className="ui-input flex-1 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const isRecom = parsedQuestMetadata.recommended_option === opt;
                              const nextMetadata = {
                                ...parsedQuestMetadata,
                                recommended_option: isRecom ? "" : opt,
                              };
                              void handleUpdateQuestion(selectedQuest, {
                                question_text: serializeQuestionText(nextMetadata),
                              });
                            }}
                            title={parsedQuestMetadata.recommended_option === opt ? "Opção Recomendada" : "Marcar como Recomendada"}
                            className={`p-1.5 rounded border transition-colors ${
                              parsedQuestMetadata.recommended_option === opt
                                ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                : "text-gray-400 hover:bg-gray-50"
                            }`}
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const nextOpts = (selectedQuest.options_json ?? []).filter((_, idx) => idx !== oIdx);
                              setLocalQuestOptions(nextOpts);
                              void handleUpdateQuestion(selectedQuest, { options_json: nextOpts });
                            }}
                            className="p-1.5 rounded hover:bg-red-50 text-red-500"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const nextOpts = [...(selectedQuest.options_json ?? []), `Alternativa ${(selectedQuest.options_json?.length ?? 0) + 1}`];
                        setLocalQuestOptions(nextOpts);
                        void handleUpdateQuestion(selectedQuest, { options_json: nextOpts });
                      }}
                      className="w-full text-xs flex items-center gap-1 justify-center"
                    >
                      <Plus className="h-3.5 w-3.5" /> Adicionar Alternativa
                    </Button>
                  </div>
                )}

                {/* Scale 1-5 Custom labels configurator */}
                {selectedQuest.answer_type === "scale" && (
                  <div className="border-t pt-4 space-y-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--text-muted))]">Legendas da Escala</span>
                    
                    <div className="space-y-2">
                      {[1, 3, 5].map((val) => (
                        <div key={val} className="grid grid-cols-12 gap-2 items-center">
                          <span className="col-span-2 text-xs font-bold text-center bg-gray-100 rounded py-1">{val}</span>
                          <input
                            type="text"
                            value={localQuestScaleLabels[val] ?? ""}
                            onChange={(e) => {
                              const nextLabels = { ...localQuestScaleLabels };
                              nextLabels[val] = e.target.value;
                              setLocalQuestScaleLabels(nextLabels);
                            }}
                            onBlur={() => {
                              const currentLabels = parsedQuestMetadata.scale_labels ?? {};
                              if (JSON.stringify(localQuestScaleLabels) !== JSON.stringify(currentLabels)) {
                                const nextMetadata = { ...parsedQuestMetadata, scale_labels: localQuestScaleLabels };
                                void handleUpdateQuestion(selectedQuest, {
                                  question_text: serializeQuestionText(nextMetadata),
                                });
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.currentTarget.blur();
                              }
                            }}
                            className="ui-input col-span-10 text-xs"
                            placeholder="Legenda correspondente..."
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* EVALUATOR RUBRIC SECTION */}
                <div className="border-t pt-4 space-y-4">
                  <div className="flex items-center gap-1.5 border-b pb-2">
                    <Sparkles className="h-4 w-4 text-purple-600" />
                    <span className="text-xs font-bold uppercase tracking-wider text-purple-800">Seção do Avaliador (Interno)</span>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-[hsl(var(--text))] uppercase mb-1">Evidências Esperadas</label>
                    <textarea
                      value={localQuestEvidence}
                      onChange={(e) => setLocalQuestEvidence(e.target.value)}
                      onBlur={() => {
                        if (localQuestEvidence !== (parsedQuestMetadata.evidence ?? "")) {
                          const newObj = { ...parsedQuestMetadata, evidence: localQuestEvidence };
                          void handleUpdateQuestion(selectedQuest, { question_text: serializeQuestionText(newObj) });
                        }
                      }}
                      className="ui-input w-full min-h-14 text-xs"
                      placeholder="Quais ações ou vivências o avaliador deve procurar?"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-[hsl(var(--text))] uppercase mb-1">Critérios de Boa Resposta</label>
                    <textarea
                      value={localQuestCriteria}
                      onChange={(e) => setLocalQuestCriteria(e.target.value)}
                      onBlur={() => {
                        if (localQuestCriteria !== (parsedQuestMetadata.criteria ?? "")) {
                          const newObj = { ...parsedQuestMetadata, criteria: localQuestCriteria };
                          void handleUpdateQuestion(selectedQuest, { question_text: serializeQuestionText(newObj) });
                        }
                      }}
                      className="ui-input w-full min-h-14 text-xs"
                      placeholder="O que diferencia uma resposta excelente das demais?"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-[hsl(var(--text))] uppercase mb-1">Sinais de Alerta (Red Flags)</label>
                    <textarea
                      value={localQuestAlert}
                      onChange={(e) => setLocalQuestAlert(e.target.value)}
                      onBlur={() => {
                        if (localQuestAlert !== (parsedQuestMetadata.alert ?? "")) {
                          const newObj = { ...parsedQuestMetadata, alert: localQuestAlert };
                          void handleUpdateQuestion(selectedQuest, { question_text: serializeQuestionText(newObj) });
                        }
                      }}
                      className="ui-input w-full min-h-14 text-xs border-red-200 focus:border-red-400"
                      placeholder="Atitudes, omissões ou discursos incompatíveis..."
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-[hsl(var(--text))] uppercase mb-1">Observações Internas</label>
                    <textarea
                      value={localQuestNotes}
                      onChange={(e) => setLocalQuestNotes(e.target.value)}
                      onBlur={() => {
                        if (localQuestNotes !== (parsedQuestMetadata.notes ?? "")) {
                          const newObj = { ...parsedQuestMetadata, notes: localQuestNotes };
                          void handleUpdateQuestion(selectedQuest, { question_text: serializeQuestionText(newObj) });
                        }
                      }}
                      className="ui-input w-full min-h-14 text-xs"
                      placeholder="Outros direcionamentos ou detalhes operacionais da vaga..."
                    />
                  </div>
                </div>

                {/* REAL TIME CANDIDATE PREVIEW */}
                <div className="border-t pt-4 space-y-3">
                  <div className="flex items-center gap-1.5 border-b pb-2">
                    <Eye className="h-4 w-4 text-[hsl(var(--primary))]" />
                    <span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--primary))]">Preview do Candidato</span>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 space-y-3">
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-gray-700">
                        {parsedQuestMetadata.text}
                        {selectedQuest.is_required && <span className="text-red-500 ml-1">*</span>}
                      </p>
                      {parsedQuestMetadata.instruction && (
                        <p className="text-[10px] text-gray-500 italic">{parsedQuestMetadata.instruction}</p>
                      )}
                    </div>

                    {selectedQuest.answer_type === "text" && (
                      <textarea
                        disabled
                        className="w-full min-h-16 text-xs border rounded p-2 bg-white text-gray-400 resize-none"
                        placeholder="Resposta livre por escrito do candidato..."
                      />
                    )}

                    {selectedQuest.answer_type === "scale" && (
                      <div className="space-y-1.5">
                        <div className="flex gap-1.5 justify-center">
                          {[1, 2, 3, 4, 5].map((v) => (
                            <span key={v} className="h-7 w-7 rounded-full border bg-white flex items-center justify-center text-xs text-gray-400 font-semibold shadow-2xs">
                              {v}
                            </span>
                          ))}
                        </div>
                        <div className="flex justify-between w-full text-[9px] text-gray-500 leading-snug px-1">
                          <span>1: {parsedQuestMetadata.scale_labels?.[1] ?? "Muito baixo"}</span>
                          <span>3: {parsedQuestMetadata.scale_labels?.[3] ?? "Médio"}</span>
                          <span>5: {parsedQuestMetadata.scale_labels?.[5] ?? "Alto"}</span>
                        </div>
                      </div>
                    )}

                    {selectedQuest.answer_type === "multiple_choice" && (
                      <div className="space-y-1.5">
                        {(selectedQuest.options_json ?? []).map((opt, oIdx) => (
                          <label key={oIdx} className="flex items-center gap-2 text-xs text-gray-600">
                            <input type="radio" disabled className="h-3.5 w-3.5" />
                            {opt}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-[hsl(var(--text-muted))] space-y-2">
              <Settings2 className="h-10 w-10 opacity-30" />
              <p className="text-sm font-semibold">Nenhuma pergunta selecionada</p>
              <p className="text-xs max-w-xs leading-relaxed">Selecione ou adicione uma pergunta no painel central para configurar pesos, alternativas, rubricas e previews.</p>
            </div>
          )}
        </section>
      </main>

      {/* ── VALIDATION CHECKS DIALOG ── */}
      {showValidation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="h-5 w-5" />
                <h3 className="text-lg font-bold">Verificação de Qualidade</h3>
              </div>
              <button onClick={() => setShowValidation(false)} className="text-gray-400 hover:text-gray-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            {validationErrors.length === 0 ? (
              <div className="text-center py-6 space-y-2">
                <CheckCircle className="h-12 w-12 text-emerald-600 mx-auto" />
                <h4 className="font-bold text-gray-800">Template Perfeito!</h4>
                <p className="text-xs text-[hsl(var(--text-muted))] px-4 leading-relaxed">
                  Todas as regras e consistências estão perfeitamente atendidas. Este template está 100% elegível para publicação!
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-[hsl(var(--text-muted))]">
                  O template possui pendências que impedem a publicação. Corrija os seguintes itens:
                </p>
                <div className="max-h-60 overflow-y-auto space-y-2 border rounded-xl p-3 bg-gray-50">
                  {validationErrors.map((err, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-red-700 leading-snug">
                      <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-red-600 mt-1.5" />
                      <span>{err}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 border-t pt-3">
              <Button variant="outline" onClick={() => setShowValidation(false)}>
                Fechar
              </Button>
              {validationErrors.length === 0 && template.status !== "active" && (
                <Button onClick={handlePublish} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  Publicar Agora
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
