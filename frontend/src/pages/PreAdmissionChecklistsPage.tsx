import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Copy,
  FilePlus2,
  LayoutTemplate,
  Loader2,
  Search,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Pencil,
  X,
  Settings,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "../shared/utils/toast";
import { preAdmissionChecklistTemplatesService } from "../services/preAdmissionChecklistTemplatesService";
import type {
  PreAdmissionChecklistTemplate,
  PreAdmissionChecklistTemplateDetail,
  PreAdmissionChecklistTemplateItem,
} from "../types/domain";

const FILE_TYPE_OPTIONS = [
  { value: "application/pdf", label: "PDF" },
  { value: "image/jpeg", label: "JPG" },
  { value: "image/png", label: "PNG" },
  { value: "application/vnd.ms-excel", label: "XLS" },
  { value: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", label: "XLSX" },
] as const;

type DocumentDraft = {
  document_key: string;
  title: string;
  candidate_description: string;
  is_required: boolean;
  accepted_file_types: string[];
  max_file_size_mb: number;
};

const EMPTY_DOCUMENT_DRAFT: DocumentDraft = {
  document_key: "",
  title: "",
  candidate_description: "",
  is_required: true,
  accepted_file_types: ["application/pdf", "image/jpeg", "image/png"],
  max_file_size_mb: 10,
};

// ─── Template kits (modelos prontos) ────────────────────────────────────────

type TemplateKitDocument = {
  document_key: string;
  title: string;
  candidate_description: string;
  is_required: boolean;
};

type TemplateKit = {
  id: string;
  name: string;
  description: string;
  admission_type: string;
  documents: TemplateKitDocument[];
};

const TEMPLATE_KITS: TemplateKit[] = [
  {
    id: "clt",
    name: "CLT — Padrão",
    description: "Documentos essenciais para contratação CLT formal",
    admission_type: "CLT",
    documents: [
      { document_key: "rg", title: "RG (Registro Geral)", candidate_description: "Envie frente e verso do RG em imagem clara e sem cortes.", is_required: true },
      { document_key: "cpf", title: "CPF", candidate_description: "Foto ou digitalização do CPF.", is_required: true },
      { document_key: "ctps", title: "Carteira de Trabalho (CTPS)", candidate_description: "Envie as páginas de identificação e contratos anteriores.", is_required: true },
      { document_key: "foto_3x4", title: "Foto 3×4 recente", candidate_description: "Foto recente em fundo branco, tamanho 3×4.", is_required: true },
      { document_key: "titulo_eleitor", title: "Título de Eleitor", candidate_description: "Frente e verso do título de eleitor.", is_required: true },
      { document_key: "certidao_estado_civil", title: "Certidão de nascimento ou casamento", candidate_description: "Certidão de nascimento (solteiro) ou certidão de casamento.", is_required: true },
      { document_key: "comprovante_residencia", title: "Comprovante de residência", candidate_description: "Conta de água, luz ou gás dos últimos 90 dias.", is_required: true },
      { document_key: "pis_pasep", title: "PIS / NIS / PASEP", candidate_description: "Número do PIS, NIS ou PASEP.", is_required: true },
      { document_key: "dados_bancarios", title: "Dados bancários", candidate_description: "Banco, agência e conta corrente para depósito do salário.", is_required: true },
      { document_key: "escolaridade", title: "Certificado de escolaridade", candidate_description: "Diploma ou certificado do maior nível de escolaridade concluído.", is_required: false },
      { document_key: "aso", title: "Atestado de Saúde Ocupacional (ASO)", candidate_description: "ASO admissional emitido pelo médico do trabalho.", is_required: true },
    ],
  },
  {
    id: "estagio",
    name: "Estágio",
    description: "Documentos para formalização de contrato de estágio supervisionado",
    admission_type: "Estágio",
    documents: [
      { document_key: "rg", title: "RG (Registro Geral)", candidate_description: "Frente e verso do RG.", is_required: true },
      { document_key: "cpf", title: "CPF", candidate_description: "Foto ou digitalização do CPF.", is_required: true },
      { document_key: "comprovante_matricula", title: "Comprovante de matrícula", candidate_description: "Comprovante emitido pela instituição de ensino (máx. 90 dias).", is_required: true },
      { document_key: "foto_3x4", title: "Foto 3×4 recente", candidate_description: "Foto recente em fundo branco.", is_required: true },
      { document_key: "certidao_estado_civil", title: "Certidão de nascimento ou casamento", candidate_description: "Certidão de nascimento (solteiro) ou certidão de casamento.", is_required: true },
      { document_key: "comprovante_residencia", title: "Comprovante de residência", candidate_description: "Conta de água, luz ou gás dos últimos 90 dias.", is_required: true },
      { document_key: "dados_bancarios", title: "Dados bancários", candidate_description: "Banco, agência e conta corrente para crédito da bolsa-auxílio.", is_required: true },
      { document_key: "aso", title: "Atestado de Saúde Ocupacional (ASO)", candidate_description: "ASO admissional emitido pelo médico do trabalho.", is_required: true },
    ],
  },
  {
    id: "aprendiz",
    name: "Jovem Aprendiz",
    description: "Documentos para contratação de menor aprendiz (Lei 10.097/2000)",
    admission_type: "Aprendiz",
    documents: [
      { document_key: "rg", title: "RG (Registro Geral)", candidate_description: "Frente e verso do RG.", is_required: true },
      { document_key: "cpf", title: "CPF", candidate_description: "Foto ou digitalização do CPF.", is_required: true },
      { document_key: "certidao_nascimento", title: "Certidão de nascimento", candidate_description: "Certidão de nascimento (original ou cópia autenticada).", is_required: true },
      { document_key: "comprovante_matricula", title: "Comprovante de matrícula", candidate_description: "Comprovante de matrícula em escola ou curso profissionalizante.", is_required: true },
      { document_key: "foto_3x4", title: "Foto 3×4 recente", candidate_description: "Foto recente em fundo branco.", is_required: true },
      { document_key: "comprovante_residencia", title: "Comprovante de residência", candidate_description: "Conta de água, luz ou gás dos últimos 90 dias.", is_required: true },
      { document_key: "dados_bancarios", title: "Dados bancários", candidate_description: "Banco, agência e conta corrente para crédito.", is_required: true },
      { document_key: "autorizacao_responsavel", title: "Autorização do responsável legal", candidate_description: "Declaração assinada pelo responsável (obrigatório para menores de 18 anos).", is_required: true },
      { document_key: "aso", title: "Atestado de Saúde Ocupacional (ASO)", candidate_description: "ASO admissional emitido pelo médico do trabalho.", is_required: true },
    ],
  },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function SummaryStat({
  label,
  value,
  isDanger,
  isSuccess,
}: {
  label: string;
  value: string | number;
  isDanger?: boolean;
  isSuccess?: boolean;
}) {
  const valueColor = isDanger ? "text-red-600" : isSuccess ? "text-emerald-600" : "text-text";

  return (
    <div className="flex flex-col rounded-xl border border-border bg-white p-3 shadow-sm">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{label}</span>
      <span className={`mt-1 text-lg font-bold ${valueColor}`}>{value}</span>
    </div>
  );
}

function TemplateKitCard({
  kit,
  installingId,
  disabled,
  onInstall,
}: {
  kit: TemplateKit;
  installingId: string | null;
  disabled: boolean;
  onInstall: (kit: TemplateKit) => void;
}) {
  const isInstalling = installingId === kit.id;
  const visibleDocs = kit.documents.slice(0, 5);
  const remainingCount = kit.documents.length - visibleDocs.length;

  return (
    <article
      className="flex flex-col rounded-[24px] border border-border bg-white p-5 shadow-sm transition hover:shadow-md"
      data-testid={`kit-card-${kit.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-text">{kit.name}</p>
          <p className="mt-1 text-sm text-text-muted line-clamp-2">{kit.description}</p>
        </div>
        <Badge variant="outline" className="shrink-0">{kit.admission_type}</Badge>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {visibleDocs.map((doc) => (
          <span
            key={doc.document_key}
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${
              doc.is_required
                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border border-border bg-surface-muted/50 text-text-muted"
            }`}
          >
            {doc.title}
          </span>
        ))}
        {remainingCount > 0 ? (
          <span className="inline-flex items-center rounded-full border border-border bg-surface-muted/50 px-2.5 py-1 text-[11px] text-text-muted">
            +{remainingCount} mais
          </span>
        ) : null}
      </div>

      <div className="mt-auto pt-5 flex justify-end">
        <Button
          type="button"
          size="sm"
          disabled={disabled || installingId !== null}
          onClick={() => onInstall(kit)}
          data-testid={`install-kit-${kit.id}`}
        >
          {isInstalling ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          {isInstalling ? "Criando..." : "Usar este modelo"}
        </Button>
      </div>
    </article>
  );
}

export function PreAdmissionChecklistsPage() {
  const [templates, setTemplates] = useState<PreAdmissionChecklistTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<PreAdmissionChecklistTemplateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");
  const [isTemplateEditorOpen, setIsTemplateEditorOpen] = useState(false);
  const [templateEditorMode, setTemplateEditorMode] = useState<"create" | "edit">("create");
  
  // Detalhes do checklist
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateAdmissionType, setTemplateAdmissionType] = useState("");
  const [templateIsDefault, setTemplateIsDefault] = useState(false);
  const [templateFormError, setTemplateFormError] = useState<string | null>(null);
  
  // Editor de documento
  const [isDocumentEditorOpen, setIsDocumentEditorOpen] = useState(false);
  const [documentEditorMode, setDocumentEditorMode] = useState<"create" | "edit">("create");
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null);
  const [documentDraft, setDocumentDraft] = useState<DocumentDraft>(EMPTY_DOCUMENT_DRAFT);
  const [documentError, setDocumentError] = useState<string | null>(null);
  
  // Galeria de kits
  const [showKitsGallery, setShowKitsGallery] = useState(false);
  const [installingKitId, setInstallingKitId] = useState<string | null>(null);

  const selectedTemplateSummary = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  );

  const filteredTemplates = useMemo(() => {
    const normalizedSearch = templateSearch.trim().toLowerCase();
    if (!normalizedSearch) return templates;

    return templates.filter((template) =>
      [template.name, template.description ?? "", template.admission_type ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch),
    );
  }, [templateSearch, templates]);

  const templateSummary = useMemo(() => {
    const total = templates.length;
    const active = templates.filter((template) => template.is_active).length;
    const defaults = templates.filter((template) => template.is_default).length;
    const totalDocuments = templates.reduce((sum, template) => sum + template.item_count, 0);
    const archived = total - active;
    const lastUpdatedAt = templates.reduce<string | null>((latest, template) => {
      if (!latest) return template.updated_at;
      return new Date(template.updated_at).getTime() > new Date(latest).getTime() ? template.updated_at : latest;
    }, null);

    return {
      total,
      active,
      defaults,
      totalDocuments,
      archived,
      lastUpdated: lastUpdatedAt ? formatDate(lastUpdatedAt) : "—",
    };
  }, [templates]);

  useEffect(() => {
    void loadTemplates();
  }, []);

  useEffect(() => {
    if (!selectedTemplateId) {
      setSelectedTemplate(null);
      setIsDocumentEditorOpen(false);
      return;
    }
    void loadTemplateDetail(selectedTemplateId);
  }, [selectedTemplateId]);

  useEffect(() => {
    if (!selectedTemplate) return;
    setTemplateName(selectedTemplate.name);
    setTemplateDescription(selectedTemplate.description ?? "");
    setTemplateAdmissionType(selectedTemplate.admission_type ?? "");
    setTemplateIsDefault(selectedTemplate.is_default);
  }, [selectedTemplate]);

  async function loadTemplates(nextSelectedId?: string | null) {
    try {
      setLoading(true);
      const data = await preAdmissionChecklistTemplatesService.listTemplates();
      setTemplates(data);
      const preferredId = nextSelectedId ?? selectedTemplateId;
      if (data.length === 0) {
        setSelectedTemplateId(null);
        return;
      }
      const candidate = preferredId && data.some((template) => template.id === preferredId)
        ? preferredId
        : null;
      setSelectedTemplateId(candidate);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao carregar checklists");
    } finally {
      setLoading(false);
    }
  }

  async function loadTemplateDetail(templateId: string) {
    try {
      const detail = await preAdmissionChecklistTemplatesService.getTemplate(templateId);
      setSelectedTemplate(detail);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao carregar checklist");
    }
  }

  function openTemplateCreate() {
    setTemplateEditorMode("create");
    setTemplateName("");
    setTemplateDescription("");
    setTemplateAdmissionType("");
    setTemplateIsDefault(false);
    setTemplateFormError(null);
    setIsTemplateEditorOpen(true);
  }

  function openTemplateEdit() {
    if (!selectedTemplate) return;
    setTemplateEditorMode("edit");
    setTemplateName(selectedTemplate.name);
    setTemplateDescription(selectedTemplate.description ?? "");
    setTemplateAdmissionType(selectedTemplate.admission_type ?? "");
    setTemplateIsDefault(selectedTemplate.is_default);
    setTemplateFormError(null);
    setIsTemplateEditorOpen(true);
  }

  function closeTemplateEditor() {
    setIsTemplateEditorOpen(false);
    setTemplateFormError(null);
  }

  async function handleSaveTemplateEditor() {
    if (!templateName.trim()) {
      setTemplateFormError("O nome do checklist é obrigatório.");
      return;
    }

    try {
      setSaving(true);
      setTemplateFormError(null);

      if (templateEditorMode === "create") {
        const created = await preAdmissionChecklistTemplatesService.createTemplate({
          name: templateName.trim(),
          description: templateDescription.trim() || null,
          admission_type: templateAdmissionType.trim() || null,
          is_active: true,
          is_default: templateIsDefault,
        });
        toast.success("Checklist criado.");
        closeTemplateEditor();
        await loadTemplates(created.id);
      } else if (selectedTemplate) {
        await preAdmissionChecklistTemplatesService.updateTemplate(selectedTemplate.id, {
          name: templateName.trim(),
          description: templateDescription.trim() || null,
          admission_type: templateAdmissionType.trim() || null,
          is_default: templateIsDefault,
        });
        toast.success("Checklist atualizado.");
        closeTemplateEditor();
        await loadTemplates(selectedTemplate.id);
        await loadTemplateDetail(selectedTemplate.id);
      }
    } catch (error) {
      setTemplateFormError(error instanceof Error ? error.message : "Erro ao salvar checklist");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchiveTemplate() {
    if (!selectedTemplate) return;
    if (!window.confirm("Deseja realmente arquivar este checklist?")) return;
    try {
      setSaving(true);
      await preAdmissionChecklistTemplatesService.archiveTemplate(selectedTemplate.id);
      toast.success("Checklist arquivado.");
      await loadTemplates(selectedTemplate.id);
      await loadTemplateDetail(selectedTemplate.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao arquivar checklist");
    } finally {
      setSaving(false);
    }
  }

  async function handleDuplicateTemplate(templateId?: string) {
    const idToDuplicate = templateId ?? selectedTemplate?.id;
    if (!idToDuplicate) return;
    try {
      setSaving(true);
      const duplicated = await preAdmissionChecklistTemplatesService.duplicateTemplate(idToDuplicate);
      toast.success("Checklist duplicado.");
      await loadTemplates(duplicated.id);
      await loadTemplateDetail(duplicated.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao duplicar checklist");
    } finally {
      setSaving(false);
    }
  }

  // Ações do Editor de Documento
  function openDocumentCreate() {
    setDocumentEditorMode("create");
    setEditingDocumentId(null);
    setDocumentDraft(EMPTY_DOCUMENT_DRAFT);
    setDocumentError(null);
    setIsDocumentEditorOpen(true);
  }

  function openDocumentEdit(item: PreAdmissionChecklistTemplateItem) {
    setDocumentEditorMode("edit");
    setEditingDocumentId(item.id);
    setDocumentDraft({
      document_key: item.document_key,
      title: item.title,
      candidate_description: item.candidate_description ?? "",
      is_required: item.is_required,
      accepted_file_types: item.accepted_file_types,
      max_file_size_mb: item.max_file_size_mb,
    });
    setDocumentError(null);
    setIsDocumentEditorOpen(true);
  }

  function closeDocumentEditor() {
    setIsDocumentEditorOpen(false);
    setEditingDocumentId(null);
    setDocumentDraft(EMPTY_DOCUMENT_DRAFT);
  }

  async function handleSaveDocument() {
    if (!selectedTemplate) return;
    if (!documentDraft.document_key.trim() || !documentDraft.title.trim()) {
      setDocumentError("Informe a chave e o título do documento.");
      return;
    }
    if (documentDraft.accepted_file_types.length === 0) {
      setDocumentError("Selecione ao menos um tipo de arquivo.");
      return;
    }

    try {
      setSaving(true);
      setDocumentError(null);
      if (documentEditorMode === "create") {
        await preAdmissionChecklistTemplatesService.createItem(selectedTemplate.id, {
          document_key: documentDraft.document_key.trim(),
          title: documentDraft.title.trim(),
          candidate_description: documentDraft.candidate_description.trim() || null,
          is_required: documentDraft.is_required,
          accepted_file_types: documentDraft.accepted_file_types,
          max_file_size_mb: documentDraft.max_file_size_mb,
        });
        toast.success("Documento adicionado ao checklist.");
      } else if (editingDocumentId) {
        await preAdmissionChecklistTemplatesService.updateItem(selectedTemplate.id, editingDocumentId, {
          document_key: documentDraft.document_key.trim(),
          title: documentDraft.title.trim(),
          candidate_description: documentDraft.candidate_description.trim() || null,
          is_required: documentDraft.is_required,
          accepted_file_types: documentDraft.accepted_file_types,
          max_file_size_mb: documentDraft.max_file_size_mb,
        });
        toast.success("Documento atualizado.");
      }
      closeDocumentEditor();
      await loadTemplates(selectedTemplate.id);
      await loadTemplateDetail(selectedTemplate.id);
    } catch (error) {
      setDocumentError(error instanceof Error ? error.message : "Erro ao salvar documento");
    } finally {
      setSaving(false);
    }
  }

  async function handleReorderItem(item: PreAdmissionChecklistTemplateItem, direction: "up" | "down") {
    if (!selectedTemplate) return;
    const items = [...selectedTemplate.items].sort((left, right) => left.display_order - right.display_order);
    const currentIndex = items.findIndex((entry) => entry.id === item.id);
    const swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    const swapItem = items[swapIndex];
    if (currentIndex < 0 || !swapItem) return;

    try {
      setSaving(true);
      await preAdmissionChecklistTemplatesService.updateItem(selectedTemplate.id, item.id, {
        display_order: swapItem.display_order,
      });
      await preAdmissionChecklistTemplatesService.updateItem(selectedTemplate.id, swapItem.id, {
        display_order: item.display_order,
      });
      await loadTemplateDetail(selectedTemplate.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao reordenar documento");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveItem(itemId: string) {
    if (!selectedTemplate) return;
    if (!window.confirm("Deseja realmente remover este documento do checklist?")) return;
    try {
      setSaving(true);
      await preAdmissionChecklistTemplatesService.deleteItem(selectedTemplate.id, itemId);
      toast.success("Documento removido do checklist.");
      await loadTemplateDetail(selectedTemplate.id);
      await loadTemplates(selectedTemplate.id);
      if (editingDocumentId === itemId) closeDocumentEditor();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao remover documento");
    } finally {
      setSaving(false);
    }
  }

  async function handleInstallKit(kit: TemplateKit) {
    try {
      setInstallingKitId(kit.id);
      const created = await preAdmissionChecklistTemplatesService.createTemplate({
        name: kit.name,
        description: kit.description,
        admission_type: kit.admission_type,
        is_active: true,
        is_default: templates.length === 0,
      });
      for (const doc of kit.documents) {
        await preAdmissionChecklistTemplatesService.createItem(created.id, {
          document_key: doc.document_key,
          title: doc.title,
          candidate_description: doc.candidate_description,
          is_required: doc.is_required,
          accepted_file_types: ["application/pdf", "image/jpeg", "image/png"],
          max_file_size_mb: 10,
        });
      }
      toast.success(`Checklist "${kit.name}" criado com ${kit.documents.length} documentos.`);
      setShowKitsGallery(false);
      await loadTemplates(created.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao criar checklist a partir do modelo.");
    } finally {
      setInstallingKitId(null);
    }
  }

  const handleToggleFileType = (value: string) => {
    setDocumentDraft((current) => ({
      ...current,
      accepted_file_types: current.accepted_file_types.includes(value)
        ? current.accepted_file_types.filter((entry) => entry !== value)
        : [...current.accepted_file_types, value],
    }));
  };

  if (loading && templates.length === 0) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-text-muted">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Carregando checklists admissionais...
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 pb-12">
      <header className="flex flex-col gap-3 rounded-[24px] border border-border bg-[linear-gradient(135deg,rgba(4,120,87,0.08),rgba(15,23,42,0.02))] p-5 md:flex-row md:items-center md:justify-between">
        <div className="max-w-2xl">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">Pré-admissão</p>
          <h1 className="mt-1 text-xl font-semibold text-text">Checklists de documentos</h1>
          <p className="mt-1 text-sm text-text-muted">
            Cadastre os modelos de documentos exigidos na abertura dos casos admissionais.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowKitsGallery((prev) => !prev)}
            data-testid="show-kits-gallery-btn"
          >
            <LayoutTemplate className="mr-2 h-4 w-4" />
            Modelos prontos
          </Button>
          <Button type="button" size="sm" onClick={openTemplateCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Novo checklist
          </Button>
        </div>
      </header>

      <section className="flex flex-wrap gap-4">
        <SummaryStat label="Checklists" value={templateSummary.total} />
        <SummaryStat label="Ativos" value={templateSummary.active} isSuccess />
        <SummaryStat label="Padrão" value={templateSummary.defaults} />
        <SummaryStat label="Documentos" value={templateSummary.totalDocuments} />
        <SummaryStat label="Arquivados" value={templateSummary.archived} isDanger={templateSummary.archived > 0} />
        <SummaryStat label="Última alteração" value={templateSummary.lastUpdated} />
      </section>

      {(showKitsGallery || (templates.length === 0 && !loading)) ? (
        <section
          className="rounded-[24px] border border-border bg-[linear-gradient(135deg,rgba(4,120,87,0.04),rgba(15,23,42,0.02))] p-5"
          data-testid="template-kits-gallery"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">Galeria</p>
              <h3 className="mt-1 text-base font-semibold text-text">Começar a partir de um modelo pronto</h3>
              <p className="mt-1 text-sm text-text-muted">
                Crie um checklist completo com os documentos mais comuns para cada tipo de contratação.
              </p>
            </div>
            {templates.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowKitsGallery(false)}
                className="shrink-0 rounded-full p-2 text-text-muted hover:bg-black/5 hover:text-text transition"
                data-testid="close-kits-gallery-btn"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {TEMPLATE_KITS.map((kit) => (
              <TemplateKitCard
                key={kit.id}
                kit={kit}
                installingId={installingKitId}
                disabled={saving}
                onInstall={(k) => void handleInstallKit(k)}
              />
            ))}
          </div>
        </section>
      ) : null}

      <div className="flex flex-col gap-6">
        <section className="rounded-2xl border border-border bg-white shadow-sm flex flex-col">
          <div className="border-b border-border/60 bg-surface-muted/20 px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-text">Lista de checklists</h2>
              <p className="text-[13px] text-text-muted">Selecione um modelo para revisar documentos e abrir edições sob demanda.</p>
            </div>

            <div className="relative w-full md:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
              <input
                type="text"
                className="w-full rounded-full border border-border bg-white pl-9 pr-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all shadow-sm"
                placeholder="Buscar checklist por nome, descrição ou tipo..."
                value={templateSearch}
                onChange={(event) => setTemplateSearch(event.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center p-12 text-sm text-text-muted">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Carregando checklists admissionais...
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-border bg-white p-10 text-center text-sm text-text-muted flex flex-col items-center">
              <div className="h-12 w-12 rounded-full bg-surface-muted flex items-center justify-center mb-3">
                <LayoutTemplate className="h-6 w-6 text-text-muted/60" />
              </div>
              <p className="text-sm font-medium text-text">
                {templateSearch.trim() ? "Nenhum checklist encontrado." : "Nenhum checklist cadastrado."}
              </p>
              <p className="mt-1 max-w-sm text-sm text-text-muted">
                {templateSearch.trim()
                  ? "Tente outro termo de busca ou crie um novo checklist."
                  : "Crie um checklist novo ou use um modelo pronto para começar."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm" data-testid="checklists-table">
                <thead className="bg-surface/50 text-[11px] font-semibold uppercase tracking-wider text-text-muted border-b border-border/60">
                  <tr>
                    <th className="px-4 py-3 font-medium">Checklist</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Metadados</th>
                    <th className="px-4 py-3 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredTemplates.map((template) => {
                    const isSelected = template.id === selectedTemplateId;
                    return (
                      <tr
                        key={template.id}
                        onClick={() => setSelectedTemplateId(template.id)}
                        className={`cursor-pointer transition-colors hover:bg-surface/30 ${isSelected ? "bg-emerald-50/50" : ""}`}
                      >
                        <td className="px-4 py-3 min-w-[220px]">
                          <div
                            className="text-left"
                            data-testid={`checklist-card-${template.id}`}
                          >
                            <p className="font-semibold text-text">{template.name}</p>
                            <p className="mt-0.5 text-[11px] text-text-muted">
                              {template.description || "Sem descrição"}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex flex-col gap-1.5">
                            <Badge
                              variant="outline"
                              className={`w-fit text-[10px] uppercase font-bold py-0.5 h-auto ${
                                template.is_active
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-slate-50 text-slate-600 border-slate-200"
                              }`}
                            >
                              {template.is_active ? "Ativo" : "Arquivado"}
                            </Badge>
                            {template.is_default ? (
                              <span className="text-[11px] text-text-muted">Checklist padrão</span>
                            ) : (
                              <span className="text-[11px] text-text-muted">Sem padrão global</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] text-text-muted">
                              {template.item_count} documento(s)
                              {template.admission_type ? ` • ${template.admission_type}` : ""}
                            </span>
                            <span className="text-[11px] text-text-muted">
                              Atualizado em {formatDate(template.updated_at)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedTemplateId(template.id);
                                  }}
                                  className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-muted hover:text-emerald-600"
                                >
                                  <FilePlus2 className="h-4 w-4" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Ver documentos</p>
                              </TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleDuplicateTemplate(template.id);
                                  }}
                                  className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-muted hover:text-emerald-600"
                                >
                                  <Copy className="h-4 w-4" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Duplicar checklist</p>
                              </TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedTemplateId(template.id);
                                    void loadTemplateDetail(template.id).then(() => openTemplateEdit());
                                  }}
                                  className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-muted hover:text-emerald-600"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Editar checklist</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-6">
          {!selectedTemplate ? (
            <div className="rounded-[24px] border border-dashed border-border bg-white p-10 text-center text-sm text-text-muted flex flex-col items-center">
              <div className="h-12 w-12 rounded-full bg-surface-muted flex items-center justify-center mb-3">
                <LayoutTemplate className="h-6 w-6 text-text-muted/60" />
              </div>
              <p>Selecione um checklist na lista para revisar os documentos exigidos.</p>
            </div>
          ) : (
            <>
              <div className="rounded-[24px] border border-border bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-text truncate">{selectedTemplateSummary?.name}</h2>
                    <p className="mt-1 text-sm text-text-muted">
                      {selectedTemplateSummary?.description || "Sem descrição pública."}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-text-muted">
                      <span className="rounded-full border border-border px-2 py-1">
                        {selectedTemplate.items.length} item(ns)
                      </span>
                      {selectedTemplate.admission_type ? (
                        <span className="rounded-full border border-border px-2 py-1">
                          {selectedTemplate.admission_type}
                        </span>
                      ) : null}
                      {selectedTemplate.is_default ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700">
                          Padrão global
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <Button type="button" onClick={openTemplateEdit} disabled={saving} data-testid="edit-template-btn">
                      <Pencil className="mr-2 h-4 w-4" />
                      Editar checklist
                    </Button>
                  </div>
                </div>
              </div>

              {/* Tabela de Documentos (Read-Only) */}
              <div className="rounded-[24px] border border-border bg-white shadow-sm overflow-hidden flex flex-col">
                <div className="flex items-center justify-between border-b border-border/60 bg-surface-muted/20 px-5 py-4">
                  <div>
                    <h3 className="text-base font-semibold text-text">Documentos solicitados</h3>
                    <p className="text-[13px] text-text-muted">{selectedTemplate.items.length} itens ativos neste checklist.</p>
                  </div>
                </div>

                {selectedTemplate.items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-12 text-center">
                    <div className="h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                      <FilePlus2 className="h-5 w-5 text-emerald-600" />
                    </div>
                    <p className="text-sm font-medium text-text">Nenhum documento neste checklist</p>
                    <p className="mt-1 text-sm text-text-muted max-w-sm">
                      Clique em "Editar checklist" para adicionar documentos e organizar a lista.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-surface/50 text-[11px] font-semibold uppercase tracking-wider text-text-muted border-b border-border/60">
                        <tr>
                          <th className="px-5 py-3 font-medium">Ordem</th>
                          <th className="px-5 py-3 font-medium">Documento</th>
                          <th className="px-5 py-3 font-medium">Chave</th>
                          <th className="px-5 py-3 font-medium">Regras</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {selectedTemplate.items.map((item, index) => (
                          <tr key={item.id} className="transition-colors hover:bg-surface/30">
                            <td className="px-5 py-3 whitespace-nowrap text-text-muted">
                              #{item.display_order + 1}
                            </td>
                            <td className="px-5 py-3 min-w-[200px]">
                              <div className="font-medium text-text">{item.title}</div>
                              <div className="text-[12px] text-text-muted truncate max-w-[250px]" title={item.candidate_description ?? ""}>
                                {item.candidate_description || "Sem descrição pública."}
                              </div>
                            </td>
                            <td className="px-5 py-3 whitespace-nowrap">
                              <code className="rounded bg-surface-muted px-1.5 py-0.5 text-[11px] text-text-muted">{item.document_key}</code>
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex flex-col gap-1.5">
                                {item.is_required ? (
                                  <span className="inline-flex w-fit items-center rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                                    Obrigatório
                                  </span>
                                ) : (
                                  <span className="inline-flex w-fit items-center rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                                    Opcional
                                  </span>
                                )}
                                <span className="text-[11px] text-text-muted">Até {item.max_file_size_mb}MB</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {/* Unified Template Editor Drawer */}
      {isTemplateEditorOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-950/30 backdrop-blur-[2px] transition-opacity" onClick={closeTemplateEditor} aria-hidden="true" />
          <div className="relative w-full max-w-2xl h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right-8 duration-300" role="dialog" aria-label={templateEditorMode === "create" ? "Criar checklist" : "Editar checklist"} data-testid="checklist-create-form">
            <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-surface-muted/20">
              <div>
                <h3 className="text-base font-semibold text-text">
                  {templateEditorMode === "create" ? "Novo checklist" : "Editar checklist"}
                </h3>
                <p className="text-[11px] text-text-muted mt-0.5">Configure os dados do modelo e os documentos solicitados.</p>
              </div>
              <button onClick={closeTemplateEditor} className="rounded-full p-2 text-text-muted hover:bg-surface-muted hover:text-text transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden">
              <Tabs defaultValue="geral" className="flex h-full flex-col">
                <div className="border-b border-border bg-surface/30 px-6 py-3">
                  <TabsList>
                    <TabsTrigger value="geral">
                      <LayoutTemplate className="mr-2 h-4 w-4" />
                      Geral
                    </TabsTrigger>
                    {templateEditorMode === "edit" && selectedTemplate ? (
                      <TabsTrigger value="documentos">
                        <FilePlus2 className="mr-2 h-4 w-4" />
                        Documentos
                      </TabsTrigger>
                    ) : null}
                    {templateEditorMode === "edit" && selectedTemplate ? (
                      <TabsTrigger value="configuracoes">
                        <Settings className="mr-2 h-4 w-4" />
                        Configurações
                      </TabsTrigger>
                    ) : null}
                  </TabsList>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                  <TabsContent value="geral" className="mt-0 space-y-5 focus:outline-none">
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block space-y-1.5 text-sm">
                        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Nome</span>
                        <input
                          value={templateName}
                          onChange={(event) => setTemplateName(event.target.value)}
                          placeholder="Checklist admissional padrão"
                          className="w-full rounded-xl border border-border px-3 py-2 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                        />
                      </label>
                      <label className="block space-y-1.5 text-sm">
                        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Tipo de admissão</span>
                        <input
                          value={templateAdmissionType}
                          onChange={(event) => setTemplateAdmissionType(event.target.value)}
                          placeholder="CLT, estágio, aprendiz..."
                          className="w-full rounded-xl border border-border px-3 py-2 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                        />
                      </label>
                    </div>

                    <label className="block space-y-1.5 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Descrição</span>
                      <textarea
                        value={templateDescription}
                        onChange={(event) => setTemplateDescription(event.target.value)}
                        rows={3}
                        className="w-full rounded-xl border border-border px-3 py-2 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-none"
                      />
                    </label>

                    <label className="inline-flex items-center gap-2 text-sm font-medium text-text cursor-pointer">
                      <input
                        type="checkbox"
                        checked={templateIsDefault}
                        onChange={(event) => setTemplateIsDefault(event.target.checked)}
                        className="rounded border-border text-emerald-600 focus:ring-emerald-500"
                      />
                      Usar como checklist padrão
                    </label>

                    {templateFormError ? (
                      <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{templateFormError}</p>
                    ) : null}
                  </TabsContent>

                  {templateEditorMode === "edit" && selectedTemplate ? (
                    <TabsContent value="documentos" className="mt-0 space-y-5 focus:outline-none">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-text">Lista de Documentos</h4>
                        <Button type="button" size="sm" onClick={openDocumentCreate} disabled={saving || isDocumentEditorOpen} data-testid="checklist-item-add-btn">
                          <Plus className="mr-2 h-4 w-4" />
                          Adicionar
                        </Button>
                      </div>

                      {selectedTemplate.items.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border p-8 text-center bg-surface-muted/30">
                          <p className="text-sm font-medium text-text">Nenhum documento neste checklist</p>
                          <p className="mt-1 text-[13px] text-text-muted mb-4 max-w-xs mx-auto">Comece adicionando o primeiro documento exigido para o candidato.</p>
                          <Button type="button" onClick={openDocumentCreate} data-testid="checklist-item-empty-add-btn">
                            Adicionar documento
                          </Button>
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-xl border border-border shadow-sm">
                          <table className="w-full text-left text-sm">
                            <thead className="bg-surface/50 text-[10px] font-semibold uppercase tracking-wider text-text-muted border-b border-border/60">
                              <tr>
                                <th className="px-4 py-2 font-medium">Documento</th>
                                <th className="px-4 py-2 font-medium">Obrigatório</th>
                                <th className="px-4 py-2 font-medium text-right">Ações</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60">
                              {selectedTemplate.items.map((item, index) => {
                                const isFirst = index === 0;
                                const isLast = index === selectedTemplate.items.length - 1;
                                const isEditing = editingDocumentId === item.id;
                                return (
                                  <tr key={item.id} className={`transition-colors hover:bg-surface/30 ${isEditing ? "bg-emerald-50/50" : ""}`}>
                                    <td className="px-4 py-2">
                                      <div className="font-medium text-text">{item.title}</div>
                                      <code className="text-[10px] text-text-muted mt-0.5">{item.document_key}</code>
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap">
                                      {item.is_required ? (
                                        <span className="text-amber-700 text-[11px] font-medium border border-amber-200 bg-amber-50 px-1.5 py-0.5 rounded">Sim</span>
                                      ) : (
                                        <span className="text-slate-500 text-[11px] border border-slate-200 bg-slate-50 px-1.5 py-0.5 rounded">Não</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-2 text-right whitespace-nowrap">
                                      <div className="flex items-center justify-end">
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <button
                                              type="button"
                                              disabled={saving || isFirst}
                                              onClick={() => handleReorderItem(item, "up")}
                                              className="p-1.5 text-text-muted hover:text-text disabled:opacity-30 disabled:hover:text-text-muted rounded-md hover:bg-surface-muted transition-colors"
                                            >
                                              <ArrowUp className="h-3.5 w-3.5" />
                                            </button>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>Mover para cima</p>
                                          </TooltipContent>
                                        </Tooltip>

                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <button
                                              type="button"
                                              disabled={saving || isLast}
                                              onClick={() => handleReorderItem(item, "down")}
                                              className="p-1.5 text-text-muted hover:text-text disabled:opacity-30 disabled:hover:text-text-muted rounded-md hover:bg-surface-muted transition-colors"
                                            >
                                              <ArrowDown className="h-3.5 w-3.5" />
                                            </button>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>Mover para baixo</p>
                                          </TooltipContent>
                                        </Tooltip>

                                        <div className="w-px h-3 bg-border/80 mx-1" />

                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <button
                                              type="button"
                                              onClick={() => openDocumentEdit(item)}
                                              className="p-1.5 text-text-muted hover:text-emerald-700 rounded-md hover:bg-surface-muted transition-colors"
                                              data-testid={`edit-item-${item.id}`}
                                            >
                                              <Pencil className="h-3.5 w-3.5" />
                                            </button>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>Editar documento</p>
                                          </TooltipContent>
                                        </Tooltip>

                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <button
                                              type="button"
                                              disabled={saving}
                                              onClick={() => handleRemoveItem(item.id)}
                                              className="p-1.5 text-text-muted hover:text-red-600 rounded-md hover:bg-red-50 transition-colors"
                                              data-testid={`remove-item-${item.id}`}
                                            >
                                              <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>Remover documento</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </TabsContent>
                  ) : null}

                  {templateEditorMode === "edit" && selectedTemplate ? (
                    <TabsContent value="configuracoes" className="mt-0 space-y-6 focus:outline-none">
                      <div className="rounded-xl border border-border p-5 bg-surface-muted/10">
                        <h4 className="text-sm font-semibold text-text mb-4">Ações Avançadas do Checklist</h4>
                        <div className="flex flex-col gap-3">
                          <Button type="button" variant="outline" className="w-fit" onClick={() => void handleDuplicateTemplate()} disabled={saving}>
                            <Copy className="mr-2 h-4 w-4" />
                            Duplicar este checklist
                          </Button>
                          <Button type="button" variant="outline" className="w-fit border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => void handleArchiveTemplate()} disabled={saving}>
                            <Archive className="mr-2 h-4 w-4" />
                            Arquivar este checklist
                          </Button>
                        </div>
                      </div>
                    </TabsContent>
                  ) : null}
                </div>
              </Tabs>
            </div>

            <div className="border-t border-border p-5 flex justify-end gap-3 bg-white">
              <Button type="button" variant="outline" onClick={closeTemplateEditor} disabled={saving}>
                Cancelar
              </Button>
              <Button type="button" onClick={() => void handleSaveTemplateEditor()} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {templateEditorMode === "create" ? "Criar checklist" : "Salvar alterações"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Drawer / Modal de Edição de Documento sob demanda */}
      {isDocumentEditorOpen && selectedTemplate && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          <div 
            className="absolute inset-0 bg-slate-950/30 backdrop-blur-[2px] transition-opacity" 
            onClick={closeDocumentEditor}
            aria-hidden="true"
          />
          <div 
            className="relative w-full max-w-md h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right-8 duration-300"
            role="dialog"
            aria-label={documentEditorMode === "create" ? "Adicionar documento" : "Editar documento"}
            data-testid="checklist-item-create-form"
          >
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-text">
                {documentEditorMode === "create" ? "Adicionar documento" : "Editar documento"}
              </h3>
              <button 
                onClick={closeDocumentEditor}
                className="rounded-full p-2 text-text-muted hover:bg-surface-muted hover:text-text transition-colors"
                data-testid="close-editor-btn"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
              <label className="block space-y-1.5 text-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Chave do documento</span>
                <input
                  value={documentDraft.document_key}
                  onChange={(event) => setDocumentDraft((current) => ({ ...current, document_key: event.target.value }))}
                  placeholder="ex: rg, cpf, cnh"
                  className="w-full rounded-xl border border-border px-3 py-2 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
              </label>

              <label className="block space-y-1.5 text-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Título visível</span>
                <input
                  value={documentDraft.title}
                  onChange={(event) => setDocumentDraft((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Ex: RG (Registro Geral)"
                  className="w-full rounded-xl border border-border px-3 py-2 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
              </label>

              <label className="block space-y-1.5 text-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Descrição ou instruções
                </span>
                <textarea
                  value={documentDraft.candidate_description}
                  onChange={(event) =>
                    setDocumentDraft((current) => ({ ...current, candidate_description: event.target.value }))
                  }
                  rows={3}
                  placeholder="Instruções públicas que o candidato verá..."
                  className="w-full rounded-xl border border-border px-3 py-2 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-none"
                />
              </label>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Formatos aceitos
                </p>
                <div className="flex flex-col gap-2">
                  {FILE_TYPE_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm cursor-pointer transition-colors ${
                        documentDraft.accepted_file_types.includes(option.value) 
                          ? "border-emerald-500 bg-emerald-50/50" 
                          : "border-border hover:border-emerald-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={documentDraft.accepted_file_types.includes(option.value)}
                        onChange={() => handleToggleFileType(option.value)}
                        className="rounded border-border text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="font-medium text-text">{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <label className="block space-y-1.5 text-sm">
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Tamanho máximo
                  </span>
                  <div className="relative">
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={documentDraft.max_file_size_mb}
                      onChange={(event) =>
                        setDocumentDraft((current) => ({
                          ...current,
                          max_file_size_mb: Number(event.target.value) || 1,
                        }))
                      }
                      className="w-full rounded-xl border border-border px-3 py-2 pr-10 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-muted pointer-events-none">
                      MB
                    </span>
                  </div>
                </label>
                
                <div className="flex flex-col justify-end pb-1.5">
                  <label className="flex items-center gap-2 text-sm font-medium text-text cursor-pointer">
                    <input
                      type="checkbox"
                      checked={documentDraft.is_required}
                      onChange={(event) =>
                        setDocumentDraft((current) => ({ ...current, is_required: event.target.checked }))
                      }
                      className="rounded border-border text-emerald-600 focus:ring-emerald-500"
                    />
                    Obrigatório
                  </label>
                </div>
              </div>

              {documentError ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {documentError}
                </p>
              ) : null}
            </div>

            <div className="border-t border-border bg-surface/50 p-6 flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={closeDocumentEditor} disabled={saving}>
                Cancelar
              </Button>
              <Button type="button" onClick={() => void handleSaveDocument()} disabled={saving} data-testid="save-item-btn">
                <Save className="mr-2 h-4 w-4" />
                {documentEditorMode === "create" ? "Adicionar" : "Salvar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
    </TooltipProvider>
  );
}
