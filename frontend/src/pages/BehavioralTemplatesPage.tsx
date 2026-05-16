import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, Plus, ChevronDown, ChevronRight, Layers } from "lucide-react";
import { behavioralTemplatesService } from "../services/behavioralTemplatesService";
import type { BehavioralAssessmentTemplate, BehavioralTemplateCompetency } from "../types/domain";
import { toast } from "@/shared/utils/toast";
import { TemplateGalleryModal } from "../features/behavioral-templates/TemplateGalleryModal";
import { importTemplateToApi, type RawTemplate } from "../features/behavioral-templates/templateImporter";

export function BehavioralTemplatesPage() {
  const [templates, setTemplates] = useState<BehavioralAssessmentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [importingName, setImportingName] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: "", description: "" });
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  async function handleSaveTemplate() {
    if (!formData.name.trim()) {
      toast.error("Nome do template é obrigatório");
      return;
    }

    try {
      if (editingId) {
        await behavioralTemplatesService.updateTemplate(editingId, formData);
        toast.success("Template atualizado");
      } else {
        await behavioralTemplatesService.createTemplate(formData);
        toast.success("Template criado");
      }
      setFormData({ name: "", description: "" });
      setEditingId(null);
      setIsFormOpen(false);
      await loadTemplates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar template");
    }
  }

  async function handleActivate(id: string) {
    try {
      await behavioralTemplatesService.activateTemplate(id);
      toast.success("Template ativado");
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

  function handleEdit(template: BehavioralAssessmentTemplate) {
    setFormData({ name: template.name, description: template.description || "" });
    setEditingId(template.id);
    setIsFormOpen(true);
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

  function handleCloseForm() {
    setFormData({ name: "", description: "" });
    setEditingId(null);
    setIsFormOpen(false);
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft":
        return "bg-gray-100 text-gray-800";
      case "active":
        return "bg-green-100 text-green-800";
      case "archived":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-500">Carregando templates...</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Templates Comportamentais</h1>
          <p className="mt-1 text-sm text-gray-500">Gerencie templates de avaliação com competências e perguntas</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setIsGalleryOpen(true)} variant="outline" className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Usar modelo pronto
          </Button>
          <Button onClick={() => setIsFormOpen(true)} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Novo Template
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-900">Erro</p>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {isFormOpen && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">
            {editingId ? "Editar Template" : "Novo Template"}
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Nome</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="ui-input mt-1"
                placeholder="Ex: Avaliação de Liderança"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Descrição</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="ui-input mt-1"
                placeholder="Descrição do template..."
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSaveTemplate} className="bg-blue-600 hover:bg-blue-700">
                Salvar
              </Button>
              <Button onClick={handleCloseForm} variant="outline">
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}

      {templates.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-500">Nenhum template criado ainda</p>
          <Button onClick={() => setIsFormOpen(true)} variant="ghost" className="mt-4">
            Criar primeiro template
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {templates.map((template) => (
            <div key={template.id} className="rounded-lg border border-gray-200 bg-white">
              <div
                className="flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-50"
                onClick={() => setExpandedId(expandedId === template.id ? null : template.id)}
              >
                {expandedId === template.id ? (
                  <ChevronDown className="h-5 w-5 text-gray-400" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{template.name}</h3>
                    <span className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(template.status)}`}>
                      {template.status}
                    </span>
                  </div>
                  {template.description && <p className="mt-1 text-sm text-gray-600">{template.description}</p>}
                  <div className="mt-2 flex gap-4 text-xs text-gray-500">
                    <span>{template.competency_count} competências</span>
                    <span>{template.question_count} perguntas</span>
                    <span>v{template.version}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  {template.status === "draft" && (
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleActivate(template.id);
                      }}
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                    >
                      Ativar
                    </Button>
                  )}
                  {template.status !== "archived" && (
                    <>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(template);
                        }}
                        size="sm"
                        variant="outline"
                      >
                        Editar
                      </Button>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleArchive(template.id);
                        }}
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:bg-red-50"
                      >
                        Arquivar
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {expandedId === template.id && (
                <div className="border-t border-gray-200 bg-gray-50 p-4">
                  <p className="text-sm text-gray-600">
                    {template.competencies && template.competencies.length > 0
                      ? `Competências: ${template.competencies.map((c: BehavioralTemplateCompetency) => c.name).join(", ")}`
                      : "Sem competências"}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

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
