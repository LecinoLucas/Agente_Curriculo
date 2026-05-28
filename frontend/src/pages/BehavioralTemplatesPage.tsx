import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/common/MetricCard";
import {
  Plus,
  Layers,
  FileText,
  BarChart,
  List,
  Loader2,
  X,
  Search,
  Filter,
  ArrowUpDown,
  BookOpen,
  User,
  Clock,
  Settings,
  AlertCircle,
  Archive,
  ArrowRight,
  ClipboardList,
  FolderPlus,
  SlidersHorizontal,
  HelpCircle,
  FolderGit2,
  RefreshCw,
  AlertTriangle
} from "lucide-react";
import { behavioralTemplatesService } from "../services/behavioralTemplatesService";
import type { BehavioralAssessmentTemplate } from "../types/domain";
import { toast } from "@/shared/utils/toast";
import { TemplateGalleryModal } from "../features/behavioral-templates/TemplateGalleryModal";
import { importTemplateToApi, type RawTemplate } from "../features/behavioral-templates/templateImporter";
import {
  parseTemplateDescription,
  serializeTemplateDescription,
  categoryTag,
  CATEGORY_COLORS,
  type TemplateDescriptionMetadata
} from "../features/behavioral-templates/behavioralTemplateHelper";

export function BehavioralTemplatesPage() {
  const navigate = useNavigate();

  // API states
  const [templates, setTemplates] = useState<BehavioralAssessmentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search/Filters states
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all"); // "all", "active", "draft"
  const [sortBy, setSortBy] = useState("recent"); // "recent", "name", "questions"

  // Modals/Sidebars
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [importingName, setImportingName] = useState<string | null>(null);

  // Drawer Form states
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDesc, setNewTemplateDesc] = useState("");
  const [newTemplateCategory, setNewTemplateCategory] = useState("Geral");
  const [newTemplateAudience, setNewTemplateAudience] = useState("");
  const [newTemplateDuration, setNewTemplateDuration] = useState(20);
  const [creating, setCreating] = useState(false);
  const [formSubmitted, setFormSubmitted] = useState(false);

  useEffect(() => {
    void loadTemplates();
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

  // Handle template import from gallery
  async function handleImportTemplate(template: RawTemplate) {
    setImportingName(template.name);
    try {
      const result = await importTemplateToApi(template, behavioralTemplatesService);
      toast.success(`Modelo "${template.name.replace("Avaliação Comportamental — ", "")}" importado com sucesso!`);
      setIsGalleryOpen(false);
      setIsDrawerOpen(false);
      // Redirect straight to 3-column workspace in draft status
      navigate(`/admin/behavioral-templates/${result.id}/edit`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao importar modelo");
    } finally {
      setImportingName(null);
    }
  }

  // Handle manual template creation
  async function handleCreateTemplateSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormSubmitted(true);
    if (!newTemplateName.trim()) {
      toast.error("O nome do template é obrigatório.");
      return;
    }
    if (!newTemplateDesc.trim()) {
      toast.error("A descrição do template é obrigatória.");
      return;
    }

    setCreating(true);
    try {
      const customMetadata: TemplateDescriptionMetadata = {
        description: newTemplateDesc.trim(),
        category: newTemplateCategory,
        target_audience: newTemplateAudience.trim(),
        duration: newTemplateDuration,
        flow_type: "standard",
        required_components: [],
      };

      const serializedDescription = serializeTemplateDescription(customMetadata);

      const result = await behavioralTemplatesService.createTemplate({
        name: newTemplateName.trim(),
        description: serializedDescription,
      });

      toast.success("Rascunho criado! Iniciando workspace...");
      setIsDrawerOpen(false);
      // Redirect directly to structural workspace
      navigate(`/admin/behavioral-templates/${result.id}/edit`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar rascunho");
    } finally {
      setCreating(false);
    }
  }

  // Duplicate, archive, activate quick actions
  async function handleActivate(id: string) {
    try {
      await behavioralTemplatesService.activateTemplate(id);
      toast.success("Template ativado com sucesso!");
      await loadTemplates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao ativar template");
    }
  }

  async function handleArchive(id: string) {
    try {
      await behavioralTemplatesService.archiveTemplate(id);
      toast.success("Template arquivado");
      await loadTemplates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao arquivar template");
    }
  }

  async function handleDuplicate(templateItem: BehavioralAssessmentTemplate) {
    try {
      const detail = await behavioralTemplatesService.getTemplate(templateItem.id);
      
      const parsed = parseTemplateDescription(detail.description);
      const newMeta: TemplateDescriptionMetadata = {
        ...parsed,
        description: `${parsed.description} (Cópia)`,
      };

      const duplicated = await behavioralTemplatesService.createTemplate({
        name: `${detail.name} (Cópia)`,
        description: serializeTemplateDescription(newMeta),
      });

      // Copy competencies and questions
      if (detail.competencies && detail.competencies.length > 0) {
        for (const c of detail.competencies) {
          const newComp = await behavioralTemplatesService.createCompetency(duplicated.id, {
            name: c.name,
            description: c.description,
            weight: c.weight,
            display_order: c.display_order,
          });

          if (c.questions && c.questions.length > 0) {
            for (const q of c.questions) {
              await behavioralTemplatesService.createQuestion(duplicated.id, newComp.id, {
                question_text: q.question_text,
                answer_type: q.answer_type,
                is_required: q.is_required,
                weight: q.weight,
                display_order: q.display_order,
                options_json: q.options_json,
              });
            }
          }
        }
      }

      toast.success("Template duplicado com sucesso!");
      await loadTemplates();
    } catch {
      toast.error("Erro ao duplicar template");
    }
  }

  // Metrics KPIs calculations
  const totalActive = templates.filter((t) => t.status === "active").length;
  const totalDrafts = templates.filter((t) => t.status === "draft").length;
  const totalArchived = templates.filter((t) => t.status === "archived").length;

  // Search and filter logic
  const visibleTemplates = templates.filter((template) => template.status !== "archived");

  const filteredTemplates = visibleTemplates.filter((template) => {
    const parsed = parseTemplateDescription(template.description);
    const category = parsed.category || "Geral";

    const matchesSearch =
      template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      parsed.description.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = selectedCategory === "all" || category === selectedCategory;

    const matchesStatus =
      selectedStatus === "all"
        ? true
        : selectedStatus === "active"
        ? template.status === "active"
        : template.status === "draft";

    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Sorting
  const sortedTemplates = [...filteredTemplates].sort((a, b) => {
    if (sortBy === "name") {
      return a.name.localeCompare(b.name);
    }
    if (sortBy === "questions") {
      return (b.question_count ?? 0) - (a.question_count ?? 0);
    }
    // Default: 'recent'
    return b.id.localeCompare(a.id);
  });

  const categories = ["all", "Administrativo", "Operacional", "Liderança", "Tecnologia", "Aprendizagem", "Geral"];

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center bg-[hsl(var(--bg))]">
        <div className="text-center space-y-2">
          <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--primary))] mx-auto" />
          <p className="text-sm text-text-muted">Carregando painel de avaliações…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 bg-[hsl(var(--bg))] min-h-screen">
      {/* ── HEADER ── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">Templates Comportamentais</h1>
          <p className="mt-1 text-sm text-text-muted leading-relaxed">
            Painel de controle de avaliações operacionais estruturadas por competências e scorecards.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setIsGalleryOpen(true)}
            variant="outline"
            className="flex items-center gap-2 border-border hover:bg-[hsl(var(--accent-soft))]"
          >
            <Layers className="h-4 w-4 text-text-muted" />
            Usar modelo pronto
          </Button>
          <Button
            onClick={() => {
              setNewTemplateName("");
              setNewTemplateDesc("");
              setNewTemplateCategory("Geral");
              setNewTemplateAudience("");
              setNewTemplateDuration(20);
              setFormSubmitted(false);
              setIsDrawerOpen(true);
            }}
            className="flex items-center gap-2 bg-[hsl(var(--primary))] text-white hover:bg-[hsl(var(--primary))]/90"
          >
            <Plus className="h-4 w-4" />
            Novo Builder
          </Button>
        </div>
      </div>

      {error ? (
        <div className="border border-red-200 rounded-2xl p-12 text-center text-text bg-red-50/20 max-w-xl mx-auto space-y-4 shadow-sm" data-testid="error-state">
          <AlertTriangle className="h-12 w-12 text-red-600 mx-auto animate-pulse" />
          <h3 className="text-lg font-bold text-red-950">Falha ao Carregar Avaliações</h3>
          <p className="text-xs text-red-850 leading-relaxed max-w-md mx-auto">
            {error || "Não foi possível conectar ao servidor para carregar as avaliações comportamentais."}
          </p>
          <div className="pt-2">
            <Button
              onClick={() => void loadTemplates()}
              className="bg-red-600 hover:bg-red-700 text-white font-semibold flex items-center gap-2 mx-auto"
            >
              <RefreshCw className="h-4 w-4" /> Tentar novamente
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* ── KPI METRICS CARDS ── */}
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard
              label="Ativos em Produção"
              value={totalActive}
              icon={ClipboardList}
              iconClassName="bg-emerald-50 text-emerald-600"
            />
            <MetricCard
              label="Rascunhos Editáveis"
              value={totalDrafts}
              icon={FolderGit2}
              iconClassName="bg-amber-50 text-amber-600"
            />
            <MetricCard
              label="Arquivados"
              value={totalArchived}
              icon={Archive}
              iconClassName="bg-red-50 text-red-600"
              description="Para consultar templates arquivados, acesse Cadastros > Arquivados > Templates comportamentais."
              action={{
                label: "Abrir Cadastros",
                onClick: () => navigate("/admin/cadastros"),
              }}
            />
          </div>

          {/* ── TOOLBAR: SEARCH & FILTERS ── */}
          <div className="rounded-2xl border border-border bg-surface p-4 space-y-4 shadow-2xs">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-text-muted" />
                <input
                  type="text"
                  placeholder="Buscar avaliações por nome ou descrição..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring pl-9 w-full"
                />
              </div>

              <div className="flex flex-wrap gap-2 items-center">
                {/* Status Selector */}
                <div className="flex items-center gap-1.5 border rounded-xl px-2.5 py-1.5 bg-[hsl(var(--bg))]">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-text-muted" />
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="bg-transparent text-xs font-semibold outline-none text-text"
                  >
                    <option value="all">Todos os Status</option>
                    <option value="active">Apenas Ativos</option>
                    <option value="draft">Apenas Rascunhos</option>
                  </select>
                </div>

                {/* Sort Selector */}
                <div className="flex items-center gap-1.5 border rounded-xl px-2.5 py-1.5 bg-[hsl(var(--bg))]">
                  <ArrowUpDown className="h-3.5 w-3.5 text-text-muted" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="bg-transparent text-xs font-semibold outline-none text-text"
                  >
                    <option value="recent">Mais Recentes</option>
                    <option value="name">Ordem Alfabética</option>
                    <option value="questions">Mais Perguntas</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Category filtering chips */}
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border">
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted mr-1">Categoria:</span>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold border transition-all duration-200 ${
                    selectedCategory === cat
                      ? "bg-[hsl(var(--primary))] text-white border-transparent"
                      : "bg-[hsl(var(--bg))] text-text-muted border-border hover:bg-surface-muted"
                  }`}
                >
                  {cat === "all" ? "Todas" : cat}
                </button>
              ))}
            </div>
          </div>

          {/* ── TEMPLATE LIST CARDS ── */}
          {sortedTemplates.length === 0 ? (
            <div className="border-2 border-dashed rounded-2xl p-12 text-center text-text-muted bg-surface">
              <AlertCircle className="h-10 w-10 text-text-muted mx-auto mb-2 opacity-50" />
              <h4 className="font-semibold text-sm">Nenhum template encontrado</h4>
              <p className="text-xs max-w-xs mx-auto mt-1 leading-relaxed">
                Nenhuma avaliação atende aos filtros definidos. Crie um novo template ou use um modelo pronto.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {sortedTemplates.map((template) => {
                const parsed = parseTemplateDescription(template.description);
                const category = parsed.category || "Geral";
                const colorClass = (CATEGORY_COLORS && CATEGORY_COLORS[template.name]) ?? "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";

                return (
                  <div
                    key={template.id}
                    className="group rounded-2xl border border-border bg-surface p-5 transition-all duration-200 hover:shadow-md flex flex-col justify-between"
                  >
                    <div>
                      {/* Badges bar */}
                      <div className="flex items-center justify-between mb-3.5">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${colorClass}`}>
                          {category}
                        </span>

                        <div className="flex gap-1 items-center">
                          <span className="text-[10px] text-gray-500 font-bold bg-gray-100 dark:bg-gray-800 rounded px-1.5 py-0.5">
                            v{template.version}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            template.status === "active"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : template.status === "archived"
                              ? "bg-red-50 text-red-700 border border-red-200"
                              : "bg-gray-50 text-gray-700 border border-gray-200"
                          }`}>
                            {template.status === "active" ? "Ativo" : template.status === "archived" ? "Arquivado" : "Rascunho"}
                          </span>
                        </div>
                      </div>

                      {/* Name & Desc */}
                      <h3 className="text-sm font-bold text-text leading-snug group-hover:text-[hsl(var(--primary))] transition-colors">
                        {template.name}
                      </h3>
                      <p className="mt-1.5 text-xs text-text-muted leading-relaxed line-clamp-2">
                        {parsed.description || "Sem descrição disponível."}
                      </p>

                      {/* Metrics preview row */}
                      <div className="mt-4 grid grid-cols-2 gap-2 border-y border-border/60 py-2 text-[11px] text-text-muted">
                        <span className="flex items-center gap-1">
                          <BookOpen className="h-3.5 w-3.5 shrink-0" />
                          {template.competency_count} {template.competency_count === 1 ? "competência" : "competências"}
                        </span>
                        <span className="flex items-center gap-1">
                          <FileText className="h-3.5 w-3.5 shrink-0" />
                          {template.question_count} {template.question_count === 1 ? "pergunta" : "perguntas"}
                        </span>
                        {parsed.target_audience && (
                          <span className="flex items-center gap-1 col-span-2 truncate">
                            <User className="h-3.5 w-3.5 shrink-0" />
                            {parsed.target_audience}
                          </span>
                        )}
                        {parsed.duration && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5 shrink-0" />
                            ~{parsed.duration} minutos
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Operations & CTAs row */}
                    <div className="mt-5 pt-3 flex gap-2 items-center justify-between border-t border-border/40">
                      <div className="flex gap-1.5">
                        {/* Quick actions for recruiter convenience */}
                        <button
                          onClick={() => void handleDuplicate(template)}
                          title="Duplicar Rascunho"
                          className="p-2 rounded-xl border hover:bg-gray-50 text-gray-500"
                        >
                          <Layers className="h-4 w-4" />
                        </button>
                        {template.status !== "active" && template.status !== "archived" && (
                          <button
                            onClick={() => void handleActivate(template.id)}
                            title="Ativar Avaliação"
                            className="p-2 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-600"
                          >
                            <ArrowRight className="h-4 w-4" />
                          </button>
                        )}
                        {template.status !== "archived" && (
                          <button
                            onClick={() => void handleArchive(template.id)}
                            title="Arquivar Avaliação"
                            className="p-2 rounded-xl border border-red-100 hover:bg-red-50 text-red-500"
                          >
                            <Archive className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      <Button
                        onClick={() => navigate(`/admin/behavioral-templates/${template.id}/edit`)}
                        className="bg-[hsl(var(--primary))] text-white hover:bg-[hsl(var(--primary))]/90 flex items-center gap-1 text-xs px-3 py-1.5 rounded-xl font-semibold"
                      >
                        Editar Estrutura
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── LATERAL DRAWER FOR NEW TEMPLATE ── */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs">
          {/* Overlay click to close */}
          <div className="absolute inset-0" onClick={() => setIsDrawerOpen(false)} />

          <div className="relative w-full max-w-md bg-surface h-full flex flex-col shadow-2xl border-l border-border animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-text flex items-center gap-2">
                  <FolderPlus className="h-5 w-5 text-[hsl(var(--primary))]" />
                  Criar Nova Avaliação
                </h3>
                <p className="text-xs text-text-muted mt-0.5">Defina as informações estruturais do rascunho</p>
              </div>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="p-1 rounded-xl text-text-muted hover:bg-[hsl(var(--accent-soft))] hover:text-text"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Drawer Body / Form */}
            <form onSubmit={(e) => void handleCreateTemplateSubmit(e)} className="flex-1 overflow-y-auto p-5 space-y-4">
              
              {/* Ready-made banner suggestion */}
              <div className="rounded-xl bg-[hsl(var(--primary))]/5 border border-[hsl(var(--primary))]/20 p-3.5 space-y-2">
                <p className="text-xs font-bold text-[hsl(var(--primary))] flex items-center gap-1.5">
                  <Layers className="h-4 w-4" />
                  Quer economizar tempo?
                </p>
                <p className="text-[11px] text-text-muted leading-relaxed">
                  Temos templates comportamentais profissionais criados por especialistas em seleção humana prontos para uso.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setIsGalleryOpen(true);
                  }}
                  className="text-xs font-bold text-[hsl(var(--primary))] hover:underline flex items-center gap-1"
                >
                  Procurar na Vitrine <ArrowRight className="h-3 w-3" />
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-text uppercase tracking-wider mb-1">
                  Nome do Template *
                </label>
                <input
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="Ex: Avaliação de Atendimento ao Cliente"
                  className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring w-full"
                  aria-required="true"
                  aria-invalid={formSubmitted && !newTemplateName.trim() ? "true" : "false"}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-text uppercase tracking-wider mb-1">
                  Descrição Comercial *
                </label>
                <textarea
                  value={newTemplateDesc}
                  onChange={(e) => setNewTemplateDesc(e.target.value)}
                  placeholder="Explique os objetivos e os focos comportamentais analisados por este template..."
                  className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring w-full min-h-20 resize-none"
                  aria-required="true"
                  aria-invalid={formSubmitted && !newTemplateDesc.trim() ? "true" : "false"}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-text uppercase tracking-wider mb-1">
                    Categoria
                  </label>
                  <select
                    value={newTemplateCategory}
                    onChange={(e) => setNewTemplateCategory(e.target.value)}
                    className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring w-full"
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
                  <label className="block text-xs font-bold text-text uppercase tracking-wider mb-1">
                    Minutos Estimados
                  </label>
                  <input
                    type="number"
                    value={newTemplateDuration}
                    onChange={(e) => setNewTemplateDuration(Number(e.target.value))}
                    className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring w-full"
                    min={1}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-text uppercase tracking-wider mb-1">
                  Público-Alvo Recomendado
                </label>
                <input
                  type="text"
                  value={newTemplateAudience}
                  onChange={(e) => setNewTemplateAudience(e.target.value)}
                  placeholder="Ex: Consultores de Vendas, Operadores"
                  className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring w-full"
                />
              </div>

              {/* Quality publishing validation advice */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-[11px] text-amber-800 leading-relaxed flex items-start gap-2">
                <HelpCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                <p>
                  <strong>Regra de Publicação:</strong> Para poder ativar/publicar esta avaliação, você precisará cadastrar competências que totalizem exatamente <strong>100%</strong> de peso.
                </p>
              </div>

              {/* Drawer Action CTA */}
              <div className="pt-4 border-t border-border flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDrawerOpen(false)}
                  disabled={creating}
                  className="rounded-xl text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={creating}
                  className="bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/90 text-white rounded-xl text-xs flex items-center gap-1"
                >
                  {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Confirmar e Editar
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── GALLERY MODEL VETRINE MODAL ── */}
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
