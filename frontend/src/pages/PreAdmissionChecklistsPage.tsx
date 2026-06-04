import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Copy,
  FilePlus2,
  LayoutTemplate,
  Loader2,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
      className="flex flex-col rounded-[28px] border border-border bg-white p-5 shadow-sm"
      data-testid={`kit-card-${kit.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-text">{kit.name}</p>
          <p className="mt-1 text-sm text-text-muted">{kit.description}</p>
        </div>
        <Badge variant="outline" className="shrink-0">{kit.admission_type}</Badge>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {visibleDocs.map((doc) => (
          <span
            key={doc.document_key}
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
              doc.is_required
                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border border-border bg-surface-muted/50 text-text-muted"
            }`}
          >
            {doc.title}
          </span>
        ))}
        {remainingCount > 0 ? (
          <span className="inline-flex items-center rounded-full border border-border bg-surface-muted/50 px-2.5 py-1 text-xs text-text-muted">
            +{remainingCount} mais
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex justify-end">
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

function TemplateItemEditor({
  item,
  disabled,
  isFirst,
  isLast,
  onSave,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  item: PreAdmissionChecklistTemplateItem;
  disabled: boolean;
  isFirst: boolean;
  isLast: boolean;
  onSave: (itemId: string, payload: Partial<PreAdmissionChecklistTemplateItem>) => Promise<void>;
  onMoveUp: () => Promise<void>;
  onMoveDown: () => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [documentKey, setDocumentKey] = useState(item.document_key);
  const [title, setTitle] = useState(item.title);
  const [candidateDescription, setCandidateDescription] = useState(item.candidate_description ?? "");
  const [isRequired, setIsRequired] = useState(item.is_required);
  const [acceptedFileTypes, setAcceptedFileTypes] = useState<string[]>(item.accepted_file_types);
  const [maxFileSizeMb, setMaxFileSizeMb] = useState(item.max_file_size_mb);

  useEffect(() => {
    setDocumentKey(item.document_key);
    setTitle(item.title);
    setCandidateDescription(item.candidate_description ?? "");
    setIsRequired(item.is_required);
    setAcceptedFileTypes(item.accepted_file_types);
    setMaxFileSizeMb(item.max_file_size_mb);
  }, [item]);

  const handleToggleFileType = (value: string) => {
    setAcceptedFileTypes((current) =>
      current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value],
    );
  };

  return (
    <article className="rounded-3xl border border-border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-text">{item.title}</h3>
            <Badge variant="outline" className={item.is_required ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-slate-50 text-slate-700"}>
              {item.is_required ? "Obrigatório" : "Opcional"}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-text-muted">
            Ordem {item.display_order + 1} • Atualizado em {formatDate(item.updated_at)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={disabled || isFirst} onClick={() => void onMoveUp()}>
            <ArrowUp className="mr-1 h-4 w-4" />
            Subir
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled || isLast} onClick={() => void onMoveDown()}>
            <ArrowDown className="mr-1 h-4 w-4" />
            Descer
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => void onRemove()}>
            <Trash2 className="mr-1 h-4 w-4" />
            Remover
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Chave</span>
          <input
            value={documentKey}
            onChange={(event) => setDocumentKey(event.target.value)}
            className="w-full rounded-2xl border border-border px-3 py-2"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Título</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded-2xl border border-border px-3 py-2"
          />
        </label>
      </div>

      <label className="mt-4 block space-y-1 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Descrição pública para o candidato
        </span>
        <textarea
          value={candidateDescription}
          onChange={(event) => setCandidateDescription(event.target.value)}
          rows={3}
          className="w-full rounded-2xl border border-border px-3 py-2"
        />
      </label>

      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_220px]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Tipos aceitos
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {FILE_TYPE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={acceptedFileTypes.includes(option.value)}
                  onChange={() => handleToggleFileType(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <label className="block space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Tamanho máximo (MB)
            </span>
            <input
              type="number"
              min={1}
              max={10}
              value={maxFileSizeMb}
              onChange={(event) => setMaxFileSizeMb(Number(event.target.value) || 1)}
              className="w-full rounded-2xl border border-border px-3 py-2"
            />
          </label>
          <label className="inline-flex items-center gap-2 text-sm font-medium text-text">
            <input type="checkbox" checked={isRequired} onChange={(event) => setIsRequired(event.target.checked)} />
            Documento obrigatório
          </label>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          type="button"
          disabled={disabled}
          onClick={() =>
            void onSave(item.id, {
              document_key: documentKey,
              title,
              candidate_description: candidateDescription,
              is_required: isRequired,
              accepted_file_types: acceptedFileTypes,
              max_file_size_mb: maxFileSizeMb,
            })
          }
        >
          <Save className="mr-2 h-4 w-4" />
          Salvar documento
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
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateAdmissionType, setTemplateAdmissionType] = useState("");
  const [templateIsDefault, setTemplateIsDefault] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createAdmissionType, setCreateAdmissionType] = useState("");
  const [createIsDefault, setCreateIsDefault] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [documentDraft, setDocumentDraft] = useState<DocumentDraft>(EMPTY_DOCUMENT_DRAFT);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [showKitsGallery, setShowKitsGallery] = useState(false);
  const [installingKitId, setInstallingKitId] = useState<string | null>(null);

  const selectedTemplateSummary = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  );

  useEffect(() => {
    void loadTemplates();
  }, []);

  useEffect(() => {
    if (!selectedTemplateId) {
      setSelectedTemplate(null);
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
        : data[0].id;
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

  async function handleCreateTemplate() {
    if (!createName.trim()) {
      setCreateError("O nome do checklist é obrigatório.");
      return;
    }

    try {
      setSaving(true);
      setCreateError(null);
      const created = await preAdmissionChecklistTemplatesService.createTemplate({
        name: createName.trim(),
        description: createDescription.trim() || null,
        admission_type: createAdmissionType.trim() || null,
        is_active: true,
        is_default: createIsDefault,
      });
      toast.success("Checklist criado.");
      setShowCreateForm(false);
      setCreateName("");
      setCreateDescription("");
      setCreateAdmissionType("");
      setCreateIsDefault(false);
      await loadTemplates(created.id);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Erro ao criar checklist");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveTemplate() {
    if (!selectedTemplate) return;
    if (!templateName.trim()) {
      toast.error("O nome do checklist é obrigatório.");
      return;
    }

    try {
      setSaving(true);
      await preAdmissionChecklistTemplatesService.updateTemplate(selectedTemplate.id, {
        name: templateName.trim(),
        description: templateDescription.trim() || null,
        admission_type: templateAdmissionType.trim() || null,
        is_default: templateIsDefault,
      });
      toast.success("Checklist atualizado.");
      await loadTemplates(selectedTemplate.id);
      await loadTemplateDetail(selectedTemplate.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar checklist");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchiveTemplate() {
    if (!selectedTemplate) return;
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

  async function handleDuplicateTemplate() {
    if (!selectedTemplate) return;
    try {
      setSaving(true);
      const duplicated = await preAdmissionChecklistTemplatesService.duplicateTemplate(selectedTemplate.id);
      toast.success("Checklist duplicado.");
      await loadTemplates(duplicated.id);
      await loadTemplateDetail(duplicated.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao duplicar checklist");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddDocument() {
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
      await preAdmissionChecklistTemplatesService.createItem(selectedTemplate.id, {
        document_key: documentDraft.document_key.trim(),
        title: documentDraft.title.trim(),
        candidate_description: documentDraft.candidate_description.trim() || null,
        is_required: documentDraft.is_required,
        accepted_file_types: documentDraft.accepted_file_types,
        max_file_size_mb: documentDraft.max_file_size_mb,
      });
      toast.success("Documento adicionado ao checklist.");
      setDocumentDraft(EMPTY_DOCUMENT_DRAFT);
      await loadTemplates(selectedTemplate.id);
      await loadTemplateDetail(selectedTemplate.id);
    } catch (error) {
      setDocumentError(error instanceof Error ? error.message : "Erro ao adicionar documento");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveItem(itemId: string, payload: Partial<PreAdmissionChecklistTemplateItem>) {
    if (!selectedTemplate) return;
    try {
      setSaving(true);
      await preAdmissionChecklistTemplatesService.updateItem(selectedTemplate.id, itemId, payload);
      toast.success("Documento atualizado.");
      await loadTemplateDetail(selectedTemplate.id);
      await loadTemplates(selectedTemplate.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao atualizar documento");
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
    try {
      setSaving(true);
      await preAdmissionChecklistTemplatesService.deleteItem(selectedTemplate.id, itemId);
      toast.success("Documento removido do checklist.");
      await loadTemplateDetail(selectedTemplate.id);
      await loadTemplates(selectedTemplate.id);
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

  if (loading && templates.length === 0) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-text-muted">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Carregando checklists admissionais...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 rounded-[32px] border border-border bg-[linear-gradient(135deg,rgba(4,120,87,0.08),rgba(15,23,42,0.02))] p-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Pré-admissão</p>
          <h1 className="mt-2 text-2xl font-semibold text-text">Checklists de documentos</h1>
          <p className="mt-2 text-sm text-text-muted">
            Cadastre os modelos de documentos usados pelo RH na abertura dos casos admissionais. Os itens ativos
            são copiados como snapshot para o caso no momento da criação.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowKitsGallery((prev) => !prev)}
            data-testid="show-kits-gallery-btn"
          >
            <LayoutTemplate className="mr-2 h-4 w-4" />
            Modelos prontos
          </Button>
          <Button type="button" onClick={() => setShowCreateForm((current) => !current)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo checklist
          </Button>
        </div>
      </header>

      {(showKitsGallery || (templates.length === 0 && !loading)) ? (
        <section
          className="rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(4,120,87,0.04),rgba(15,23,42,0.02))] p-5"
          data-testid="template-kits-gallery"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Modelos prontos</p>
              <h3 className="mt-1 text-base font-semibold text-text">Começar a partir de um modelo</h3>
              <p className="mt-1 text-sm text-text-muted">
                Clique em "Usar este modelo" para criar um checklist completo com os documentos mais comuns para cada tipo de contratação.
              </p>
            </div>
            {templates.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowKitsGallery(false)}
                className="shrink-0 text-sm text-text-muted hover:text-text"
              >
                Fechar
              </button>
            ) : null}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
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

      {showCreateForm ? (
        <section className="rounded-[28px] border border-border bg-white p-5 shadow-sm" data-testid="checklist-create-form">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Nome</span>
              <input
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                placeholder="Checklist admissional padrão"
                className="w-full rounded-2xl border border-border px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Tipo de admissão
              </span>
              <input
                value={createAdmissionType}
                onChange={(event) => setCreateAdmissionType(event.target.value)}
                placeholder="CLT, estágio, aprendiz..."
                className="w-full rounded-2xl border border-border px-3 py-2"
              />
            </label>
          </div>
          <label className="mt-4 block space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Descrição</span>
            <textarea
              value={createDescription}
              onChange={(event) => setCreateDescription(event.target.value)}
              rows={3}
              className="w-full rounded-2xl border border-border px-3 py-2"
            />
          </label>
          <label className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-text">
            <input type="checkbox" checked={createIsDefault} onChange={(event) => setCreateIsDefault(event.target.checked)} />
            Usar como checklist padrão
          </label>
          {createError ? (
            <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{createError}</p>
          ) : null}
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void handleCreateTemplate()} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              Criar checklist
            </Button>
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-4">
          {templates.map((template) => {
            const isSelected = template.id === selectedTemplateId;
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => setSelectedTemplateId(template.id)}
                className={`w-full rounded-[28px] border p-5 text-left shadow-sm transition ${
                  isSelected
                    ? "border-emerald-500 bg-emerald-50/80"
                    : "border-border bg-white hover:border-emerald-300"
                }`}
                data-testid={`checklist-card-${template.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-text">{template.name}</p>
                    <p className="mt-1 text-sm text-text-muted">
                      {template.description || "Sem descrição cadastrada."}
                    </p>
                  </div>
                  {template.is_default ? (
                    <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Padrão</Badge>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-text-muted">
                  <Badge variant="outline">{template.is_active ? "Ativo" : "Arquivado"}</Badge>
                  <Badge variant="outline">{template.item_count} documentos</Badge>
                  {template.admission_type ? <Badge variant="outline">{template.admission_type}</Badge> : null}
                </div>
                <p className="mt-4 text-xs text-text-muted">Atualizado em {formatDate(template.updated_at)}</p>
              </button>
            );
          })}
        </aside>

        <section className="space-y-5">
          {!selectedTemplate ? (
            <div className="rounded-[28px] border border-dashed border-border bg-white p-10 text-center text-sm text-text-muted">
              Selecione um checklist para editar os documentos exigidos na pré-admissão.
            </div>
          ) : (
            <>
              <div className="rounded-[32px] border border-border bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold text-text">{selectedTemplateSummary?.name}</h2>
                      {selectedTemplateSummary?.is_default ? (
                        <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                          <ShieldCheck className="mr-1 h-3 w-3" />
                          Padrão
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-text-muted">
                      {selectedTemplate.items.length} documento(s) ativo(s) neste checklist.
                    </p>
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
                    <Button type="button" onClick={() => void handleSaveTemplate()} disabled={saving}>
                      <Save className="mr-2 h-4 w-4" />
                      Salvar checklist
                    </Button>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <label className="space-y-1 text-sm">
                    <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Nome</span>
                    <input
                      value={templateName}
                      onChange={(event) => setTemplateName(event.target.value)}
                      className="w-full rounded-2xl border border-border px-3 py-2"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                      Tipo de admissão
                    </span>
                    <input
                      value={templateAdmissionType}
                      onChange={(event) => setTemplateAdmissionType(event.target.value)}
                      className="w-full rounded-2xl border border-border px-3 py-2"
                    />
                  </label>
                </div>

                <label className="mt-4 block space-y-1 text-sm">
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Descrição</span>
                  <textarea
                    value={templateDescription}
                    onChange={(event) => setTemplateDescription(event.target.value)}
                    rows={3}
                    className="w-full rounded-2xl border border-border px-3 py-2"
                  />
                </label>

                <label className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-text">
                  <input type="checkbox" checked={templateIsDefault} onChange={(event) => setTemplateIsDefault(event.target.checked)} />
                  Usar este checklist como padrão quando nenhum template for informado
                </label>
              </div>

              <div className="rounded-[32px] border border-border bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">
                      Documentos do checklist
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-text">Itens ativos</h3>
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  {selectedTemplate.items.map((item, index) => (
                    <TemplateItemEditor
                      key={item.id}
                      item={item}
                      disabled={saving}
                      isFirst={index === 0}
                      isLast={index === selectedTemplate.items.length - 1}
                      onSave={handleSaveItem}
                      onMoveUp={() => handleReorderItem(item, "up")}
                      onMoveDown={() => handleReorderItem(item, "down")}
                      onRemove={() => handleRemoveItem(item.id)}
                    />
                  ))}
                </div>

                <div className="mt-6 rounded-[28px] border border-dashed border-border bg-surface-muted/30 p-5" data-testid="checklist-item-create-form">
                  <div className="flex items-center gap-2">
                    <FilePlus2 className="h-4 w-4 text-emerald-700" />
                    <h4 className="text-sm font-semibold text-text">Adicionar documento</h4>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Chave</span>
                      <input
                        value={documentDraft.document_key}
                        onChange={(event) => setDocumentDraft((current) => ({ ...current, document_key: event.target.value }))}
                        placeholder="cpf"
                        className="w-full rounded-2xl border border-border px-3 py-2"
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Título</span>
                      <input
                        value={documentDraft.title}
                        onChange={(event) => setDocumentDraft((current) => ({ ...current, title: event.target.value }))}
                        placeholder="CPF"
                        className="w-full rounded-2xl border border-border px-3 py-2"
                      />
                    </label>
                  </div>

                  <label className="mt-4 block space-y-1 text-sm">
                    <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                      Descrição pública
                    </span>
                    <textarea
                      value={documentDraft.candidate_description}
                      onChange={(event) =>
                        setDocumentDraft((current) => ({ ...current, candidate_description: event.target.value }))
                      }
                      rows={3}
                      className="w-full rounded-2xl border border-border px-3 py-2"
                    />
                  </label>

                  <div className="mt-4 grid gap-4 md:grid-cols-[1fr_220px]">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                        Tipos aceitos
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {FILE_TYPE_OPTIONS.map((option) => (
                          <label
                            key={option.value}
                            className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={documentDraft.accepted_file_types.includes(option.value)}
                              onChange={() =>
                                setDocumentDraft((current) => ({
                                  ...current,
                                  accepted_file_types: current.accepted_file_types.includes(option.value)
                                    ? current.accepted_file_types.filter((entry) => entry !== option.value)
                                    : [...current.accepted_file_types, option.value],
                                }))
                              }
                            />
                            {option.label}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-4">
                      <label className="block space-y-1 text-sm">
                        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                          Tamanho máximo (MB)
                        </span>
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
                          className="w-full rounded-2xl border border-border px-3 py-2"
                        />
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm font-medium text-text">
                        <input
                          type="checkbox"
                          checked={documentDraft.is_required}
                          onChange={(event) =>
                            setDocumentDraft((current) => ({ ...current, is_required: event.target.checked }))
                          }
                        />
                        Documento obrigatório
                      </label>
                    </div>
                  </div>

                  {documentError ? (
                    <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {documentError}
                    </p>
                  ) : null}

                  <div className="mt-4 flex justify-end">
                    <Button type="button" onClick={() => void handleAddDocument()} disabled={saving}>
                      <Plus className="mr-2 h-4 w-4" />
                      Adicionar documento
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
